import { createServerClient, createSharedStates, currentLocale, installHost, OPERATIONS, pluginsOf, PmPresenterPanels, PmToolbar, presmiumService, provideServer, registerPresmiumPlugin, reportPluginFailure, startHost, stopPresmium } from '@presmium/host'
import type { ServerClient, SyncTransports } from '@presmium/host'
import { errorMessage } from '@presmium/kernel'
import type { IRDocument } from '@presmium/kernel'
import { createViewer, followOperations, getView, installViewer, installViewerPlugin, OverlayHost, PmComponentFallback, registerComponent, useViewer, withSlideGlobals } from '@presmium/viewer'
import type { LiveUpdate, Position, Viewer } from '@presmium/viewer'
import type { Theme } from 'vitepress'
import { inBrowser, useData, withBase } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import type { Component } from 'vue'
import { computed, defineAsyncComponent, defineComponent, h, nextTick, onMounted, ref, watch } from 'vue'
import { IR_ENDPOINT, offlineEnabled, requested, SERVICE_WORKER, sectionLinks, sidebar, slideUrl, SOURCE_ENDPOINT, toPages, viewSearch, WEB_MESSAGES } from '../domain/index.ts'
import type { FormOptions } from '../domain/index.ts'
import { createViewerHost, createViewerNavigation } from './host.ts'
import { PresmiumPage, ViewMenu } from './page.ts'
import './style.css'

/** A plugin's `src/client/viewer.ts`, by package name, loaded lazily. */
export interface ViewerModule {
  name: string
  load: () => Promise<unknown>
}

/** What the generated theme passes in: the IR and the deck's plugin modules, imported lazily. */
export interface ThemeInput {
  doc: IRDocument
  /** The revision of `doc` (a hash), which live updates in the dev server name. */
  revision?: string
  /** Component name to loader, from each plugin's `components/` directory. */
  components: Record<string, () => Promise<unknown>>
  /** Loaders of each plugin's `src/client/plugin.ts` (see `pluginsOf` of @presmium/host). */
  plugins: (() => Promise<unknown>)[]
  /** Each plugin's `src/client/viewer.ts`: views and renderers for the IR runtime. */
  viewers?: ViewerModule[]
}

/** A live update of the dev server, with the revision it applies to and the one it makes (see ../node/vite.ts). */
interface UpdateEvent {
  update: LiveUpdate
  base: string
  revision: string
}

/**
 * Registers the kernel plugins of every plugin package, as the slides form
 * does, and starts the kernel with the host services (`startHost`) and the
 * deck's named environments (the IR's `config.execute.environments`), for
 * which provider plugins register their executors.
 */
async function startKernel(loaders: ThemeInput['plugins'], doc: IRDocument, viewer: Viewer, transports: SyncTransports, server?: ServerClient): Promise<void> {
  const config = doc.config.presmium
  const modules = await Promise.all(loaders.map(load => load().catch((error) => {
    console.error('[presmium] a plugin module failed to load', error)
    return {}
  })))
  modules.flatMap(module => pluginsOf(module, config)).forEach(registerPresmiumPlugin)
  await startHost({ mode: 'document', config, navigation: createViewerNavigation(viewer), transports, server, environments: doc.config.execute?.environments })
}

/**
 * Plugin components render in the browser only: they may use browser APIs
 * that the server render of VitePress does not have. Until one has loaded and
 * mounted (and in the server render, so readers without JavaScript see it),
 * its IR `fallback` stands in for it. They see Slidev's `$frontmatter` of
 * their section rather than VitePress's of the page. The viewer puts them in
 * an error boundary.
 */
function clientOnly(name: string, load: () => Promise<unknown>): Component {
  const loaded = defineAsyncComponent(() => load().then(module => withSlideGlobals((module as { default: Component }).default)))
  return defineComponent({
    name,
    inheritAttrs: false,
    setup(_, { attrs, slots }) {
      const mounted = ref(false)
      onMounted(() => {
        mounted.value = true
      })
      return () => (mounted.value
        ? h(loaded, attrs, slots)
        : h('div', { 'class': 'pm-client-only', 'data-component': name }, [h(PmComponentFallback)]))
    },
  })
}

/** Installs the viewer plugins; one that fails is left out and reported in the start report. */
async function loadViewerPlugins(modules: ViewerModule[]): Promise<void> {
  await Promise.all(modules.map(async ({ name, load }) => {
    const id = `${name} (viewer)`
    try {
      const reason = installViewerPlugin(((await load()) as { default?: unknown }).default, id)
      if (reason) reportPluginFailure(id, reason)
    } catch (error) {
      console.error(`[presmium] ${id} failed to load`, error)
      reportPluginFailure(id, errorMessage(error))
    }
  }))
}

