/** Id under which the web form reads its options from `presmium` config. */
export const WEB_ID = 'presmium.web'

/** `document` (default) shows every step; `scrolly` pins the slide and advances steps as the notes scroll. */
export type SectionLayout = 'document' | 'scrolly'

export interface WebOptions {
  /** Base URL of the slides form, for "open in slides" links. */
  slidesUrl?: string
  /** Base URL of the web form, for the "read on the web" button of the slides form. */
  webUrl?: string
  /** Slidev `routerMode` of the deck; `hash` puts slide numbers after `#/`. */
  routerMode?: 'history' | 'hash'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * The web options of one head- or frontmatter: `presmium: { presmium.web: {...} }`,
 * also accepted under the short key `presmium: { web: {...} }`.
 */
export function webConfig(matter: unknown): Record<string, unknown> {
  const presmium = isRecord(matter) && isRecord(matter.presmium) ? matter.presmium : {}
  return {
    ...(isRecord(presmium.web) ? presmium.web : {}),
    ...(isRecord(presmium[WEB_ID]) ? presmium[WEB_ID] : {}),
  }
}

function url(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().replace(/\/+$/, '') : undefined
}

/**
 * Deck-wide web options. Each URL comes from the headmatter, or else from the
 * first page frontmatter that declares it.
 */
export function webOptions(matters: unknown[]): WebOptions {
  const configs = matters.map(webConfig)
  const first = (key: string) => configs.map(c => url(c[key])).find(Boolean)
  const head = matters[0]
  const routerMode = isRecord(head) && head.routerMode === 'hash' ? 'hash' : 'history'
  return { slidesUrl: first('slidesUrl'), webUrl: first('webUrl'), routerMode }
}

/** A slide's layout in the web form: its frontmatter, else the headmatter, else `document`. */
export function sectionLayout(frontmatter: unknown, headmatter: unknown): SectionLayout {
  const layout = webConfig(frontmatter).layout ?? webConfig(headmatter).layout
  return layout === 'scrolly' ? 'scrolly' : 'document'
}
