import { useAppearance } from '@lincyaw/host'
import { errorMessage, escapeHtml } from '@lincyaw/kernel'
import { defineComponent, h, onMounted, ref, watch } from 'vue'

type Mermaid = typeof import('mermaid').default

let mermaid: Promise<Mermaid> | undefined
let diagrams = 0

function loadMermaid(): Promise<Mermaid> {
  if (import.meta.env.SSR) return new Promise(() => {})
  mermaid ??= import('mermaid').then(m => m.default)
  return mermaid
}

/** Mermaid's theme variables from the page's design tokens; undefined when the page has none. */
function mermaidThemeVariables(dark: boolean): Record<string, string | boolean> | undefined {
  const style = getComputedStyle(document.documentElement)
  const colorToken = (name: string) => style.getPropertyValue(`--pm-color-${name}`).trim()
  const [ink, muted, surface, sunk, line, accent, accentSoft, warn, warnSoft] = ['ink', 'muted', 'surface', 'sunk', 'line', 'accent', 'accent-soft', 'warn', 'warn-soft'].map(colorToken)
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
    const { dark } = useAppearance()
    let latest = 0
    const render = async () => {
      const id = ++latest
      try {
        const library = await loadMermaid()
        const variables = mermaidThemeVariables(dark.value)
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
