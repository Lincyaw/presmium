import { createServerClient, createSharedStates, currentLocale, EDIT_MODE, installHost, OPERATIONS, pluginsOf, PmIcon, PmPresenterPanels, PmSegmented, PmToolbar, presmiumService, provideServer, registerPresmiumPlugin, reportPluginFailure, startHost, stopPresmium, TOOLBAR, useMessages, useService, useTheme } from '@presmium/host'
import type { ServerClient, SyncTransports, ToolbarItem, ToolbarSlot } from '@presmium/host'
import { errorMessage } from '@presmium/kernel'
import type { IRDocument } from '@presmium/kernel'
import { createViewer, followOperations, getView, installViewer, installViewerPlugin, OverlayHost, PmComponentFallback, registerComponent, useViewer, withSlideGlobals } from '@presmium/viewer'
import type { LiveUpdate, Position, Viewer } from '@presmium/viewer'
import { applyUpdate } from '@presmium/viewer/domain'
import type { Theme } from 'vitepress'
import { inBrowser, useData, withBase } from 'vitepress'
import DefaultTheme from 'vitepress/theme-without-fonts'
import type { Component } from 'vue'
import { computed, defineAsyncComponent, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, Teleport, watch, watchEffect } from 'vue'
import { IR_ENDPOINT, offlineEnabled, requested, samePage, SERVICE_WORKER, sectionLinks, sidebar, slideUrl, SOURCE_ENDPOINT, toPages, translationPages, viewSearch, WEB_MESSAGES } from '../domain/index.ts'
import type { FormOptions } from '../domain/index.ts'
import { createViewerHost, createViewerNavigation } from './host.ts'
import { SHELL_MESSAGES } from './messages.ts'
import { PAGES, PresmiumPage, ViewMenu } from './page.ts'
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
  /** The translations (P-123), by language, each the locale `/<lang>/` of the site: their IR, imported when a page of theirs opens. */
  translations?: Record<string, () => Promise<{ default: IRDocument }>>
}

