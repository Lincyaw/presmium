import { AUTHOR_MARKS_CLASS, errorMessage, escapeHtml } from '@presmium/kernel'
import 'katex/dist/katex.min.css'
import { computed, defineComponent, h, onMounted, ref, shallowRef, watch } from 'vue'
import { useSectionContext } from './context.ts'
import { useDark } from './dark.ts'

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

function tokenTheme(dark: boolean): Record<string, string | boolean> | undefined {
  const style = getComputedStyle(document.documentElement)
  const token = (name: string) => style.getPropertyValue(`--pm-color-${name}`).trim()
  const [ink, muted, surface, sunk, line, accent, accentSoft, warn, warnSoft] = ['ink', 'muted', 'surface', 'sunk', 'line', 'accent', 'accent-soft', 'warn', 'warn-soft'].map(token)
  if (!ink || !surface || !accent) return undefined
  return {
    darkMode: dark,
    background: surface,
    fontFamily: style.getPropertyValue('--pm-font-sans').trim() || 'sans-serif',
    textColor: ink,
    lineColor: muted!,
    primaryColor: accentSoft!,
    primaryTextColor: ink,
    primaryBorderColor: accent,
    secondaryColor: sunk!,
    secondaryTextColor: ink,
    secondaryBorderColor: line!,
    tertiaryColor: surface,
    tertiaryTextColor: ink,
    tertiaryBorderColor: line!,
    edgeLabelBackground: surface,
    clusterBkg: sunk!,
    clusterBorder: line!,
    titleColor: ink,
    noteBkgColor: warnSoft!,
    noteTextColor: ink,
    noteBorderColor: warn!,
    actorBkg: accentSoft!,
    actorBorder: accent,
    actorTextColor: ink,
    signalColor: ink,
    signalTextColor: ink,
    labelBoxBkgColor: sunk!,
    labelTextColor: ink,
    loopTextColor: ink,
  }
}

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
        const variables = tokenTheme(dark.value)
        const appearance = dark.value ? 'dark' : 'default'
        const theme = variables ? 'base' : appearance
        library.initialize({ startOnLoad: false, securityLevel: 'strict', theme, ...variables ? { themeVariables: variables } : {}, flowchart: { useMaxWidth: false } })
        const { svg } = await library.render(`pm-mermaid-${++diagrams}`, props.code)
        if (id !== latest) return
        drawn.value = { svg, theme: appearance }
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

const authorMarks = shallowRef(false)
let observed = false

function useAuthorMarks() {
  if (!observed && typeof document !== 'undefined') {
    observed = true
    const root = document.documentElement
    authorMarks.value = root.classList.contains(AUTHOR_MARKS_CLASS)
    new MutationObserver(() => {
      authorMarks.value = root.classList.contains(AUTHOR_MARKS_CLASS)
    }).observe(root, { attributes: true, attributeFilter: ['class'] })
  }
  return authorMarks
}

export const PmRoleMark = defineComponent({
  name: 'PmRoleMark',
  props: { mark: { type: String, required: true } },
  setup(props) {
    const section = useSectionContext()
    const marks = useAuthorMarks()
    const shown = computed(() => section?.view.value === 'presenter' || marks.value)
    return () => (shown.value ? h('span', { class: 'pm-role-mark' }, props.mark) : null)
  },
})
