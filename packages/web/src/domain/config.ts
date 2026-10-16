import { isRecord } from '@presmium/kernel'
import { DEFAULT_LANG } from '@presmium/kernel/contracts'

/** Plugin id of the web renderer; its configuration is `presmium: { presmium.web: {...} }`. */
export const WEB_ID = 'presmium.web'

/** Links between the forms (P-74), shared with the slides form's "read on the web" button. */
export interface FormOptions {
  /** Whether the deck has a slides form to link to. */
  slides?: boolean
  /** Base URL of the slides form; default: the `slides` directory next to the web site. */
  slidesUrl?: string
  /** Base URL of the web form; default: the `web` directory next to the slides. */
  webUrl?: string
  /** Slidev `routerMode` of the slides form; `hash` puts slide numbers after `#/`. */
  routerMode?: 'history' | 'hash'
}

/** The web renderer's options. */
export interface WebRendererConfig {
  /** Public base path of the site, `/` or `/<path>/` (`RenderContext.base`: `renderers.web.base`, else `/web/` beside the slides). */
  base: string
  /** Port of the dev server (`renderers.web.port`; default: VitePress's). */
  port?: number
  /** Site language: the deck's `lang` (`IRDocument.meta.lang`), else `zh-CN`. */
  lang: string
}

function url(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().replace(/\/+$/, '') : undefined
}

/**
 * Form links from the deck's `presmium` configuration (`presmium.web`, also
 * accepted under the short key `web`) and its `renderers`: there is a slides
 * form when `slidesUrl` is set, `renderers.slides` is configured, or no
 * renderer is (then every installed renderer builds). The slides renderer's
 * `routerMode` shapes the slide URLs.
 */
export function formOptions(presmium: unknown, renderers?: unknown): FormOptions {
  const all = isRecord(presmium) ? presmium : {}
  const config = { ...(isRecord(all.web) ? all.web : {}), ...(isRecord(all[WEB_ID]) ? all[WEB_ID] : {}) }
  const configured = isRecord(renderers) ? renderers : {}
  const slides = configured.slides
  const slidesUrl = url(config.slidesUrl)
  return {
    slides: Boolean(slidesUrl) || slides !== undefined || Object.keys(configured).length === 0,
    slidesUrl,
    webUrl: url(config.webUrl),
    routerMode: isRecord(slides) && slides.routerMode === 'hash' ? 'hash' : 'history',
  }
}

/** Plugin id of the publishing context; its `offline: false` turns offline support off in every form. */
const PUBLISH_ID = 'presmium.publish'

/** Whether the site works offline (a service worker); `presmium: { presmium.publish: { offline: false } }` turns it off. */
export function offlineEnabled(presmium: unknown): boolean {
  const publish = isRecord(presmium) ? presmium[PUBLISH_ID] : undefined
  return !(isRecord(publish) && publish.offline === false)
}

/** The web renderer's options from its render context: `renderers.web` (`config`), the public `base` and the deck's `lang`. */
export function rendererConfig(ctx: { config: Record<string, unknown>, base: string, lang?: string }): WebRendererConfig {
  const port = Number(ctx.config.port)
  return {
    base: ctx.base,
    port: Number.isInteger(port) && port > 0 ? port : undefined,
    lang: ctx.lang || DEFAULT_LANG,
  }
}
