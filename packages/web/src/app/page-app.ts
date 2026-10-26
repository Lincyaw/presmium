import { createSharedStates, installHost, HostProvider, createStore, useStore, presmiumReport, presmiumService, setSiteBase } from '@lincyaw/host'
import type { HostAdapter, SharedStates, Store } from '@lincyaw/host'
import { deckLocale, irBlocks } from '@lincyaw/kernel'
import type { IRDocument } from '@lincyaw/kernel'
import { createViewer, ViewerProvider, BlockPreview, OverlayViewOutlet, PageViewOutlet, registerComponent, SlidesPrint } from '@lincyaw/viewer'
import type { Viewer } from '@lincyaw/viewer'
import { FINAL_STEP } from '@lincyaw/viewer/domain'
import { createElement as h, useEffect } from 'react'
import type { ReactElement } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { positionUrl, WEB_MESSAGES, withPositionQuery } from '../domain/index.ts'
import type { AppConfig, SlidesPrintQuery } from '../domain/index.ts'
import { createWebHostAdapter } from '../client/host.ts'
import { clientOnly } from '../client/runtime.ts'
import { createPageRouter } from './router.ts'
import type { PageRouter } from './router.ts'
import { MissingPage, WorkspaceHome } from './site/home.tsx'
import { DocumentSite } from './site/layout.tsx'

/**
 * A page of the web form as a React app: a document's page (on its site, or alone on the workbench's canvas), the
 * workspace's home page, or a missing page. The browser mounts it (`main.ts`), a build renders it to HTML first
 * (`server.ts`), and the browser then hydrates that HTML.
 */

export interface PageAppInput {
  config: AppConfig
  /** The document of a document's page. */
  doc?: IRDocument
  /** The components the document can show, by name, loaded once shown. */
  components: Record<string, () => Promise<unknown>>
  /** A workbench's preview: the document alone, as a page on the editor's canvas. */
  embedded: boolean
  /** Rendered on the server, or hydrating what it rendered. */
  ssr: boolean
  /** Whether the page is dark. */
  dark: Store<boolean>
  /** The slides printed one after the other (an export). */
  print?: SlidesPrintQuery
}

export interface PageApp {
  app: { element: ReactElement, mount(selector: string): Promise<void> }
  shared: SharedStates
  /** Whether the page shows its content: a paused preview shows none. */
  active: Store<boolean>
  viewer?: Viewer
  router?: PageRouter
}

/** The host of a page that shows no document: no position, no steps. */
function pageHostAdapter(lang: string, shared: SharedStates, dark: Store<boolean>): HostAdapter {
  return { mode: 'document', lang, useCursor: () => ({ slide: 1, step: 0 }), useStep: () => FINAL_STEP, useViewRole: () => 'reader', useStaticRender: () => false, useSectionConfig: () => ({}), useSharedState(key, initial, scope) { const store = shared.sharedState(key, initial, scope); return [useStore(store), value => store.set(value)] }, sharedStateStore: shared.sharedState, getService: presmiumService, startReport: presmiumReport, useDarkMode: () => [useStore(dark), value => dark.set(value)] }
}
function pageRoot(element: ReactElement, hydrate: boolean) { return { element, mount(selector: string): Promise<void> { return new Promise(resolve => { function Mounted() { useEffect(() => { resolve() }, []); return element }; const root = document.querySelector(selector)!; if (hydrate) hydrateRoot(root, h(Mounted)); else createRoot(root).render(h(Mounted)) }) } } }
function PreviewSheet({ viewer }: { viewer: Viewer }) { const doc = useStore(viewer.doc); return h('div', { className: 'pm-sheet-canvas' }, h('article', { className: 'pm-sheet' }, h(PageViewOutlet, { sections: doc.sections.map(section => section.id) })), h('div', { className: 'pm-document pm-overlay-views' }, h(OverlayViewOutlet))) }

function slideIcon() {
  return h('svg', { 'className': 'pm-ui-icon', 'viewBox': '0 0 24 24', 'aria-hidden': 'true', 'fill': 'none', 'stroke': 'currentColor', 'strokeWidth': 2, 'strokeLinecap': 'round', 'strokeLinejoin': 'round' }, [
    h('rect', { x: 2, y: 3, width: 20, height: 14, rx: 2 }),
    h('path', { d: 'M8 21h8M12 17v4' }),
  ])
}

