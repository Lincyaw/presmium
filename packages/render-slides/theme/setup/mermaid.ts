const LABELS = `
.edgeLabel, .edgeLabel p, .edgeLabel span, .labelBkg { background-color: var(--pm-color-surface) !important; color: var(--pm-color-ink) !important; }
.edgeLabel rect { fill: var(--pm-color-surface) !important; }
.edgeLabel text, .edgeLabel tspan { fill: var(--pm-color-ink) !important; }
`

export default function setup() {
  return { themeCSS: LABELS }
}
