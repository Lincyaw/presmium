const DIAGRAM = 'svg[aria-roledescription]'

function rules(scope: string): string {
  const fg = 'var(--pm-contrast-fg)'
  const bg = 'var(--pm-contrast-bg)'
  return `
${scope}, ${scope} * { color: ${fg} !important; }
${scope} :is(text, tspan) { fill: ${fg} !important; stroke: none !important; }
${scope} :is(.edgeLabel, .edgeLabel *, .labelBkg) { background-color: ${bg} !important; }
${scope} :is(rect, polygon, circle, ellipse):not(marker *) { fill: ${bg} !important; stroke: ${fg} !important; }
${scope} path:not(marker *) { stroke: ${fg} !important; }
${scope} marker * { fill: ${fg} !important; stroke: ${fg} !important; }
`
}

let shadowSheet: CSSStyleSheet | undefined

const supported = () => typeof CSSStyleSheet !== 'undefined' && 'adoptedStyleSheets' in Document.prototype

function adopt(host: Element): void {
  const shadow = host.shadowRoot
  if (shadow && shadowSheet && !shadow.adoptedStyleSheets.includes(shadowSheet)) {
    shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, shadowSheet]
  }
}

export function adoptShadows(node: Node): void {
  if (!shadowSheet || !(node instanceof Element || node instanceof Document)) return
  if (node instanceof Element) adopt(node)
  for (const host of node.querySelectorAll('*')) {
    if (host.shadowRoot) adopt(host)
  }
}

export function styleDiagrams(on: boolean): void {
  if (!supported()) return
  if (!shadowSheet) {
    shadowSheet = new CSSStyleSheet()
    const page = new CSSStyleSheet()
    page.replaceSync(rules(`:root[data-pm-contrast='high'] :is(.slidev-layout, .vp-doc) ${DIAGRAM}`))
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, page]
  }
  shadowSheet.replaceSync(on ? rules(DIAGRAM) : '')
  if (on) adoptShadows(document)
}
