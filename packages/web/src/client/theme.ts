import { componentErrors, createServerClient, createSharedStates, currentLocale, installHost, OPERATIONS, pluginsOf, PmIcon, PmPresenterPanels, PmToolbar, presmiumReport, presmiumService, provideServer, registerPresmiumPlugin, reportPluginFailure, setHostActive, startHost, stopPresmium } from '@lincyaw/host'
import type { ServerClient, SyncTransports } from '@lincyaw/host'
import { errorMessage, isPreviewActive } from '@lincyaw/kernel'
import type { IRDocument } from '@lincyaw/kernel'
import { createViewer, followOperations, getView, installViewer, installViewerPlugin, OverlayHost, PmComponentFallback, registerComponent, useViewer, withSlideGlobals } from '@lincyaw/viewer'
import type { LiveUpdate, Position, Viewer } from '@lincyaw/viewer'
import { applyUpdate } from '@lincyaw/viewer/domain'
import type { Theme } from 'vitepress'
import { inBrowser, useData, withBase } from 'vitepress'
import DefaultTheme from 'vitepress/theme-without-fonts'
import type { Component } from 'vue'
import { computed, defineAsyncComponent, defineComponent, h, nextTick, onMounted, ref, shallowRef, watch } from 'vue'
import { IR_ENDPOINT, offlineEnabled, requested, samePage, SERVICE_WORKER, sectionLinks, sidebar, slideUrl, SOURCE_ENDPOINT, toPages, translationPages, viewSearch, WEB_MESSAGES } from '../domain/index.ts'
import type { FormOptions } from '../domain/index.ts'
import { createViewerHost, createViewerNavigation } from './host.ts'
import { PAGES, PresmiumPage, ViewMenu } from './page.ts'
import type { WebPreviewPage } from './preview-frame.ts'
import './style.css'

export interface ViewerModule {
  name: string
  load: () => Promise<unknown>
}

export interface ThemeInput {
  doc: IRDocument
  revision?: string
  components: Record<string, () => Promise<unknown>>
  plugins: (() => Promise<unknown>)[]
  restartable?: boolean
  viewers?: ViewerModule[]
  translations?: Record<string, () => Promise<{ default: IRDocument }>>
  preview?: (page: WebPreviewPage) => void
}

interface ThemeOptions {
  form?: FormOptions
  server?: boolean
  document?: string
  home?: string
  ir?: string
}

interface UpdateEvent {
  update: LiveUpdate
  base: string
  revision: string
}

