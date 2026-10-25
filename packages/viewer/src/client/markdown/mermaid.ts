import { useAppearance } from '@lincyaw/host'
import { errorMessage, escapeHtml } from '@lincyaw/kernel'
import { useEffect, useState } from 'react'
import { h } from '../element.ts'

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

export function PmMermaid({ code }: { code: string }) {
  const [drawn, setDrawn] = useState<{ svg: string, theme: string }>()
  const [failed, setFailed] = useState<string>()
  const { dark } = useAppearance()
  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const library = await loadMermaid()
        const variables = mermaidThemeVariables(dark)
        const appearance = dark ? 'dark' : 'default'
        library.initialize({ startOnLoad: false, securityLevel: 'strict', theme: variables ? 'base' : appearance, ...variables ? { themeVariables: variables } : {}, flowchart: { useMaxWidth: false } })
        const { svg } = await library.render(`pm-mermaid-${++diagrams}`, code)
        if (active) { setDrawn({ svg, theme: appearance }); setFailed(undefined) }
      } catch (error) { if (active) setFailed(errorMessage(error)) }
    })()
    return () => { active = false }
  }, [code, dark])
  return h('div', { className: `pm-mermaid${failed ? ' pm-mermaid--error' : ''}`, 'data-rendered': drawn ? '' : undefined, 'data-theme': drawn?.theme, title: failed, innerHTML: drawn?.svg ?? `<pre>${escapeHtml(code)}</pre>` })
}