/** What the generated site configuration tells the theme (`themeConfig.presmium`, see ../node/site.ts). */
interface ThemeOptions {
  form?: FormOptions
  /** `presmium dev` or `presmium serve` serves the pages. */
  server?: boolean
  /** In a workspace site: the document directory, the home page and the dev server's IR endpoint. */
  document?: string
  home?: string
  ir?: string
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
 * The labels that the default theme gives its sidebar, doc footer and the
 * navigation bar's menu buttons for assistive technology, in the deck's
 * language: its configuration has no option for them (R-72, F-79), so they
 * are set once a page has rendered. They are found by the ids and classes the
 * theme gives them (docs/architecture.md 9.1).
 */
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

const bySlot = (slot: ToolbarSlot) => (item: ToolbarItem) => item.slot === slot

/** The place of edit mode's top bar that the navigation bar's toolbar moves to. */
const EDIT_TOOLS = 'pm-edit-tools'

/** Whether the workspace's edit mode is on. Must be called inside a component setup. */
function useEditing() {
  const edit = useService(EDIT_MODE)
  return computed(() => Boolean(edit.value?.active.value))
}

/** The title of the workspace whose document this page is, from its home page's list (`presmium serve`). */
const workspaceTitle = ref<string>()
async function readWorkspaceTitle(home: string): Promise<void> {
  if (workspaceTitle.value !== undefined) return
  try {
    const response = await fetch(new URL('@presmium/documents.json', new URL(home, location.href)), { cache: 'no-store' })
    if (response.ok) workspaceTitle.value = ((await response.json()) as { title?: string }).title
  } catch {
    // The trail names the documents' list instead.
  }
}

/**
 * Edit mode's frame (the workspace's `EDIT_MODE`, docs/architecture.md 5.10,
 * 5.11; docs/design/edit.dc.html): an application filling the window. Its top
 * bar takes the navigation bar's place: the trail (workspace / document), the
 * open files (`tabs`), the preview's views (document, present, and the slides
 * where the deck has them) and the toolbar (`tools` and `settings`). Below
 * it, the panes of the split that plugins fill, the source at the left
 * (`source`) and panels at the right (`dock`), with the page between them as
 * the preview; the status bar (`status`, and the appearance switch) is at the
 * window's foot, and the chapters' sidebar and the pages' footers give way.
 * `<html>` has the classes `pm-editing`, `pm-edit-split` and `pm-edit-docked`
 * meanwhile.
 */
const EditFrame = defineComponent({
  name: 'PresmiumEditFrame',
  setup() {
    const t = useMessages(WEB_MESSAGES)
    const s = useMessages(SHELL_MESSAGES)
    const toolbar = useService(TOOLBAR)
    const viewer = useViewer()
    const theme = useTheme()
    const { site, theme: config } = useData()
    const slots = shallowRef(new Set<ToolbarSlot>())
    watchEffect((onCleanup) => {
      const registry = toolbar.value
      if (!registry) return
      const update = () => {
        slots.value = new Set(registry.list().map(item => item.slot ?? 'tools'))
      }
      update()
      onCleanup(registry.subscribe(update))
    })
    const active = useEditing()
    // A page a server serves may have edit mode (the workspace's plugin, in `presmium serve`); static output has none.
    // The bar is there from the start, so the navigation bar's toolbar always finds it.
    const editable = computed(() => Boolean(config.value.presmium?.server))
    const home = computed(() => config.value.presmium?.home as string | undefined)
    const classes = () => ({ 'pm-editing': active.value, 'pm-edit-split': active.value && slots.value.has('source'), 'pm-edit-docked': active.value && slots.value.has('dock') })
    // In the browser only: a server render has no document. The navigation bar gives way to the top bar: its
    // screen (a phone's menu, which locks the page's scrolling while open) closes first.
    onMounted(() => watchEffect(() => {
      if (active.value) document.querySelector<HTMLElement>('.VPNavBarHamburger.active')?.click()
      for (const [name, on] of Object.entries(classes())) document.documentElement.classList.toggle(name, on)
      if (active.value && home.value && config.value.presmium?.server) void readWorkspaceTitle(home.value)
    }))
    onBeforeUnmount(() => document.documentElement.classList.remove(...Object.keys(classes())))
    /** The preview's view: the page, or the present view over it. */
    const view = computed(() => (getView(viewer.view.value)?.kind === 'overlay' ? 'present' : 'document'))
    const setView = (next: string) => viewer.setView(next === 'present' ? 'present' : viewer.pageView.value)
    // Always there, shown in edit mode only: the navigation bar's toolbar moves into it when edit mode starts.
    const bar = () => h('header', { 'class': 'pm-edit-bar pm-ui', 'aria-label': s.value.editBar, 'style': active.value ? undefined : { display: 'none' } }, [
      h('nav', { 'class': 'pm-edit-bar__trail', 'aria-label': s.value.trail }, [
        h('a', { 'class': 'pm-edit-bar__logo', 'href': home.value ?? withBase('/'), 'aria-hidden': 'true', 'tabindex': -1 }, 'P'),
        home.value ? h('a', { class: 'pm-edit-bar__workspace', href: home.value }, workspaceTitle.value ?? t.value.documents) : null,
        home.value ? h('span', { 'class': 'pm-edit-bar__sep', 'aria-hidden': 'true' }, '/') : null,
        h('span', { 'class': 'pm-edit-bar__document', 'aria-current': 'page' }, site.value.title),
      ]),
      h(PmToolbar, { class: 'pm-edit-bar__tabs', filter: bySlot('tabs') }),
      h('div', { class: 'pm-edit-bar__end' }, [
        h(PmSegmented, { 'label': s.value.previewView, 'modelValue': view.value, 'options': [{ value: 'document', label: s.value.documentView }, { value: 'present', label: s.value.presentView }], 'onUpdate:modelValue': setView }),
        slidesBase.value
          ? h('a', { class: 'pm-ui-button pm-ui-button--ghost pm-ui-button--small pm-edit-bar__slides', href: slideUrl(slidesBase.value, config.value.presmium?.form ?? {}, viewer.section(viewer.position.value.section)?.index ?? 1, viewer.position.value.step), target: '_blank', rel: 'noopener' }, [h(PmIcon, { name: 'slides', size: 14, strokeWidth: 2 }), s.value.slides])
          : null,
        // The navigation bar's toolbar comes here (see the layout).
        h('div', { id: EDIT_TOOLS, class: 'pm-edit-bar__tools' }),
      ]),
    ])
    return () => [
      editable.value ? bar() : null,
      ...active.value
        ? [
          slots.value.has('source') ? h('section', { 'class': 'pm-edit-source pm-ui', 'aria-label': t.value.sourcePane }, [h(PmToolbar, { place: 'pane', filter: bySlot('source') })]) : null,
          slots.value.has('dock') ? h('aside', { 'class': 'pm-edit-dock pm-ui', 'aria-label': t.value.dockPane }, [h(PmToolbar, { place: 'pane', filter: bySlot('dock') })]) : null,
          h('footer', { 'class': 'pm-edit-status pm-ui', 'aria-label': t.value.statusBar }, [
            h(PmToolbar, { place: 'status', filter: bySlot('status') }),
            h('button', {
              'type': 'button',
              'class': 'pm-edit-status__theme',
              'aria-label': theme.dark.value ? t.value.toLight : t.value.toDark,
              'title': theme.dark.value ? t.value.toLight : t.value.toDark,
              'onClick': theme.toggle,
            }, [h(PmIcon, { name: theme.dark.value ? 'sun' : 'moon', size: 14 })]),
          ]),
        ]
        : [],
    ]
  },
})

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
    // In a workspace site, the navigation bar links the site's home page (the list of documents).
    const home = () => {
      const href = theme.value.presmium?.home
      return href ? h('a', { class: 'pm-site-link', href }, [h(PmIcon, { name: 'arrow-left', size: 14, strokeWidth: 2 }), WEB_MESSAGES[currentLocale()].documents]) : null
    }
    // The site shell's footer (P-78): the default theme shows its own on pages without a sidebar only, the
    // chapter pages have one. Its texts may hold inline HTML, as the default theme's.
    const footer = () => {
      const { message, copyright } = (theme.value.footer ?? {}) as { message?: string, copyright?: string }
      if (!message && !copyright) return null
      return h('footer', { class: 'pm-site-footer' }, [
        message ? h('p', { class: 'pm-site-footer__message', innerHTML: message }) : null,
        copyright ? h('p', { class: 'pm-site-footer__copyright', innerHTML: copyright }) : null,
      ])
    }
    // In edit mode the navigation bar's toolbar moves into edit mode's top bar, which takes the bar's place: the
    // same items, so what they hold (an open panel, a watch of edit mode) stays.
    const editing = useEditing()
    const toolbar = () => h(Teleport, { to: `#${EDIT_TOOLS}`, defer: true, disabled: !editing.value }, [h(PmToolbar, { class: editing.value ? 'pm-toolbar--edit' : 'pm-toolbar--bar' })])
    return () => h(DefaultTheme.Layout, null, {
      // On phones the view menu and the toolbar items move to the navigation screen (the menu), as VitePress
      // does with its links, so the bar keeps the width of the screen.
      'nav-bar-content-after': () => [home(), h(ViewMenu, { class: 'pm-view-menu--bar' }), toolbar()],
      'nav-screen-content-after': () => (editing.value ? [] : [home(), h(ViewMenu, { class: 'pm-view-menu--screen' }), h(PmToolbar, { class: 'pm-toolbar--screen' })]),
      'doc-after': footer,
      // Overlay views get the typography of the page body.
      'layout-bottom': () => [
        h('div', { class: 'vp-doc pm-overlay-views' }, [h(OverlayHost)]),
        viewer.view.value === 'presenter' ? h(PmPresenterPanels, { to: '.pm-presenter__side', docked: true }) : null,
        h(EditFrame),
      ],
    })
  },
})

