import { EMBED_MESSAGE } from '@lincyaw/kernel'
import type { EmbedState } from '@lincyaw/kernel'

/**
 * For a site template's own page (`site.landing`) that plays the site's presentations in a frame: fetching one ahead
 * of the reader's click, and knowing when the one in a frame is ready to be seen. A presentation tells the page that
 * embeds it its state (`EMBED_MESSAGE`): whether its scene is drawn, and its lecture's state.
 */

export type { EmbedState } from '@lincyaw/kernel'
/** The site's content, as the page finds it in its `presmium-site-data` script. */
export type { SiteContent, SiteContentDocument } from '../domain/landing.ts'

const prefetched = new Map<string, Promise<void>>()
// The files already asked for: presentations of one site share their viewer app.
const files = new Set<string>()

/**
 * Prefetches what the presentation's page at `url` preloads (the viewer app, the document's IR and scenes), once, so
 * that it opens without waiting for them. Nothing is fetched when the reader asked to save data.
 */
export function prefetchPresentation(url: string): Promise<void> {
  const page = new URL(url, location.href).href
  if ((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData) return Promise.resolve()
  let done = prefetched.get(page)
  if (!done) {
    done = fetch(page).then(response => (response.ok ? response.text() : '')).then((html) => {
      const links = new DOMParser().parseFromString(html, 'text/html').querySelectorAll<HTMLLinkElement>('link[rel="modulepreload"], link[rel="preload"], link[rel="stylesheet"]')
      for (const link of links) {
        const href = new URL(link.getAttribute('href')!, page).href
        if (files.has(href)) continue
        files.add(href)
        document.head.append(Object.assign(document.createElement('link'), { rel: 'prefetch', href }))
      }
    }).catch(() => {})
    prefetched.set(page, done)
  }
  return done
}

/** A lecture past loading: playing, paused, waiting for the reader's click where autoplay was refused, or failed. */
const SETTLED = new Set<EmbedState['lecture']>(['waiting', 'playing', 'paused', 'failed'])

/**
 * Calls `ready` once, when the presentation in `frame` has drawn its scene and, with `lecture`, its lecture has settled.
 * Returns a function that stops watching.
 */
export function whenPresentationReady(frame: HTMLIFrameElement, ready: () => void, { lecture = false }: { lecture?: boolean } = {}): () => void {
  const listen = (event: MessageEvent<Partial<EmbedState>>) => {
    if (event.source !== frame.contentWindow || event.data?.type !== EMBED_MESSAGE) return
    if (!event.data.drawn || (lecture && !SETTLED.has(event.data.lecture))) return
    stop()
    ready()
  }
  const stop = () => removeEventListener('message', listen)
  addEventListener('message', listen)
  return stop
}
