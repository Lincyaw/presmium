/**
 * Math (KaTeX) and diagrams (Mermaid), rendered in the browser after mount.
 * The server render and the first client render show the source text, so
 * hydration matches; the libraries load on first use.
 */
import { defineComponent, h, onMounted, ref, watch } from 'vue'

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

type Katex = typeof import('katex').default

let katex: Promise<Katex> | undefined

function loadKatex(): Promise<Katex> {
  katex ??= Promise.all([import('katex'), import('katex/dist/katex.min.css')]).then(([m]) => m.default)
  return katex
}

export const PmMath = defineComponent({
  name: 'PmMath',
  props: {
    tex: { type: String, required: true },
    display: Boolean,
  },
  setup(props) {
    const html = ref<string>()
    const render = async () => {
      const { renderToString } = await loadKatex()
      html.value = renderToString(props.tex, { displayMode: props.display, throwOnError: false })
    }
    onMounted(render)
    watch(() => [props.tex, props.display], render)
    return () => h(props.display ? 'div' : 'span', {
      'class': ['pm-math', props.display ? 'pm-math--display' : 'pm-math--inline'],
      'data-rendered': html.value ? '' : undefined,
      'innerHTML': html.value ?? escape(props.tex),
    })
  },
})

type Mermaid = typeof import('mermaid').default

let mermaid: Promise<Mermaid> | undefined
let diagrams = 0

function loadMermaid(): Promise<Mermaid> {
  mermaid ??= import('mermaid').then((m) => {
    m.default.initialize({ startOnLoad: false, securityLevel: 'strict', theme: document.documentElement.classList.contains('dark') ? 'dark' : 'default' })
    return m.default
  })
  return mermaid
}

/** A Mermaid diagram, drawn in the browser (docs/ir.md section 8.1). */
export const PmMermaid = defineComponent({
  name: 'PmMermaid',
  props: { code: { type: String, required: true } },
  setup(props) {
    const svg = ref<string>()
    const failed = ref<string>()
    const render = async () => {
      try {
        const { svg: drawn } = await (await loadMermaid()).render(`pm-mermaid-${++diagrams}`, props.code)
        svg.value = drawn
        failed.value = undefined
      } catch (error) {
        failed.value = error instanceof Error ? error.message : String(error)
      }
    }
    onMounted(render)
    watch(() => props.code, render)
    return () => h('div', {
      'class': ['pm-mermaid', { 'pm-mermaid--error': failed.value }],
      'data-rendered': svg.value ? '' : undefined,
      'title': failed.value,
      'innerHTML': svg.value ?? `<pre>${escape(props.code)}</pre>`,
    })
  },
})
