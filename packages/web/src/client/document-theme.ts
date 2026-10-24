import { componentErrors, createServerClient, createSharedStates, currentLocale, installHost, OPERATIONS, pluginsOf, PmIcon, PmPresenterPanels, PmToolbar, presmiumReport, presmiumService, provideServer, registerPresmiumPlugin, reportPluginFailure, setHostActive, startHost, stopHost } from '@lincyaw/host'
import type { ServerClient, SharedStates, SyncTransports } from '@lincyaw/host'
import { errorMessage } from '@lincyaw/kernel'
import type { IRDocument } from '@lincyaw/kernel'
import { createViewer, findView, installViewer, OverlayViewOutlet, PmComponentFallback, registerComponent, syncViewerWithOperations, tryInstallViewerPlugin, useViewer, withSlideGlobals } from '@lincyaw/viewer'
import type { Viewer } from '@lincyaw/viewer'
import { applyUpdate } from '@lincyaw/viewer/domain'
import type { LiveUpdate, Position } from '@lincyaw/viewer/domain'
import type { Router, SiteData, Theme } from 'vitepress'
import { Content, inBrowser, useData, withBase } from 'vitepress'
import DefaultTheme from 'vitepress/theme-without-fonts'
import type { Component, ComputedRef, Ref, ShallowRef } from 'vue'
import { computed, defineAsyncComponent, defineComponent, h, nextTick, onMounted, ref, shallowRef, watch } from 'vue'
import { IR_ENDPOINT, offlineEnabled, parsePositionQuery, samePage, sectionLinks, SERVICE_WORKER, sidebar, slidesPositionUrl, SOURCE_ENDPOINT, translationPages, UPDATE_EVENT, WEB_MESSAGES, webPages, withPositionQuery } from '../domain/index.ts'
import type { CrossFormLinks, DevUpdateEvent, WebPage } from '../domain/index.ts'
import { createViewerNavigation, createWebHostAdapter } from './host.ts'
import { PAGES, PresmiumPage, ViewMenu } from './page.ts'
import type { WebPreview, WebPreviewPage } from './preview-frame.ts'
import './style.css'

export interface ViewerModule {
  name: string
  load: () => Promise<unknown>
}

export interface ThemeInput {
  doc: IRDocument
  irRevision?: string
  components: Record<string, () => Promise<unknown>>
  plugins: (() => Promise<unknown>)[]
  restartable?: boolean
  viewers?: ViewerModule[]
  translations?: Record<string, () => Promise<{ default: IRDocument }>>
  preview?: WebPreview
}

interface ThemeOptions {
  crossFormLinks?: CrossFormLinks
  server?: boolean
  document?: string
  home?: string
  ir?: string
}

/** Registers the browser plugins of the document and starts them, unless the runtime was disabled while their modules loaded. */
async function startRuntime(loaders: ThemeInput['plugins'], doc: IRDocument, viewer: Viewer, transports: SyncTransports, server: ServerClient | undefined, enabled: () => boolean): Promise<{ started: boolean, restartable: boolean }> {
  const config = doc.config.presmium
  let failed = false
  const modules = await Promise.all(loaders.map(load => load().catch((error) => {
    failed = true
    console.error('[presmium] a plugin module failed to load', error)
    return {}
  })))
  const plugins = modules.flatMap(module => pluginsOf(module))
  const restartable = !failed && plugins.every(plugin => plugin.restartable === true)
  if (!enabled()) return { started: false, restartable }
  plugins.forEach(registerPresmiumPlugin)
  await startHost({ mode: 'document', config, navigation: createViewerNavigation(viewer), transports, server, environments: doc.config.execute?.environments })
  return { started: true, restartable }
}

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

async function loadViewerPlugins(modules: ViewerModule[]): Promise<boolean> {
  let valid = true
  await Promise.all(modules.map(async ({ name, load }) => {
    const id = `${name} (viewer)`
    try {
      const reason = tryInstallViewerPlugin(((await load()) as { default?: unknown }).default, id)
      if (reason) {
        valid = false
        reportPluginFailure(id, reason)
      }
    } catch (error) {
      valid = false
      console.error(`[presmium] ${id} failed to load`, error)
      reportPluginFailure(id, errorMessage(error))
    }
  }))
  return valid
}

