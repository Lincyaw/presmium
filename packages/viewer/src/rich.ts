/**
 * Math (KaTeX) and diagrams (Mermaid). Math the host rendered when it
 * published the document (`html`) shows as it is, in the server render too;
 * other math and the diagrams are rendered in the browser after mount: the
 * server render and the first client render show the source text, so
 * hydration matches, and the libraries load on first use. A server render
 * never loads them (`import.meta.env.SSR`), so its build leaves them out.
 * KaTeX's stylesheet comes with the page, for the math rendered beforehand.
 */
import { EDIT_MODE, useService } from '@presmium/host'
import type { EditMode } from '@presmium/host'
import { errorMessage, escapeHtml } from '@presmium/kernel'
import 'katex/dist/katex.min.css'
import type { ComputedRef } from 'vue'
import { computed, defineComponent, h, onMounted, ref, watch } from 'vue'
import { useSectionContext } from './context.ts'
import { useDark } from './dark.ts'

/** A promise that never settles: what a library load gives in a server render. */
const never = <T>() => new Promise<T>(() => {})

type Katex = typeof import('katex').default

let katex: Promise<Katex> | undefined

function loadKatex(): Promise<Katex> {
  if (import.meta.env.SSR) return never()
  katex ??= import('katex').then(m => m.default)
  return katex
}

export const PmMath = defineComponent({
  name: 'PmMath',
  props: {
    tex: { type: String, required: true },
    display: Boolean,
    /** The math already rendered by KaTeX (e.g. by the web renderer, when it publishes the document). */
    html: { type: String, default: undefined },
  },
  setup(props) {
    const rendered = ref<string>()
    const render = async () => {
      if (props.html) return
      const { renderToString } = await loadKatex()
      rendered.value = renderToString(props.tex, { displayMode: props.display, throwOnError: false })
    }
    onMounted(render)
    watch(() => [props.tex, props.display, props.html], render)
    return () => {
      const html = props.html ?? rendered.value
      return h(props.display ? 'div' : 'span', {
        'class': ['pm-math', props.display ? 'pm-math--display' : 'pm-math--inline'],
        'data-rendered': html ? '' : undefined,
        'innerHTML': html ?? escapeHtml(props.tex),
      })
    }
  },
})

type Mermaid = typeof import('mermaid').default

let mermaid: Promise<Mermaid> | undefined
let diagrams = 0

function loadMermaid(): Promise<Mermaid> {
  if (import.meta.env.SSR) return never()
  mermaid ??= import('mermaid').then(m => m.default)
  return mermaid
}

/**
 * A Mermaid diagram, drawn in the browser (docs/ir.md section 8.1) in the
 * page's appearance, again when it changes. A flowchart keeps its natural
 * size, so its labels stay readable; a wide one scrolls sideways.
 */
export const PmMermaid = defineComponent({
  name: 'PmMermaid',
  props: { code: { type: String, required: true } },
  setup(props) {
    const drawn = ref<{ svg: string, theme: string }>()
    const failed = ref<string>()
    const dark = useDark()
    let latest = 0
    const render = async () => {
      const id = ++latest
      try {
        const library = await loadMermaid()
        const theme = dark.value ? 'dark' : 'default'
        // The configuration is global: set before each drawing, with the appearance of this one.
        library.initialize({ startOnLoad: false, securityLevel: 'strict', theme, flowchart: { useMaxWidth: false } })
        const { svg } = await library.render(`pm-mermaid-${++diagrams}`, props.code)
        if (id !== latest) return
        drawn.value = { svg, theme }
        failed.value = undefined
      } catch (error) {
        if (id === latest) failed.value = errorMessage(error)
      }
    }
    onMounted(render)
    watch(() => [props.code, dark.value], render)
    return () => h('div', {
      'class': ['pm-mermaid', { 'pm-mermaid--error': failed.value }],
      'data-rendered': drawn.value ? '' : undefined,
      'data-theme': drawn.value?.theme,
      'title': failed.value,
      'innerHTML': drawn.value?.svg ?? `<pre>${escapeHtml(props.code)}</pre>`,
    })
  },
})

/**
 * The mark of a registered role without children (docs/ir.md 2.8, 6.4), e.g.
 * where a `{cue}` stands: `〔<name> <value>〕`, shown only in the presenter
 * window and in edit mode (`EDIT_MODE`), so the author sees where the marks
 * are; elsewhere it renders nothing.
 */
export const PmRoleMark = defineComponent({
  name: 'PmRoleMark',
  props: { mark: { type: String, required: true } },
  setup(props) {
    const section = useSectionContext()
    // Outside a host (a render of the viewer alone) there is no edit mode.
    let editMode: ComputedRef<EditMode | undefined> | undefined
    try {
      editMode = useService(EDIT_MODE)
    } catch {
      editMode = undefined
    }
    const shown = computed(() => section?.view.value === 'presenter' || editMode?.value?.active.value === true)
    return () => (shown.value ? h('span', { class: 'pm-role-mark' }, props.mark) : null)
  },
})