async function startKernel(loaders: ThemeInput['plugins'], doc: IRDocument, viewer: Viewer, transports: SyncTransports, server: ServerClient | undefined, enabled: () => boolean): Promise<{ started: boolean, restartable: boolean }> {
  const config = doc.config.presmium
  let failed = false
  const modules = await Promise.all(loaders.map(load => load().catch((error) => {
    failed = true
    console.error('[presmium] a plugin module failed to load', error)
    return {}
  })))
  const plugins = modules.flatMap(module => pluginsOf(module, config))
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
      const reason = installViewerPlugin(((await load()) as { default?: unknown }).default, id)
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
const active = ref(isPreviewActive())
const embeddedPreview = ref(false)
let preview: ThemeInput['preview']
let setActive: WebPreviewPage['setActive'] = async () => {}
let viewersReady: Promise<unknown> = Promise.resolve()

const Layout = defineComponent({
  name: 'PresmiumLayout',
  setup() {
    const viewer = useViewer()
    const { theme, page, isDark } = useData()
    onMounted(async () => {
      const agent = preview
      preview = undefined
      agent?.({ viewer, dark: isDark, setActive })
      embeddedPreview.value = document.documentElement.dataset.presmiumPreview === 'on'
      localizeHiddenLabels()
      watch(() => page.value.relativePath, () => void nextTick(localizeHiddenLabels), { flush: 'post' })
      watch(active, () => void nextTick(localizeHiddenLabels), { flush: 'post' })
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
    return () => active.value ? h(DefaultTheme.Layout, null, {
      'nav-bar-content-after': () => [home(), h(ViewMenu, { class: 'pm-view-menu--bar' }), h(PmToolbar, { class: 'pm-toolbar--bar' })],
      'nav-screen-content-after': () => [home(), h(ViewMenu, { class: 'pm-view-menu--screen' }), h(PmToolbar, { class: 'pm-toolbar--screen' })],
      'doc-after': footer,
      'layout-bottom': () => [
        h('div', { class: 'vp-doc pm-overlay-views' }, [h(OverlayHost)]),
        viewer.view.value === 'presenter' ? h(PmPresenterPanels, { to: '.pm-presenter__side', docked: true }) : null,
      ],
    }) : null
  },
})

function followDevServer(original: () => IRDocument, revision: string | undefined, endpoint: string, follow: (doc: IRDocument) => void, enabled: () => boolean): (force?: boolean) => Promise<void> {
  const hot = import.meta.hot
  if (!hot) return async () => {}
  let current = revision
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
      follow(doc)
    } catch (error) {
      console.warn('[presmium] could not get the current document from the dev server', error)
      if (force) throw error
    }
  }
  hot.on('presmium:update', ({ update, base, revision: next }: UpdateEvent) => {
    if (!enabled()) return
    if (base !== current) {
      void fetchCurrent()
      return
    }
    current = next
    updates++
    follow(applyUpdate(original(), update))
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

export function createPresmiumTheme(input: ThemeInput): Theme {
  return {
    extends: DefaultTheme,
    Layout,
    enhanceApp({ app, router, siteData }) {
      const presmium: ThemeOptions = siteData.value.themeConfig.presmium ?? {}
      const form: FormOptions = presmium.form ?? {}
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
      const pages = computed(() => (locale.value === 'root' ? toPages(current.doc.value) : translationPages(current.doc.value, toPages(original.value))))
      const prefix = computed(() => (locale.value === 'root' ? '' : `/${locale.value}`))
      const links = computed(() => sectionLinks(pages.value, prefix.value))
      const pageOf = (position: Position) => withBase((links.value[position.section] ?? `${prefix.value}/`).split('#')[0]!)
      const current = createViewer(input.doc, {
        renderer: 'web',
        sectionHref: id => withBase(links.value[id] ?? `${prefix.value}/#${id}`),
        sectionHeading(section, step) {
          if (embeddedPreview.value || !slidesBase.value) return null
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
        openSource: import.meta.env.DEV && presmium.document === undefined
          ? source => void fetch(`${SOURCE_ENDPOINT}?file=${encodeURIComponent(source.file)}&line=${source.line}`, { method: 'POST', headers: { 'Presmium-Request': 'source' } })
          : undefined,
        navigate: position => void router.go(pageOf(position)),
        openPresenter(position) {
          const url = new URL(location.href)
          url.hash = ''
          url.search = viewSearch(url.search, { view: 'presenter', ...position })
          window.open(url.href, 'presmium-presenter', 'popup,width=1100,height=720')
        },
      })
      router.onBeforePageLoad = async (to) => {
        if (locale.value === 'root') original.value = current.doc.value
        const lang = localeOf(new URL(to, 'http://site').pathname, siteData.value.base, langs)
        const doc = await documentOf(lang)
        locale.value = lang
        if (current.doc.value !== doc) current.replace(doc)
      }
      const ownPage = (path: string) => {
        const { base } = siteData.value
        if (!path.startsWith(base)) return false
        const lang = localeOf(path, base, langs)
        let rest = path.slice(base.length + (lang === 'root' ? 0 : lang.length + 1))
        try {
          rest = decodeURI(rest)
        } catch {
        }
        const name = rest === '' || rest === 'index.html' ? 'index' : rest.replace(/\.html$/, '')
        return toPages(original.value).some(page => page.path === name) || (lang !== 'root' && pages.value.some(page => page.path === name))
      }
      router.onBeforeRouteChange = (to) => {
        if (!inBrowser) return
        const url = new URL(to, location.href)
        if (url.origin !== location.origin || samePage(url.pathname, location.pathname) || ownPage(url.pathname)) return
        location.assign(url.href)
        return false
      }
      const shared = createSharedStates(input.doc.meta.title)
      installHost(app, createViewerHost(current, { lang: siteData.value.lang, shared }))
      installViewer(app, current)
      app.provide(PAGES, { pages, prefix })
      app.component('PresmiumPage', PresmiumPage)
      for (const [name, load] of Object.entries(input.components)) registerComponent(name, clientOnly(name, load))
      if (!inBrowser) return
      preview = input.preview
      let requestedActive = active.value
      let kernelLoaded = false
      let restartable = false
      let viewersLoaded = false
      let viewersValid = false
      let wasPaused = !requestedActive
      let lifecycle = Promise.resolve()
      const runtimeConfig = JSON.stringify(input.doc.config)
      watch(() => presmiumService(OPERATIONS), (operations, _, onCleanup) => {
        if (operations) onCleanup(followOperations(current, operations))
      }, { immediate: true })
      if (import.meta.env.PROD) serviceWorker(offlineEnabled(input.doc.config.presmium))
      const refresh = followDevServer(() => original.value, input.revision, presmium.ir ?? IR_ENDPOINT, (doc) => {
        original.value = doc
        if (locale.value === 'root') current.replace(doc)
        const site = siteData.value
        const nav = sidebar(doc, toPages(doc))
        if (site.title === doc.meta.title && JSON.stringify(site.themeConfig.sidebar) === JSON.stringify(nav)) return
        siteData.value = { ...site, title: doc.meta.title, themeConfig: { ...site.themeConfig, sidebar: nav } }
      }, () => requestedActive)
      const pauseMedia = () => {
        for (const media of document.querySelectorAll('audio, video')) (media as HTMLMediaElement).pause()
      }
      setActive = (on) => {
        requestedActive = on
        const change = lifecycle.then(async () => {
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
          if (!kernelLoaded) {
            if (!viewersLoaded) {
              viewersReady = loadViewerPlugins(input.viewers ?? [])
              viewersValid = await viewersReady === true
              viewersLoaded = true
            }
            const server = requestedActive && presmium.server ? createServerClient({ document: presmium.document }) : undefined
            if (requestedActive) provideServer(server)
            const kernel = await startKernel(input.plugins, current.doc.value, current, shared.transports, server, () => requestedActive)
            kernelLoaded = kernel.started
            restartable = input.restartable === true && viewersValid && kernel.restartable
          } else await setHostActive(true)
          wasPaused = false
          // A queued pause checks the completed initial load before disposing anything.
          if (requestedActive) {
            active.value = true
            await nextTick()
          }
        })
        lifecycle = change.catch(() => undefined)
        return change
      }
      if (requestedActive) void setActive(true).catch(error => console.error('[presmium] the document runtime did not start', error))
    },
  }
}

import.meta.hot?.dispose(() => stopPresmium())
