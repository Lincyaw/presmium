import type { WebOptions } from './config.ts'

/** Form link: a slide number and the site-relative link of its web section, e.g. `/core#宿主适配`. */
export interface FormLink {
  slide: number
  link: string
}

/** Service worker of a web build, at the site root; it keeps pages and search available offline. */
export const SERVICE_WORKER = 'presmium-sw.js'

/** Query parameter that asks the web form to open the section of a slide. */
export const SLIDE_PARAM = 'slide'

/** URL of a slide (and optionally a step) in the slides form; undefined without `slidesUrl`. */
export function slideUrl(options: WebOptions, slide: number, step = 0): string | undefined {
  if (!options.slidesUrl) return undefined
  const path = `${options.routerMode === 'hash' ? '/#/' : '/'}${slide}`
  return `${options.slidesUrl}${path}${step > 0 ? `?clicks=${step}` : ''}`
}

/** URL that opens a slide's section in the web form; undefined without `webUrl`. */
export function webUrl(options: WebOptions, slide: number): string | undefined {
  return options.webUrl ? `${options.webUrl}/?${SLIDE_PARAM}=${slide}` : undefined
}

/** The section link requested by a `?slide=N` query string, if any. */
export function requestedSection(search: string, links: readonly FormLink[]): string | undefined {
  const slide = Number(new URLSearchParams(search).get(SLIDE_PARAM))
  return links.find(l => l.slide === slide)?.link
}
