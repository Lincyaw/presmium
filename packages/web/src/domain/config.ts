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

/** `renderers.web` of the frontmatter. */
export interface WebRendererConfig {
  /** Public base path of the site (default `/`). */
  base: string
  /** Port of the dev server (default: VitePress's). */
  port?: number
  /** Site language (default `zh-CN`). */
  lang: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
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

/** The web renderer's options from `renderers.web`. */
export function rendererConfig(config: Record<string, unknown>): WebRendererConfig {
  const base = typeof config.base === 'string' ? `/${config.base.replace(/^\/+|\/+$/g, '')}/`.replace('//', '/') : '/'
  const port = Number(config.port)
  return {
    base,
    port: Number.isInteger(port) && port > 0 ? port : undefined,
    lang: typeof config.lang === 'string' ? config.lang : 'zh-CN',
  }
}