/**
 * Live updates from `presmium dev` (docs/ir.md section 8.3), over Vite's
 * WebSocket, of the original. An update applies to the document of its
 * `base` revision; a page that holds another one (it loaded while the deck
 * was compiling, or missed updates while disconnected) gets the current
 * document instead, as it does whenever it connects. `follow` gets the
 * original as it is then. The answer to such a request is dropped when an
 * update was applied after it was asked, or the answer to a later request
 * (F-84): the server may have answered before it wrote that update's
 * document, and every later update comes over the WebSocket, in order.
 */
function followDevServer(original: () => IRDocument, revision: string | undefined, endpoint: string, follow: (doc: IRDocument) => void): void {
  const hot = import.meta.hot
  if (!hot) return
  let current = revision
  /** Updates applied from the WebSocket. */
  let updates = 0
  /** Requests for the current document made, and the latest one whose answer was applied. */
  let asked = 0
  let answered = 0
  const fetchCurrent = async () => {
    const request = ++asked
    const since = updates
    try {
      const response = await fetch(endpoint, { cache: 'no-store' })
      if (!response.ok) return
      const { revision: latest, doc } = await response.json() as { revision: string, doc: IRDocument }
      if (updates !== since || request < answered || latest === current) return
      answered = request
      current = latest
      follow(doc)
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
    updates++
    follow(applyUpdate(original(), update))
  })
  hot.on('vite:ws:connect', () => void fetchCurrent())
  void fetchCurrent()
}