/** Where the document's slides are, when it has them: the address it names, or the `slides/` beside its web form. */
function slidesBase(config: AppConfig): string | undefined {
  const { links } = config.site
  if (!links.slides) return undefined
  return links.slidesUrl ?? new URL('../slides', new URL(config.base, 'http://site')).pathname
}

/** Where the document's web form is, when it has one: the address it names, or the `web/` beside its slides. */
function webBase(config: AppConfig): string | undefined {
  const { links } = config.site
  if (!links.web) return undefined
  return links.webUrl ?? new URL('../web', new URL(config.base, 'http://site')).pathname
}

export function createPageApp(input: PageAppInput): PageApp {
  const { config, embedded, dark } = input
  setSiteBase(config.base)
  const shared = createSharedStates(input.doc ? input.doc.meta.title : `${config.site.title} (home)`)
  const active = createStore(true)
  if (!input.doc || config.kind !== 'document') {
    const Root = config.kind === 'missing' ? MissingPage : WorkspaceHome
    const adapter = pageHostAdapter(config.lang, shared, dark)
    installHost(adapter)
    const app = pageRoot(h(HostProvider, { adapter }, h(Root, { config })), input.ssr)
    return { app, shared, active }
  }

  const initial = input.doc
  const slides = !config.block && config.form === 'slides'
  // The router pages the document as the viewer has it now (a dev server's changes come to the viewer).
  let current: Viewer | undefined
  const router = config.block ? undefined : createPageRouter(config, () => current?.doc.getSnapshot() ?? initial, !embedded)
  const slidesUrl = embedded || slides ? undefined : slidesBase(config)
  const webUrl = embedded || !slides ? undefined : webBase(config)
  const t = WEB_MESSAGES[deckLocale(config.lang)]
  const viewer = current = createViewer(initial, {
    renderer: 'web',
    documentIdentity: JSON.stringify([config.base, config.document]),
    editingActive: createStore(true),
    sectionHref: router?.sectionHref,
    slidesOnly: slides,
    ...webUrl
      ? {
          pageLink: (position: { section: string, step: number }) => {
            const index = (current?.doc.getSnapshot() ?? initial).sections.findIndex(s => s.id === position.section) + 1
            return { href: positionUrl(webUrl, Math.max(index, 1), position.step), label: t.readOnWeb }
          },
        }
      : {},
    sectionHeading: slidesUrl
      ? (section, step) => h('a', {
          'className': 'pm-open-slides',
          'href': positionUrl(slidesUrl, section.index, step),
          'title': t.openInSlides,
          'aria-label': t.openInSlides,
          'data-label': t.slides,
        }, [slideIcon()])
      : undefined,
    diagnostics: config.events !== undefined,
    navigate: embedded || config.block ? undefined : position => router!.turnTo(position, viewer.restoring.getSnapshot()),
    ...config.source
      ? { openSource: source => void fetch(`${config.source}?file=${encodeURIComponent(source.file)}&line=${source.line}`, { method: 'POST', headers: { 'Presmium-Request': 'source' } }) }
      : {},
    ...embedded || config.block
      ? {}
      : {
          openPresenter(position) {
            const url = new URL(location.href)
            url.hash = ''
            url.search = withPositionQuery(url.search, { view: 'presenter', ...position })
            window.open(url.href, 'presmium-presenter', 'popup,width=1100,height=720')
          },
        },
  })
  if (router) viewer.doc.subscribe(() => router.refresh())
  // The slides alone: the presentation, which a slides page opens on (or every slide, printed).
  if (slides && !input.print) viewer.setView('present')
  const print = input.print
  const adapter = createWebHostAdapter(viewer, { lang: config.lang, shared, isDark: () => dark, printed: print !== undefined })
  installHost(adapter)
  function Content() {
    const doc = useStore(viewer.doc)
    if (!useStore(active)) return null
    if (config.block) {
      for (const section of doc.sections) {
        const block = [...irBlocks(section.blocks)].find(block => block.id === config.block)
        if (block) return h(BlockPreview, { block, section })
      }
      return null
    }
    if (print) return h(SlidesPrint, { steps: print.steps, slides: print.slides })
    if (slides) return h('div', { className: 'pm-slides-page pm-document' }, h(OverlayViewOutlet))
    return embedded ? h(PreviewSheet, { viewer }) : h(DocumentSite, { config, router: router! })
  }
  const app = pageRoot(h(HostProvider, { adapter }, h(ViewerProvider, { viewer }, h(Content))), input.ssr)
  for (const [name, load] of Object.entries(input.components)) registerComponent(name, clientOnly(name, load))
  return { app, shared, active, viewer, router }
}