/** Registers the service worker of the build; without offline support, removes one an earlier build registered. */
function serviceWorker(offline: boolean): void {
  if (!('serviceWorker' in navigator)) return
  if (!offline) {
    void navigator.serviceWorker.getRegistrations().then(registrations => registrations
      .filter(registration => (registration.active ?? registration.waiting ?? registration.installing)?.scriptURL.endsWith(`/${SERVICE_WORKER}`))
      .forEach(registration => void registration.unregister()))
    return
  }
  const register = () => navigator.serviceWorker.register(withBase(`/${SERVICE_WORKER}`)).catch((error) => {
    console.warn('[presmium] offline support unavailable', error)
  })
  if (document.readyState === 'complete') void register()
  else window.addEventListener('load', register, { once: true })
}

/** A screen on a stand: the icon of the link to the slides. Its label is the link's, so the heading's text stays the title. */
function slidesIcon() {
  return h('svg', { 'viewBox': '0 0 24 24', 'width': '1em', 'height': '1em', 'aria-hidden': 'true', 'fill': 'none', 'stroke': 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('rect', { x: 2, y: 3, width: 20, height: 14, rx: 2 }),
    h('path', { d: 'M8 21h8M12 17v4' }),
  ])
}

/**
 * The labels that the default theme gives its sidebar and doc footer for
 * assistive technology, in the deck's language: its configuration has no
 * option for them (R-72), so they are set once a page has rendered. They are
 * found by the ids the theme gives them (docs/architecture.md 9.1).
 */
function localizeHiddenLabels(): void {
  const t = WEB_MESSAGES[currentLocale()]
  for (const [id, text] of [['sidebar-aria-label', t.sidebarNav], ['doc-footer-aria-label', t.pager]] as const) {
    const label = document.getElementById(id)
    if (label && label.textContent !== text) label.textContent = text
  }
}

/** Base URL of the slides form: configured, else the `slides` directory next to the site; none without a slides form. Browser only. */
const slidesBase = ref<string>()
/** Settles when the viewer plugins are installed, so their views can be opened by `?view=`. */
let viewersReady: Promise<void> = Promise.resolve()

/**
 * Default layout plus the view menu and the plugins' toolbar items in the
 * navigation bar, the overlay views and, in the presenter window, the
 * presenter panels in its side column. `?slide=N&step=<n>` (from the slides
 * form), `?section=<id>&step=<n>` and `?view=<id>` open a position and a
 * view; while an overlay view is shown, the URL names its view and position,
 * so a reload shows them again.
 */
const Layout = defineComponent({
  name: 'PresmiumLayout',
  setup() {
    const viewer = useViewer()
    const { theme, page } = useData()
    onMounted(async () => {
      localizeHiddenLabels()
      watch(() => page.value.relativePath, () => void nextTick(localizeHiddenLabels), { flush: 'post' })
      const form: FormOptions = theme.value.presmium?.form ?? {}
      if (form.slides) slidesBase.value = form.slidesUrl ?? new URL('../slides', new URL(withBase('/'), location.href)).href
      const ask = requested(location.search, viewer.doc.value)
      if (ask.section || ask.view) {
        history.replaceState(history.state, '', location.pathname + viewSearch(location.search) + location.hash)
        if (ask.section) viewer.show({ section: ask.section, step: ask.step ?? 0 })
        if (ask.view) {
          await viewersReady
          if (getView(ask.view)) viewer.setView(ask.view)
        }
      }
      watch([viewer.view, viewer.position], ([view, position]) => {
        const search = viewSearch(location.search, getView(view)?.kind === 'overlay' ? { view, ...position } : undefined)
        if (search !== location.search) history.replaceState(history.state, '', location.pathname + search + location.hash)
      }, { immediate: true })
    })
    return () => h(DefaultTheme.Layout, null, {
      // On phones the view menu and the toolbar items move to the navigation screen (the menu), as VitePress
      // does with its links, so the bar keeps the width of the screen.
      'nav-bar-content-after': () => [h(ViewMenu, { class: 'pm-view-menu--bar' }), h(PmToolbar, { class: 'pm-toolbar--bar' })],
      'nav-screen-content-after': () => [h(ViewMenu, { class: 'pm-view-menu--screen' }), h(PmToolbar, { class: 'pm-toolbar--screen' })],
      // Overlay views get the typography of the page body.
      'layout-bottom': () => [
        h('div', { class: 'vp-doc pm-overlay-views' }, [h(OverlayHost)]),
        viewer.view.value === 'presenter' ? h(PmPresenterPanels, { to: '.pm-presenter__side', docked: true }) : null,
      ],
    })
  },
})

