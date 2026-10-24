import { safeDecodeURIComponent } from '@lincyaw/kernel'
import type { IRDocument } from '@lincyaw/kernel'
import type { Position } from '@lincyaw/viewer/domain'
import type { ComputedRef, Ref } from 'vue'
import { computed, nextTick, ref } from 'vue'
import { pageLink, sectionLinks, webPages } from '../domain/index.ts'
import type { AppConfig, WebPage } from '../domain/index.ts'

/**
 * The pages of the document shown: one chapter at a time, as the web form pages it. A site's pages have addresses of
 * their own (`index.html`, `<chapter>.html` below the page's language), followed in the browser's history without
 * loading the page again; the workbench's page keeps its one address and turns pages in place.
 */
export interface PageRouter {
  /** The path of the page shown (`index` or a chapter's). */
  page: Ref<string>
  pages: ComputedRef<WebPage[]>
  shown: ComputedRef<WebPage | undefined>
  /** The site path of the page's language, ending with `/`: the document's, or a translation's. */
  root: string
  href(page: WebPage): string
  sectionHref(id: string): string
  /** Shows the page of `position`'s section. */
  turnTo(position: Position, restoring: boolean): void
  /** Follows the links to the document's own pages and the browser's back and forward; returns the function that stops. */
  listen(): () => void
}

/** The router of `config`'s page; `doc` gives the document as it is now. */
export function createPageRouter(config: AppConfig, doc: () => IRDocument, history: boolean): PageRouter {
  const root = config.site.locales.find(locale => locale.lang === config.lang)?.base ?? config.base
  const prefix = root.replace(/\/$/, '')
  const pages = computed(() => config.pages ?? webPages(doc()))
  const page = ref(config.page ?? 'index')
  const shown = computed(() => pages.value.find(p => p.path === page.value) ?? pages.value[0])
  const links = computed(() => sectionLinks(pages.value, prefix))
  const href = (target: WebPage) => pageLink(target, prefix)

  /** The page at a path of the site, if it is one of this document's in this language. */
  const pageAt = (pathname: string): WebPage | undefined => {
    if (!pathname.startsWith(root) && `${pathname}/` !== root) return undefined
    const rest = safeDecodeURIComponent(pathname.slice(root.length))
    const name = rest === '' || rest === 'index.html' ? 'index' : rest.endsWith('.html') ? rest.slice(0, -'.html'.length) : undefined
    return name === undefined ? undefined : pages.value.find(p => p.path === name)
  }

  const show = async (target: WebPage, hash: string) => {
    page.value = target.path
    await nextTick()
    const anchor = hash ? document.getElementById(safeDecodeURIComponent(hash.slice(1))) : null
    if (anchor) anchor.scrollIntoView()
    else window.scrollTo(0, 0)
  }

  return {
    page,
    pages,
    shown,
    root,
    href,
    sectionHref: id => (history ? links.value[id] ?? `${href(pages.value[0]!)}#${encodeURIComponent(id)}` : `#${encodeURIComponent(id)}`),
    turnTo(position, restoring) {
      const target = pages.value.find(p => p.sections.includes(position.section))
      if (!target || target.path === page.value) return
      page.value = target.path
      if (history) window.history.pushState(null, '', href(target))
      if (!restoring) void nextTick(() => window.scrollTo(0, 0))
    },
    listen() {
      if (!history) return () => undefined
      const onClick = (event: MouseEvent) => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        const link = (event.target as Element | null)?.closest?.('a[href]')
        if (!(link instanceof HTMLAnchorElement) || (link.target && link.target !== '_self') || link.hasAttribute('download')) return
        const url = new URL(link.href, location.href)
        if (url.origin !== location.origin) return
        const target = pageAt(url.pathname)
        // The same page with an anchor: the browser goes to it, and the page view follows the address's fragment.
        if (!target || target.path === page.value) return
        event.preventDefault()
        window.history.pushState(null, '', url.href)
        void show(target, url.hash)
      }
      const onPop = () => {
        const target = pageAt(location.pathname)
        if (target && target.path !== page.value) void show(target, location.hash)
      }
      document.addEventListener('click', onClick)
      window.addEventListener('popstate', onPop)
      return () => {
        document.removeEventListener('click', onClick)
        window.removeEventListener('popstate', onPop)
      }
    },
  }
}
