import { createPresenterPanels, createToolbar, installHost, NAVIGATION, pluginsOf, PmPresenterPanels, PmToolbar, registerPresmiumPlugin, startPresmium, SYNC_TRANSPORTS, TOOLBAR } from '@presmium/host'
import { PRESENTER_PANELS } from '@presmium/kernel'
import type { IRDocument } from '@presmium/kernel'
import { createViewer, getView, installViewer, installViewerPlugin, OverlayHost, registerComponent, useViewer, withSlideGlobals } from '@presmium/viewer'
import type { LiveUpdate, Position, Viewer } from '@presmium/viewer'
import type { Theme } from 'vitepress'
import { inBrowser, useData, withBase } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import type { Component } from 'vue'
import { computed, defineAsyncComponent, defineComponent, h, onMounted, ref } from 'vue'
import { offlineEnabled, requested, SERVICE_WORKER, sectionLinks, sidebar, slideUrl, SOURCE_ENDPOINT, toPages } from '../domain/index.ts'
import type { FormOptions } from '../domain/index.ts'
import { createViewerHost, createViewerNavigation, viewerSyncTransports } from './host.ts'
import { PresmiumPage, ViewMenu } from './page.ts'
import './style.css'

/** What the generated theme passes in: the IR and the deck's plugin modules, imported lazily. */
export interface ThemeInput {
  doc: IRDocument
  /** Component name to loader, from each plugin's `components/` directory. */
  components: Record<string, () => Promise<unknown>>
  /** Loaders of each plugin's `src/client/plugin.ts` (see `pluginsOf` of @presmium/host). */
  plugins: (() => Promise<unknown>)[]
  /** Loaders of each plugin's `src/client/viewer.ts`: views and renderers for the IR runtime. */
  viewers?: (() => Promise<unknown>)[]
}

/** Registers the kernel plugins of every plugin package, as the slides form does, and starts the kernel. */
async function startKernel(loaders: ThemeInput['plugins'], config: Record<string, unknown>, viewer: Viewer): Promise<void> {
  const modules = await Promise.all(loaders.map(load => load().catch((error) => {
    console.error('[presmium] a plugin module failed to load', error)
    return {}
  })))
  modules.flatMap(module => pluginsOf(module, config)).forEach(registerPresmiumPlugin)
  await startPresmium({
    mode: 'document',
    config,
    beforeStart(kernel) {
      kernel.provide(PRESENTER_PANELS, createPresenterPanels())
      kernel.provide(SYNC_TRANSPORTS, viewerSyncTransports)
      kernel.provide(NAVIGATION, createViewerNavigation(viewer))
      kernel.provide(TOOLBAR, createToolbar())
    },
  })
}

/**
 * Plugin components render in the browser only: they may use browser APIs
 * that the server render of VitePress does not have. They see Slidev's
 * `$frontmatter` of their section rather than VitePress's of the page. The
 * viewer puts them in an error boundary.
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
      return () => (mounted.value ? h(loaded, attrs, slots) : h('span', { 'class': 'pm-client-only', 'data-component': name }))
    },
  })
}

/** Installs the viewer plugins; one that fails to load is reported and left out. */
async function loadViewerPlugins(loaders: NonNullable<ThemeInput['viewers']>): Promise<void> {
  await Promise.all(loaders.map((load, i) => load().then(
    module => void installViewerPlugin((module as { default?: unknown }).default, `viewer plugin ${i + 1}`),
    error => console.error('[presmium] a viewer plugin failed to load', error),
  )))
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

/** Base URL of the slides form: configured, else the `slides` directory next to the site; none without a slides form. Browser only. */
const slidesBase = ref<string>()
/** Settles when the viewer plugins are installed, so their views can be opened by `?view=`. */
let viewersReady: Promise<void> = Promise.resolve()

/**
 * Default layout plus the view menu and the plugins' toolbar items in the
 * navigation bar, the overlay views and, in the presenter window, the
 * presenter panels. `?slide=N&step=<n>`
 * (from the slides form), `?section=<id>&step=<n>` and `?view=<id>` open a
 * position and a view.
 */
const Layout = defineComponent({
  name: 'PresmiumLayout',
  setup() {
    const viewer = useViewer()
    const { theme } = useData()
    onMounted(async () => {
      const form: FormOptions = theme.value.presmium?.form ?? {}
      if (form.slides) slidesBase.value = form.slidesUrl ?? new URL('../slides', new URL(withBase('/'), location.href)).href
      const ask = requested(location.search, viewer.doc.value)
      if (!ask.section && !ask.view) return
      history.replaceState(history.state, '', location.pathname + location.hash)
      if (ask.section) viewer.show({ section: ask.section, step: ask.step ?? 0 })
      if (!ask.view) return
      await viewersReady
      if (getView(ask.view)) viewer.setView(ask.view)
    })
    return () => h(DefaultTheme.Layout, null, {
      // On phones the toolbar items move to the navigation screen (the menu), as VitePress does with its links.
      'nav-bar-content-after': () => [h(ViewMenu), h(PmToolbar, { class: 'pm-toolbar--bar' })],
      'nav-screen-content-after': () => h(PmToolbar, { class: 'pm-toolbar--screen' }),
      // Overlay views get the typography of the page body.
      'layout-bottom': () => [
        h('div', { class: 'vp-doc pm-overlay' }, [h(OverlayHost)]),
        viewer.view.value === 'presenter' ? h(PmPresenterPanels) : null,
      ],
    })
  },
})

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
        sectionFooter(section, step) {
          if (!slidesBase.value) return null
          return h('p', { class: 'pm-section__links' }, [
            h('a', { class: 'pm-open-slides', href: slideUrl(slidesBase.value, form, section.index, step) }, '在幻灯片中打开'),
          ])
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
          url.search = `?view=presenter&section=${encodeURIComponent(position.section)}&step=${position.step}`
          window.open(url.href, 'presmium-presenter', 'popup,width=1100,height=720')
        },
      })
      installHost(app, createViewerHost(current))
      installViewer(app, current)
      app.component('PresmiumPage', PresmiumPage)
      for (const [name, load] of Object.entries(input.components)) registerComponent(name, clientOnly(name, load))
      if (!inBrowser) return
      viewersReady = loadViewerPlugins(input.viewers ?? [])
      void startKernel(input.plugins, input.doc.config.presmium, current)
      if (import.meta.env.PROD) serviceWorker(offlineEnabled(input.doc.config.presmium))
      // Live updates from `presmium dev` (docs/ir.md section 8.3), over Vite's WebSocket. The site
      // title and the sidebar follow the document here, so the config never changes and the page never reloads.
      import.meta.hot?.on('presmium:update', (update: LiveUpdate) => {
        current.update(update)
        const doc = current.doc.value
        const site = siteData.value
        const nav = sidebar(doc, toPages(doc))
        if (site.title === doc.meta.title && JSON.stringify(site.themeConfig.sidebar) === JSON.stringify(nav)) return
        siteData.value = { ...site, title: doc.meta.title, themeConfig: { ...site.themeConfig, sidebar: nav } }
      })
    },
  }
}