/**
 * Live updates from `presmium dev` (docs/ir.md section 8.3), over Vite's
 * WebSocket. An update applies to the document of its `base` revision; a
 * page that holds another one (it loaded while the deck was compiling, or
 * missed updates while disconnected) gets the current document instead, as
 * it does whenever it connects. The site title and the sidebar follow the
 * document here, so the config never changes and the page never reloads.
 */
function followDevServer(viewer: Viewer, revision: string | undefined, follow: (doc: IRDocument) => void): void {
  const hot = import.meta.hot
  if (!hot) return
  let current = revision
  const fetchCurrent = async () => {
    try {
      const response = await fetch(IR_ENDPOINT, { cache: 'no-store' })
      if (!response.ok) return
      const { revision: latest, doc } = await response.json() as { revision: string, doc: IRDocument }
      if (latest === current) return
      current = latest
      viewer.replace(doc)
      follow(viewer.doc.value)
    } catch (error) {
      console.warn('[presmium] could not get the current document from the dev server', error)
    }
  }
  hot.on('presmium:update', ({ update, base, revision: next }: UpdateEvent) => {
    if (base !== current) {
      void fetchCurrent()
      return
    }
    current = next
    viewer.update(update)
    follow(viewer.doc.value)
  })
  hot.on('vite:ws:connect', () => void fetchCurrent())
  void fetchCurrent()
}

/** The VitePress theme of the web form: default theme, the IR runtime, the web host adapter. */
export function createPresmiumTheme(input: ThemeInput): Theme {
  return {
    extends: DefaultTheme,
    Layout,
    enhanceApp({ app, router, siteData }) {
      const form: FormOptions = siteData.value.themeConfig.presmium?.form ?? {}
      const links = computed(() => sectionLinks(toPages(current.doc.value)))
      const pageOf = (position: Position) => withBase((links.value[position.section] ?? '/').split('#')[0]!)
      const current = createViewer(input.doc, {
        renderer: 'web',
        sectionHref: id => withBase(links.value[id] ?? `/#${id}`),
        // A small link beside each section heading opens the section's slide at the step read (P-74).
        sectionHeading(section, step) {
          if (!slidesBase.value) return null
          const t = WEB_MESSAGES[currentLocale()]
          return h('a', {
            'class': 'pm-open-slides',
            'href': slideUrl(slidesBase.value, form, section.index, step),
            'title': t.openInSlides,
            'aria-label': t.openInSlides,
            'data-label': t.slides,
          }, [slidesIcon()])
        },
        diagnostics: import.meta.env.DEV,
        // The dev server opens the file in the author's editor (K-11).
        openSource: import.meta.env.DEV
          ? source => void fetch(`${SOURCE_ENDPOINT}?file=${encodeURIComponent(source.file)}&line=${source.line}`)
          : undefined,
        navigate: position => void router.go(pageOf(position)),
        openPresenter(position) {
          const url = new URL(location.href)
          url.hash = ''
          url.search = viewSearch(url.search, { view: 'presenter', ...position })
          window.open(url.href, 'presmium-presenter', 'popup,width=1100,height=720')
        },
      })
      // Shared states of the deck's windows, kept by title (so both forms meet in a classroom) and base.
      const shared = createSharedStates(input.doc.meta.title)
      installHost(app, createViewerHost(current, { lang: siteData.value.lang, shared }))
      installViewer(app, current)
      app.component('PresmiumPage', PresmiumPage)
      for (const [name, load] of Object.entries(input.components)) registerComponent(name, clientOnly(name, load))
      if (!inBrowser) return
      viewersReady = loadViewerPlugins(input.viewers ?? [])
      // `presmium dev` serves the page: the server's client, given before any component asks for it (`useServer`).
      const server = siteData.value.themeConfig.presmium?.server ? createServerClient() : undefined
      provideServer(server)
      void startKernel(input.plugins, input.doc, current, shared.transports, server)
      // The IR runtime reports and replays `go` through the running kernel's operations (each start has its own).
      watch(() => presmiumService(OPERATIONS), (operations, _, onCleanup) => {
        if (operations) onCleanup(followOperations(current, operations))
      }, { immediate: true })
      if (import.meta.env.PROD) serviceWorker(offlineEnabled(input.doc.config.presmium))
      followDevServer(current, input.revision, (doc) => {
        const site = siteData.value
        const nav = sidebar(doc, toPages(doc))
        if (site.title === doc.meta.title && JSON.stringify(site.themeConfig.sidebar) === JSON.stringify(nav)) return
        siteData.value = { ...site, title: doc.meta.title, themeConfig: { ...site.themeConfig, sidebar: nav } }
      })
    },
  }
}

import.meta.hot?.dispose(() => stopPresmium())