/** Registers the offline service worker, or unregisters it when the document turned offline support off. */
function setUpServiceWorker(offline: boolean): void {
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

function slidesIcon() {
  return h('svg', { 'viewBox': '0 0 24 24', 'width': '1em', 'height': '1em', 'aria-hidden': 'true', 'fill': 'none', 'stroke': 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('rect', { x: 2, y: 3, width: 20, height: 14, rx: 2 }),
    h('path', { d: 'M8 21h8M12 17v4' }),
  ])
}

function localizeHiddenLabels(): void {
  const t = WEB_MESSAGES[currentLocale()]
  for (const [id, text] of [['sidebar-aria-label', t.sidebarNav], ['doc-footer-aria-label', t.pager]] as const) {
    const label = document.getElementById(id)
    if (label && label.textContent !== text) label.textContent = text
  }
  for (const [selector, text] of [['.VPNavBarHamburger', t.mobileNav], ['.VPNavBarExtra > button', t.extraNav]] as const) {
    for (const button of document.querySelectorAll(selector)) {
      if (button.getAttribute('aria-label') !== text) button.setAttribute('aria-label', text)
    }
  }
}

const slidesBase = ref<string>()
const active = ref(true)
const embeddedPreview = ref(false)
let preview: WebPreview | undefined
let setActive: WebPreviewPage['setActive'] = async () => {}
let viewersReady: Promise<unknown> = Promise.resolve()

/** The document in a workbench: one page on the canvas, as an editor shows it, with no navigation of the site. */
const PreviewSheet = defineComponent({
  name: 'PresmiumPreviewSheet',
  setup() {
    return () => h('div', { class: 'pm-sheet-canvas' }, [
      h('article', { class: 'pm-sheet vp-doc' }, [h(Content)]),
      h('div', { class: 'vp-doc pm-overlay-views' }, [h(OverlayViewOutlet)]),
    ])
  },
})

const Layout = defineComponent({
  name: 'PresmiumLayout',
  setup() {
    const viewer = useViewer()
    const { theme, page, isDark } = useData()
    onMounted(async () => {
      const connecting = preview
      preview = undefined
      connecting?.connect({ viewer, dark: isDark, setActive })
      embeddedPreview.value = document.documentElement.dataset.presmiumPreview === 'on'
      localizeHiddenLabels()
      watch(() => page.value.relativePath, () => void nextTick(localizeHiddenLabels), { flush: 'post' })
      watch(active, () => void nextTick(localizeHiddenLabels), { flush: 'post' })
      const links: CrossFormLinks = theme.value.presmium?.crossFormLinks ?? {}
      if (links.slides) slidesBase.value = links.slidesUrl ?? new URL('../slides', new URL(withBase('/'), location.href)).href
      const asked = parsePositionQuery(location.search, viewer.doc.value)
      if (asked.section || asked.view) {
        history.replaceState(history.state, '', location.pathname + withPositionQuery(location.search) + location.hash)
        if (asked.section) viewer.show({ section: asked.section, step: asked.step ?? 0 })
        if (asked.view) {
          await viewersReady
          if (findView(asked.view)) viewer.setView(asked.view)
        }
      }
      watch([viewer.view, viewer.position], ([view, position]) => {
        const search = withPositionQuery(location.search, findView(view)?.kind === 'overlay' ? { view, ...position } : undefined)
        if (search !== location.search) history.replaceState(history.state, '', location.pathname + search + location.hash)
      }, { immediate: true })
    })
    const home = () => {
      if (embeddedPreview.value) return null
      const href = theme.value.presmium?.home
      return href ? h('a', { class: 'pm-site-link', href }, [h(PmIcon, { name: 'arrow-left', size: 14, strokeWidth: 2 }), WEB_MESSAGES[currentLocale()].documents]) : null
    }
    const footer = () => {
      const { message, copyright } = (theme.value.footer ?? {}) as { message?: string, copyright?: string }
      if (!message && !copyright) return null
      return h('footer', { class: 'pm-site-footer' }, [
        message ? h('p', { class: 'pm-site-footer__message', innerHTML: message }) : null,
        copyright ? h('p', { class: 'pm-site-footer__copyright', innerHTML: copyright }) : null,
      ])
    }
    return () => !active.value ? null : embeddedPreview.value ? h(PreviewSheet) : h(DefaultTheme.Layout, null, {
      'nav-bar-content-after': () => [home(), h(ViewMenu, { class: 'pm-view-menu--bar' }), h(PmToolbar, { class: 'pm-toolbar--bar' })],
      'nav-screen-content-after': () => [home(), h(ViewMenu, { class: 'pm-view-menu--screen' }), h(PmToolbar, { class: 'pm-toolbar--screen' })],
      'doc-after': footer,
      'layout-bottom': () => [
        h('div', { class: 'vp-doc pm-overlay-views' }, [h(OverlayViewOutlet)]),
        viewer.view.value === 'presenter' ? h(PmPresenterPanels, { to: '.pm-presenter__side', docked: true }) : null,
      ],
    })
  },
})

/** Applies the dev server's IR updates to the document as they come; returns the function that fetches the current IR. */
function subscribeDevUpdates(original: () => IRDocument, irRevision: string | undefined, endpoint: string, show: (doc: IRDocument) => void, enabled: () => boolean): (force?: boolean) => Promise<void> {
  const hot = import.meta.hot
  if (!hot) return async () => {}
  let current = irRevision
  let updates = 0
  let asked = 0
  let answered = 0
  const fetchCurrent = async (force = false) => {
    if (!force && !enabled()) return
    const request = ++asked
    const since = updates
    try {
      const response = await fetch(endpoint, { cache: 'no-store', ...current ? { headers: { 'If-None-Match': `"${current}"` } } : {} })
      if (response.status === 304) {
        answered = Math.max(answered, request)
        return
      }
      if (!response.ok) {
        if (force) throw new Error(`the document refresh failed (${response.status})`)
        return
      }
      const { revision: latest, doc } = await response.json() as { revision: string, doc: IRDocument }
      if (!enabled() || updates !== since || request < answered || latest === current) return
      answered = request
      current = latest
      show(doc)
    } catch (error) {
      console.warn('[presmium] could not get the current document from the dev server', error)
      if (force) throw error
    }
  }
  hot.on(UPDATE_EVENT, ({ update, base, revision: next }: DevUpdateEvent<LiveUpdate>) => {
    if (!enabled()) return
    if (base !== current) {
      void fetchCurrent()
      return
    }
    current = next
    updates++
    show(applyUpdate(original(), update))
  })
  hot.on('vite:ws:connect', () => void fetchCurrent())
  void fetchCurrent()
  return fetchCurrent
}

function localeOf(path: string, base: string, langs: string[]): string {
  const rest = path.startsWith(base) ? path.slice(base.length) : path.replace(/^\//, '')
  const first = rest.split('/')[0]!
  return langs.includes(first) ? first : 'root'
}

interface TranslationSwitcher {
  langs: string[]
  /** The document in its own language, kept while a translation is shown. */
  original: ShallowRef<IRDocument>
  locale: Ref<string>
  prefix: ComputedRef<string>
  pagesOf(doc: IRDocument): WebPage[]
  /** Shows the document in the language of the page at `path`, loading its translation the first time. */
  switchTo(path: string, viewer: Viewer): Promise<void>
}

function createTranslationSwitcher(input: ThemeInput, base: () => string): TranslationSwitcher {
  const translations = input.translations ?? {}
  const langs = Object.keys(translations)
  const original = shallowRef(input.doc)
  const locale = ref('root')
  const loaded = new Map<string, Promise<IRDocument>>()
  const documentOf = (lang: string): Promise<IRDocument> => {
    if (lang === 'root' || !translations[lang]) return Promise.resolve(original.value)
    let doc = loaded.get(lang)
    if (!doc) loaded.set(lang, doc = translations[lang]().then(module => module.default))
    return doc
  }
  return {
    langs,
    original,
    locale,
    prefix: computed(() => (locale.value === 'root' ? '' : `/${locale.value}`)),
    pagesOf: doc => (locale.value === 'root' ? webPages(doc) : translationPages(doc, webPages(original.value))),
    async switchTo(path, viewer) {
      if (locale.value === 'root') original.value = viewer.doc.value
      const lang = localeOf(path, base(), langs)
      const doc = await documentOf(lang)
      locale.value = lang
      if (viewer.doc.value !== doc) viewer.replace(doc)
    },
  }
}

/** Switches the language before a page loads, and leaves the client router for the pages of other documents. */
function installRouterHooks(router: Router, siteData: Ref<SiteData>, translation: TranslationSwitcher, pages: ComputedRef<WebPage[]>, viewer: Viewer): void {
  router.onBeforePageLoad = to => translation.switchTo(new URL(to, 'http://site').pathname, viewer)
  const ownPage = (path: string) => {
    const { base } = siteData.value
    if (!path.startsWith(base)) return false
    const lang = localeOf(path, base, translation.langs)
    let rest = path.slice(base.length + (lang === 'root' ? 0 : lang.length + 1))
    try {
      rest = decodeURI(rest)
    } catch {
    }
    const name = rest === '' || rest === 'index.html' ? 'index' : rest.replace(/\.html$/, '')
    return webPages(translation.original.value).some(page => page.path === name) || (lang !== 'root' && pages.value.some(page => page.path === name))
  }
  router.onBeforeRouteChange = (to) => {
    if (!inBrowser) return
    const url = new URL(to, location.href)
    if (url.origin !== location.origin || samePage(url.pathname, location.pathname) || ownPage(url.pathname)) return
    location.assign(url.href)
    return false
  }
}

interface RuntimeLifecycleInput {
  input: ThemeInput
  options: ThemeOptions
  viewer: Viewer
  shared: SharedStates
  original: ShallowRef<IRDocument>
  /** Fetches the current IR from the dev server; `force` fails when it cannot. */
  refresh(force?: boolean): Promise<void>
}

interface RuntimeLifecycle {
  /** Whether the runtime was last asked to be active. */
  isRequested(): boolean
  setActive: WebPreviewPage['setActive']
}

/**
 * Starts and pauses the document's runtime, the browser plugins and the page, as a preview asks: a paused page unmounts and
 * stops its plugins; on resuming it fetches the current IR and restarts them, or fails when they cannot restart safely.
 */
function createRuntimeLifecycle({ input, options, viewer, shared, original, refresh }: RuntimeLifecycleInput): RuntimeLifecycle {
  let requested = active.value
  let runtimeStarted = false
  let restartable = false
  let viewersLoaded = false
  let viewersValid = false
  let wasPaused = !requested
  let queue = Promise.resolve()
  const runtimeConfig = JSON.stringify(input.doc.config)
  const pauseMedia = () => {
    for (const media of document.querySelectorAll('audio, video')) (media as HTMLMediaElement).pause()
  }
  const setActive: WebPreviewPage['setActive'] = (on) => {
    requested = on
    const change = queue.then(async () => {
      if (!on) {
        if (!restartable || componentErrors().length > 0 || presmiumReport()?.plugins.some(plugin => plugin.status !== 'started')) {
          throw new Error('the document runtime cannot safely restart; reload the preview')
        }
        pauseMedia()
        active.value = false
        await nextTick()
        await setHostActive(false)
        wasPaused = true
        return
      }
      if (wasPaused) {
        await refresh(true)
        if (JSON.stringify(original.value.config) !== runtimeConfig || original.value.meta.lang !== input.doc.meta.lang) {
          throw new Error('the document runtime configuration changed; reload the preview')
        }
      }
      if (!runtimeStarted) {
        if (!viewersLoaded) {
          viewersReady = loadViewerPlugins(input.viewers ?? [])
          viewersValid = await viewersReady === true
          viewersLoaded = true
        }
        const server = requested && options.server ? createServerClient({ document: options.document }) : undefined
        if (requested) provideServer(server)
        const runtime = await startRuntime(input.plugins, viewer.doc.value, viewer, shared.transports, server, () => requested)
        runtimeStarted = runtime.started
        restartable = input.restartable === true && viewersValid && runtime.restartable
      } else await setHostActive(true)
      wasPaused = false
      // A queued pause checks the completed initial load before disposing anything.
      if (requested) {
        active.value = true
        await nextTick()
      }
    })
    queue = change.catch(() => undefined)
    return change
  }
  return { isRequested: () => requested, setActive }
}

export function createPresmiumTheme(input: ThemeInput): Theme {
  return {
    extends: DefaultTheme,
    Layout,
    enhanceApp({ app, router, siteData }) {
      const options: ThemeOptions = siteData.value.themeConfig.presmium ?? {}
      const links: CrossFormLinks = options.crossFormLinks ?? {}
      const translation = createTranslationSwitcher(input, () => siteData.value.base)
      const pages = computed(() => translation.pagesOf(viewer.doc.value))
      const sectionHrefs = computed(() => sectionLinks(pages.value, translation.prefix.value))
      const pageOf = (position: Position) => withBase((sectionHrefs.value[position.section] ?? `${translation.prefix.value}/`).split('#')[0]!)
      const viewer = createViewer(input.doc, {
        renderer: 'web',
        sectionHref: id => withBase(sectionHrefs.value[id] ?? `${translation.prefix.value}/#${id}`),
        sectionHeading(section, step) {
          if (embeddedPreview.value || !slidesBase.value) return null
          const t = WEB_MESSAGES[currentLocale()]
          return h('a', {
            'class': 'pm-open-slides',
            'href': slidesPositionUrl(slidesBase.value, links, section.index, step),
            'title': t.openInSlides,
            'aria-label': t.openInSlides,
            'data-label': t.slides,
          }, [slidesIcon()])
        },
        diagnostics: import.meta.env.DEV,
        openSource: import.meta.env.DEV && options.document === undefined
          ? source => void fetch(`${SOURCE_ENDPOINT}?file=${encodeURIComponent(source.file)}&line=${source.line}`, { method: 'POST', headers: { 'Presmium-Request': 'source' } })
          : undefined,
        navigate: position => void router.go(pageOf(position)),
        openPresenter(position) {
          const url = new URL(location.href)
          url.hash = ''
          url.search = withPositionQuery(url.search, { view: 'presenter', ...position })
          window.open(url.href, 'presmium-presenter', 'popup,width=1100,height=720')
        },
      })
      installRouterHooks(router, siteData, translation, pages, viewer)
      const shared = createSharedStates(input.doc.meta.title)
      installHost(app, createWebHostAdapter(viewer, { lang: siteData.value.lang, shared }))
      installViewer(app, viewer)
      app.provide(PAGES, { pages, prefix: translation.prefix })
      app.component('PresmiumPage', PresmiumPage)
      for (const [name, load] of Object.entries(input.components)) registerComponent(name, clientOnly(name, load))
      if (!inBrowser) return
      preview = input.preview
      if (preview) {
        active.value = preview.active
        embeddedPreview.value = preview.embedded
      }
      const { original, locale } = translation
      const lifecycle = createRuntimeLifecycle({ input, options, viewer, shared, original, refresh: force => refresh(force) })
      setActive = lifecycle.setActive
      watch(() => presmiumService(OPERATIONS), (operations, _, onCleanup) => {
        if (operations) onCleanup(syncViewerWithOperations(viewer, operations))
      }, { immediate: true })
      if (import.meta.env.PROD) setUpServiceWorker(offlineEnabled(input.doc.config.presmium))
      const refresh = subscribeDevUpdates(() => original.value, input.irRevision, options.ir ?? IR_ENDPOINT, (doc) => {
        original.value = doc
        if (locale.value === 'root') viewer.replace(doc)
        const site = siteData.value
        const nav = sidebar(doc, webPages(doc))
        if (site.title === doc.meta.title && JSON.stringify(site.themeConfig.sidebar) === JSON.stringify(nav)) return
        siteData.value = { ...site, title: doc.meta.title, themeConfig: { ...site.themeConfig, sidebar: nav } }
      }, lifecycle.isRequested)
      if (lifecycle.isRequested()) void setActive(true).catch(error => console.error('[presmium] the document runtime did not start', error))
    },
  }
}

import.meta.hot?.dispose(() => stopHost())
