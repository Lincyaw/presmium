// Mermaid's diagrams in 书卷 (vendor/docs/slidev/custom/config-mermaid.md). Slidev draws a diagram with Mermaid's
// `default` theme, or its `dark` theme in the dark scheme, in a shadow root; the dark theme draws an edge's label at
// 4.4:1, below WCAG AA. Mermaid's `themeCSS` goes into each diagram: the labels take the host's tokens, which the
// shadow root inherits from the page and which follow the scheme (`dark` on <html>), so they read at AA in both. The
// default export is the setup function; `defineMermaidSetup` would only type it.

const LABELS = `
.edgeLabel, .edgeLabel p, .edgeLabel span, .labelBkg { background-color: var(--pm-color-surface) !important; color: var(--pm-color-ink) !important; }
.edgeLabel rect { fill: var(--pm-color-surface) !important; }
.edgeLabel text, .edgeLabel tspan { fill: var(--pm-color-ink) !important; }
`

export default function setup() {
  return { themeCSS: LABELS }
}
