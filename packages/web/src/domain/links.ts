import type { IRDocument } from '@presmium/kernel'
import type { FormOptions } from './config.ts'

/**
 * A file path as a URL path, as browsers write it: each character a URL
 * cannot hold escaped, and `#` and `?`, which would end the path, too.
 * The service worker caches the URLs a page asks for by this spelling.
 */
export function urlPath(path: string): string {
  return encodeURI(path).replace(/[#?]/g, char => encodeURIComponent(char))
}

/** Service worker of a web build, at the site root; it keeps pages and search available offline. */
export const SERVICE_WORKER = 'presmium-sw.js'

/** Dev server endpoint that opens a source file of the deck in the author's editor: `?file=<relative path>&line=<n>`. */
export const SOURCE_ENDPOINT = '/__presmium/source'

/** Dev server endpoint that gives the document now, with its revision: `{ revision, doc }`. */
export const IR_ENDPOINT = '/__presmium/ir'

/** Query parameter that asks the web form to open the section of a slide (from the slides form). */
export const SLIDE_PARAM = 'slide'

/**
 * URL of a slide (and optionally a step) in the slides form; slide numbers
 * are section numbers. `slidesUrl` is the configured or default base URL.
 */
export function slideUrl(slidesUrl: string, options: FormOptions, slide: number, step = 0): string {
  const path = `${options.routerMode === 'hash' ? '/#/' : '/'}${slide}`
  return `${slidesUrl}${path}${step > 0 && Number.isFinite(step) ? `?clicks=${step}` : ''}`
}

/** URL that opens the section of a slide in the web form, at a step of the section. */
export function webUrl(webBase: string, slide: number, step = 0): string {
  return `${webBase}/?${SLIDE_PARAM}=${slide}${step > 0 ? `&step=${step}` : ''}`
}

/** The query parameters by which a URL asks for a position and a view (see `requested`). */
const POSITION_PARAMS = [SLIDE_PARAM, 'section', 'step', 'view']

/**
 * The query `search` of a page with the position it asks for replaced: by
 * `position` while an overlay view (the present view, the presenter window)
 * shows it, so a reload, or a browser that restores the tab, opens it again
 * (P-77); by nothing for a page view. Other parameters stay.
 */
export function viewSearch(search: string, position?: { view: string, section: string, step: number }): string {
  const params = new URLSearchParams(search)
  for (const name of POSITION_PARAMS) params.delete(name)
  if (position) {
    params.set('view', position.view)
    params.set('section', position.section)
    params.set('step', String(position.step))
  }
  const query = params.toString()
  return query ? `?${query}` : ''
}

/** What a URL asks the web form to show: `?slide=N` or `?section=<id>`, with `&step=<n>`, and `?view=<id>`. */
export interface Requested {
  section?: string
  step?: number
  view?: string
}

export function requested(search: string, doc: IRDocument): Requested {
  const params = new URLSearchParams(search)
  const slide = Number(params.get(SLIDE_PARAM))
  const section = params.get('section') ?? doc.sections[slide - 1]?.id
  const step = Number(params.get('step'))
  return {
    section: doc.sections.some(s => s.id === section) ? section! : undefined,
    step: Number.isInteger(step) && step >= 0 ? step : undefined,
    view: params.get('view') ?? undefined,
  }
}
