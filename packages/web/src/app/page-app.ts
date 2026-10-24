import { createSharedStates, installHost, presmiumReport, presmiumService, setSiteBase } from '@lincyaw/host'
import type { HostAdapter, SharedStates } from '@lincyaw/host'
import { deckLocale } from '@lincyaw/kernel'
import type { IRDocument } from '@lincyaw/kernel'
import { createViewer, installViewer, OverlayViewOutlet, PageViewOutlet, registerComponent, SlidesPrint } from '@lincyaw/viewer'
import type { Viewer } from '@lincyaw/viewer'
import { FINAL_STEP } from '@lincyaw/viewer/domain'
import type { App, Ref } from 'vue'
import { createApp, createSSRApp, defineComponent, h, readonly, ref } from 'vue'
import { positionUrl, WEB_MESSAGES, withPositionQuery } from '../domain/index.ts'
import type { AppConfig, SlidesPrintQuery } from '../domain/index.ts'
import { createWebHostAdapter } from '../client/host.ts'
import { clientOnly } from '../client/runtime.ts'
import { createPageRouter } from './router.ts'
import type { PageRouter } from './router.ts'
import { MissingPage, WorkspaceHome } from './site/home.ts'
import { DocumentSite } from './site/layout.ts'

/**
 * A page of the web form as a Vue app: a document's page (on its site, or alone on the workbench's canvas), the
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
  dark: Ref<boolean>
  /** The slides printed one after the other (an export). */
  print?: SlidesPrintQuery
}

export interface PageApp {
  app: App
  shared: SharedStates
  /** Whether the page shows its content: a paused preview shows none. */
  active: Ref<boolean>
  viewer?: Viewer
  router?: PageRouter
}

/** The host of a page that shows no document: no position, no steps. */
function pageHostAdapter(lang: string, shared: SharedStates, dark: Ref<boolean>): HostAdapter {
  return {
    mode: 'document',
    lang,
    useCursor: () => readonly(ref({ slide: 1, step: 0 })),
    useStep: () => readonly(ref(FINAL_STEP)),
    useViewRole: () => readonly(ref('reader' as const)),
    useStaticRender: () => readonly(ref(false)),
    useSectionConfig: () => readonly(ref({})),
    useSharedState: shared.sharedState,
    getService: presmiumService,
    startReport: presmiumReport,
    useDarkMode: () => dark,
  }
}

/** The document in a workbench: one page on the canvas, as an editor shows it, with no navigation of the site. */
const PreviewSheet = defineComponent({
  name: 'PresmiumPreviewSheet',
  props: { router: { type: Object as () => PageRouter, required: true } },
  setup(props) {
    return () => h('div', { class: 'pm-sheet-canvas' }, [
      h('article', { class: 'pm-sheet' }, [h(PageViewOutlet, { key: props.router.shown.value?.path, sections: props.router.shown.value?.sections ?? [] })]),
      h('div', { class: 'pm-document pm-overlay-views' }, [h(OverlayViewOutlet)]),
    ])
  },
})

function slideIcon() {
  return h('svg', { 'class': 'pm-ui-icon', 'viewBox': '0 0 24 24', 'aria-hidden': 'true', 'fill': 'none', 'stroke': 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
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

export function createPageApp(input: PageAppInput): PageApp {
  const { config, embedded, dark } = input
  setSiteBase(config.base)
  const shared = createSharedStates(input.doc ? input.doc.meta.title : `${config.site.title} (home)`)
  const active = ref(true)
  const create = input.ssr ? createSSRApp : createApp
  if (!input.doc || config.kind !== 'document') {
    const Root = config.kind === 'missing' ? MissingPage : WorkspaceHome
    const app = create(defineComponent({ name: 'PresmiumPageApp', setup: () => () => h(Root, { config }) }))
    installHost(app, pageHostAdapter(config.lang, shared, dark))
    return { app, shared, active }
  }

  const initial = input.doc
  const slides = config.form === 'slides'
  // The router pages the document as the viewer has it now (a dev server's changes come to the viewer).
  let current: Viewer | undefined
  const router = createPageRouter(config, () => current?.doc.value ?? initial, !embedded)
  const slidesUrl = embedded || slides ? undefined : slidesBase(config)
  const t = WEB_MESSAGES[deckLocale(config.lang)]
  const viewer = current = createViewer(initial, {
    renderer: 'web',
    sectionHref: router.sectionHref,
    slidesOnly: slides,
    sectionHeading: slidesUrl
      ? (section, step) => h('a', {
          'class': 'pm-open-slides',
          'href': positionUrl(slidesUrl, section.index, step),
          'title': t.openInSlides,
          'aria-label': t.openInSlides,
          'data-label': t.slides,
        }, [slideIcon()])
      : undefined,
    diagnostics: config.events !== undefined,
    navigate: position => router.turnTo(position, viewer.restoring.value),
    ...config.source
      ? { openSource: source => void fetch(`${config.source}?file=${encodeURIComponent(source.file)}&line=${source.line}`, { method: 'POST', headers: { 'Presmium-Request': 'source' } }) }
      : {},
    ...embedded
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
  // The slides alone: the presentation, which a slides page opens on (or every slide, printed).
  if (slides && !input.print) viewer.setView('present')
  const print = input.print
  const app = create(defineComponent({
    name: 'PresmiumPageApp',
    setup() {
      return () => {
        if (!active.value) return null
        if (print) return h(SlidesPrint, { steps: print.steps, slides: print.slides })
        if (slides) return h('div', { class: 'pm-slides-page pm-document' }, [h(OverlayViewOutlet)])
        return embedded ? h(PreviewSheet, { router }) : h(DocumentSite, { config, router })
      }
    },
  }))
  installHost(app, createWebHostAdapter(viewer, { lang: config.lang, shared, isDark: () => dark, printed: print !== undefined }))
  installViewer(app, viewer)
  for (const [name, load] of Object.entries(input.components)) registerComponent(name, clientOnly(name, load))
  return { app, shared, active, viewer, router }
}
