/**
 * Diagrams in high contrast (P-52). Mermaid draws its own colors into each
 * SVG (in the slides form, inside a shadow root that the page's CSS does not
 * reach), and its dark theme labels fall below AA. In high contrast these
 * rules draw diagrams in the two colors of contrast.css: text and lines in the
 * foreground, shapes and labels filled with the background.
 */
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

/** Rules for the diagrams in shadow roots; empty while the mode is off. */
let shadowSheet: CSSStyleSheet | undefined

function adopt(host: Element): void {
  const shadow = host.shadowRoot
  if (shadow && shadowSheet && !shadow.adoptedStyleSheets.includes(shadowSheet)) {
    shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, shadowSheet]
  }
}

function adoptAll(root: Element | Document): void {
  if (root instanceof Element) adopt(root)
  for (const host of root.querySelectorAll('*')) {
    if (host.shadowRoot) adopt(host)
  }
}

/**
 * Starts styling diagrams: the page's own diagrams through a document-wide
 * sheet, the ones in open shadow roots through a sheet adopted by every
 * shadow root that appears. `on` switches the shadow sheet's rules.
 */
export function styleDiagrams(on: boolean): void {
  if (typeof CSSStyleSheet === 'undefined' || !('adoptedStyleSheets' in Document.prototype)) return
  if (!shadowSheet) {
    shadowSheet = new CSSStyleSheet()
    const page = new CSSStyleSheet()
    page.replaceSync(rules(`:root[data-pm-contrast='high'] :is(.slidev-layout, .vp-doc) ${DIAGRAM}`))
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, page]
    // A shadow root is attached when its host mounts, before this observer runs.
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element) adoptAll(node)
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true })
    adoptAll(document)
  }
  shadowSheet.replaceSync(on ? rules(DIAGRAM) : '')
}