/** The locale of a path of the site (VitePress names pages without the base in a server render): a translation's language, or `root`. */
function localeOf(path: string, base: string, langs: string[]): string {
  const rest = path.startsWith(base) ? path.slice(base.length) : path.replace(/^\//, '')
  const first = rest.split('/')[0]!
  return langs.includes(first) ? first : 'root'
}

/** The VitePress theme of the web form: default theme, the IR runtime, the web host adapter. */
export function createPresmiumTheme(input: ThemeInput): Theme {
  return {
    extends: DefaultTheme,
    Layout,
    enhanceApp({ app, router, siteData }) {
      const presmium: ThemeOptions = siteData.value.themeConfig.presmium ?? {}
      const form: FormOptions = presmium.form ?? {}
      // The translations (P-123): the viewer shows the document of the page's locale, the original or a
      // translation, whose pages bear the paths of the original's chapters; the original keeps its live updates.
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
        // The dev server of `presmium dev` opens the file in the author's editor (K-11); a workspace site's has no editor.
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
      // A page loads in the document of its locale (on the server too, where pages are rendered by path).
      router.onBeforePageLoad = async (to) => {
        // The original as the viewer holds it now, whatever replaced it.
        if (locale.value === 'root') original.value = current.doc.value
        const lang = localeOf(new URL(to, 'http://site').pathname, siteData.value.base, langs)
        const doc = await documentOf(lang)
        locale.value = lang
        if (current.doc.value !== doc) current.replace(doc)
      }
      // A link to anything but a page of this site (another document of a workspace site, its home page, a
      // published file such as a directory's file listing) loads that page, rather than the router's 404.
      const ownPage = (path: string) => {
        const { base } = siteData.value
        if (!path.startsWith(base)) return false
        const lang = localeOf(path, base, langs)
        let rest = path.slice(base.length + (lang === 'root' ? 0 : lang.length + 1))
        try {
          rest = decodeURI(rest)
        } catch {
          // As written.
        }
        const name = rest === '' || rest === 'index.html' ? 'index' : rest.replace(/\.html$/, '')
        return toPages(original.value).some(page => page.path === name) || (lang !== 'root' && pages.value.some(page => page.path === name))
      }
      router.onBeforeRouteChange = (to) => {
        if (!inBrowser) return
        const url = new URL(to, location.href)
        // The page the router opens first is the one loaded (`/web` is `/web.html` to the router).
        if (url.origin !== location.origin || samePage(url.pathname, location.pathname) || ownPage(url.pathname)) return
        location.assign(url.href)
        return false
      }
      // Shared states of the deck's windows, kept by title (so both forms meet in a classroom) and base.
      const shared = createSharedStates(input.doc.meta.title)
      installHost(app, createViewerHost(current, { lang: siteData.value.lang, shared }))
      installViewer(app, current)
      app.provide(PAGES, { pages, prefix })
      app.component('PresmiumPage', PresmiumPage)
      for (const [name, load] of Object.entries(input.components)) registerComponent(name, clientOnly(name, load))
      if (!inBrowser) return
      viewersReady = loadViewerPlugins(input.viewers ?? [])
      // `presmium dev` or `presmium serve` serves the page: the server's client, given before any component asks for it
      // (`useServer`); in a workspace site it names the page's document.
      const server = presmium.server ? createServerClient({ document: presmium.document }) : undefined
      provideServer(server)
      void startKernel(input.plugins, input.doc, current, shared.transports, server)
      // The IR runtime reports and replays `go` through the running kernel's operations (each start has its own).
      watch(() => presmiumService(OPERATIONS), (operations, _, onCleanup) => {
        if (operations) onCleanup(followOperations(current, operations))
      }, { immediate: true })
      if (import.meta.env.PROD) serviceWorker(offlineEnabled(input.doc.config.presmium))
      // The site title and the sidebar follow the original here, so the config never changes and the page
      // never reloads; a page of a translation keeps its document.
      followDevServer(() => original.value, input.revision, presmium.ir ?? IR_ENDPOINT, (doc) => {
        original.value = doc
        if (locale.value === 'root') current.replace(doc)
        const site = siteData.value
        const nav = sidebar(doc, toPages(doc))
        if (site.title === doc.meta.title && JSON.stringify(site.themeConfig.sidebar) === JSON.stringify(nav)) return
        siteData.value = { ...site, title: doc.meta.title, themeConfig: { ...site.themeConfig, sidebar: nav } }
      })
    },
  }
}

import.meta.hot?.dispose(() => stopPresmium())
