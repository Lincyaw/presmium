import { isRecord } from '@lincyaw/kernel'
import { DEFAULT_LANG } from '@lincyaw/kernel/contracts'

export const WEB_ID = 'presmium.web'

/** The settings that link the web form and the slides to each other. */
export interface CrossFormLinks {
  /** The document has slides: at `slidesUrl`, else beside its web form (`../slides`). */
  slides?: boolean
  slidesUrl?: string
  /** The document has a web form: at `webUrl`, else beside its slides (`../web`). */
  web?: boolean
  webUrl?: string
}

export interface NavItem {
  text: string
  link?: string
  items?: NavItem[]
}

export interface SiteShell {
  nav?: NavItem[]
  footer?: { message?: string, copyright?: string }
  head?: { description?: string, image?: string }
  sitemap?: { hostname: string }
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function navItems(value: unknown): NavItem[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): NavItem[] => {
    if (!isRecord(item) || !text(item.text)) return []
    const items = navItems(item.items)
    const link = text(item.link)
    return link || items.length > 0 ? [{ text: text(item.text)!, ...link ? { link } : {}, ...items.length > 0 ? { items } : {} }] : []
  })
}

export function siteShell(config: Record<string, unknown>): SiteShell {
  const shell: SiteShell = {}
  const nav = navItems(config.nav)
  if (nav.length > 0) shell.nav = nav
  if (isRecord(config.footer)) {
    const footer = { message: text(config.footer.message), copyright: text(config.footer.copyright) }
    if (footer.message || footer.copyright) shell.footer = Object.fromEntries(Object.entries(footer).filter(([, v]) => v)) as SiteShell['footer']
  }
  if (isRecord(config.head)) {
    const head = { description: text(config.head.description), image: text(config.head.image) }
    if (head.description || head.image) shell.head = Object.fromEntries(Object.entries(head).filter(([, v]) => v)) as SiteShell['head']
  }
  const hostname = isRecord(config.sitemap) ? text(config.sitemap.hostname) : undefined
  if (hostname) shell.sitemap = { hostname: hostname.replace(/\/+$/, '') }
  return shell
}

export interface WebRendererConfig {
  base: string
  port?: number
  lang: string
  server?: string
  shell: SiteShell
}

function url(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim().replace(/\/+$/, '') : undefined
}

export function crossFormLinks(presmium: unknown, renderers?: unknown): CrossFormLinks {
  const all = isRecord(presmium) ? presmium : {}
  const config = { ...(isRecord(all.web) ? all.web : {}), ...(isRecord(all[WEB_ID]) ? all[WEB_ID] : {}) }
  const configured = isRecord(renderers) ? renderers : {}
  const slides = configured.slides
  const slidesUrl = url(config.slidesUrl)
  const webUrl = url(config.webUrl)
  const none = Object.keys(configured).length === 0
  return {
    slides: Boolean(slidesUrl) || slides !== undefined || none,
    slidesUrl,
    web: Boolean(webUrl) || configured.web !== undefined || none,
    webUrl,
  }
}

const PUBLISH_ID = 'presmium.publish'

export function offlineEnabled(presmium: unknown): boolean {
  const publish = isRecord(presmium) ? presmium[PUBLISH_ID] : undefined
  return !(isRecord(publish) && publish.offline === false)
}

export function rendererConfig(ctx: { config: Record<string, unknown>, base: string, lang?: string, server?: { url: string } }): WebRendererConfig {
  const port = Number(ctx.config.port)
  return {
    base: ctx.base,
    port: Number.isInteger(port) && port > 0 ? port : undefined,
    lang: ctx.lang || DEFAULT_LANG,
    ...ctx.server ? { server: ctx.server.url } : {},
    shell: siteShell(ctx.config),
  }
}
