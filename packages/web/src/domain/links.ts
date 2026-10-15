import type { IRDocument } from '@presmium/kernel'
import type { FormOptions } from './config.ts'

/** Service worker of a web build, at the site root; it keeps pages and search available offline. */
export const SERVICE_WORKER = 'presmium-sw.js'

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

/** URL that opens the section of a slide in the web form. */
export function webUrl(webBase: string, slide: number): string {
  return `${webBase}/?${SLIDE_PARAM}=${slide}`
}

/** What a URL asks the web form to show: `?slide=N`, or `?section=<id>&step=<n>`, and `?view=<id>`. */
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
