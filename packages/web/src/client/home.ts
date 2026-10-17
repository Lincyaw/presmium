/**
 * The home page of a workspace site (P-122): the documents, as cards, with a
 * search box and their tags, each linking to its pages. In `presmium serve`
 * (and `presmium dev`) the page has the server and is a workbench (N-10,
 * docs/design/home.dc.html): the activity bar, the workspace's files, the
 * launcher with its search (Ctrl K) and the status bar, around the cards. It
 * starts the host (the toolbar, the server's client, the approvals) and the
 * site's plugins, e.g. the workspace's browser plugin, whose entries fill the
 * places of the workbench (`ToolbarItem.slot`); the list follows the server
 * (re-read when a plugin says the documents changed, the window event
 * `presmium:documents`). A static site keeps the default theme's page, with
 * the same cards.
 */
import { createServerClient, createSharedStates, currentLocale, installHost, PmButton, PmCard, PmEmpty, PmIcon, PmIconButton, pluginsOf, PmToolbar, presmiumReport, presmiumService, provideServer, registerPresmiumPlugin, startHost, useMessages, useTheme } from '@presmium/host'
import type { HostAdapter, Navigation, ToolbarItem } from '@presmium/host'
import { FINAL_STEP } from '@presmium/viewer'
import type { Theme } from 'vitepress'
import { Content, inBrowser, useData } from 'vitepress'
import DefaultTheme from 'vitepress/theme-without-fonts'
import type { InjectionKey } from 'vue'
import { computed, defineComponent, h, inject, onBeforeUnmount, onMounted, provide, readonly, ref, shallowRef } from 'vue'
import { samePage, WEB_MESSAGES } from '../domain/index.ts'
import './style.css'

export interface SiteHomeInput {
  /** Loaders of the site's plugins' `src/client/plugin.ts`. */
  plugins: (() => Promise<unknown>)[]
}

/**
 * A document as the home page lists it (see ../node/sites.ts). A card shows
 * the description, the number of pages and the result of the checks when
 * the list has them.
 */
interface HomeDocument {
  dir: string
  title: string
  lang?: string
  tags?: string[]
  href: string
  description?: string
  pages?: number
  problems?: { errors: number, warnings: number }
}

/** The event a plugin sends after it changed the documents, so the list is read again. */
export const DOCUMENTS_EVENT = 'presmium:documents'

/** The configuration the home page's plugins get: they are on the home page of a workspace site. */
const HOME_CONFIG = { 'presmium.workspace': { home: true } }

/** The documents read from the server, once it has answered; before, those of the site's data. */
const served = shallowRef<HomeDocument[]>()
/** The launcher's search, which the workbench's bar holds and the list filters by. */
const query = ref('')
/** The cards are in the workbench, whose bar has the search box. */
const IN_WORKBENCH: InjectionKey<boolean> = Symbol('presmium.workbench')

/** The documents of the site, following the server in `presmium serve`. Must be called inside a component setup. */
function useDocuments() {
  const { theme } = useData()
  const options = computed(() => theme.value.presmium ?? {})
  onMounted(() => {
    const endpoint = options.value.endpoint as string | undefined
    if (!endpoint || served.value) return
    const refresh = async () => {
      try {
        const response = await fetch(endpoint, { cache: 'no-store' })
        if (response.ok) served.value = ((await response.json()) as { documents: HomeDocument[] }).documents
      } catch (error) {
        console.warn('[presmium] could not read the documents of the site', error)
      }
    }
    served.value = options.value.documents ?? []
    void refresh()
    window.addEventListener(DOCUMENTS_EVENT, () => void refresh())
  })
  return computed<HomeDocument[]>(() => served.value ?? options.value.documents ?? [])
}

/** The items of a place of the workbench (`ToolbarItem.slot`). */
const inTools = (item: ToolbarItem) => !item.slot || item.slot === 'tools'
const bySlot = (slot: ToolbarItem['slot']) => (item: ToolbarItem) => item.slot === slot

/** A document's card: its title (the link, the whole card's), its description, its directory, pages, language, tags and checks. */
function card(doc: HomeDocument, t: typeof WEB_MESSAGES[keyof typeof WEB_MESSAGES]) {
  const badge = (text: string, tone = '') => h('span', { class: `pm-ui-badge${tone ? ` pm-ui-badge--${tone}` : ''}` }, text)
  const problems = doc.problems
  return h('li', { 'class': 'pm-site-home__document pm-ui-card pm-ui-card--interactive', 'data-document': doc.dir }, [
    h('a', { class: 'pm-site-home__link', href: doc.href, ...doc.lang ? { lang: doc.lang } : {} }, doc.title),
    doc.description ? h('p', { class: 'pm-site-home__description' }, doc.description) : null,
    h('div', { class: 'pm-ui-badges' }, [
      h('span', { class: 'pm-site-home__dir pm-ui-badge' }, `${doc.dir}/`),
      doc.pages ? badge(t.pages(doc.pages)) : null,
      doc.lang ? badge(doc.lang) : null,
      ...(doc.tags ?? []).map(name => h('span', { class: 'pm-site-home__badge pm-ui-badge' }, name)),
      problems ? problems.errors ? badge(t.errors(problems.errors), 'danger') : problems.warnings ? badge(t.warnings(problems.warnings), 'warn') : badge(t.checked, 'ok') : null,
    ]),
  ])
}

/** The card of the MCP service (`/mcp`): its address, to copy, for an outside agent. */
const McpCard = defineComponent({
  name: 'PresmiumMcpCard',
  setup() {
    const t = useMessages(WEB_MESSAGES)
    const address = ref('')
    const copied = ref(false)
    onMounted(() => address.value = `${location.origin}/mcp`)
    const copy = async () => {
      await navigator.clipboard?.writeText(address.value).catch(() => {})
      copied.value = true
      setTimeout(() => copied.value = false, 2000)
    }
    return () => h(PmCard, { class: 'pm-site-home__mcp' }, () => [
      h('h2', { class: 'pm-ui-heading' }, t.value.mcp),
      h('div', { class: 'pm-site-home__address' }, [
        h('code', address.value),
        h(PmButton, { small: true, icon: copied.value ? 'check' : 'copy', onClick: () => void copy() }, () => (copied.value ? t.value.copied : t.value.copy)),
      ]),
      h('p', { class: 'pm-site-home__hint' }, t.value.mcpHint),
    ])
  },
})

/** The launcher's search box; Ctrl K (⌘ K) focuses it. */
const SearchBox = defineComponent({
  name: 'PresmiumSiteSearch',
  setup() {
    const t = useMessages(WEB_MESSAGES)
    const input = ref<HTMLInputElement>()
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        input.value?.focus()
      }
    }
    onMounted(() => window.addEventListener('keydown', onKey))
    onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
    return () => h('label', { class: 'pm-ui-search pm-site-home__search-box' }, [
      h(PmIcon, { name: 'search', size: 15, strokeWidth: 1.8 }),
      h('input', {
        'ref': input,
        'class': 'pm-site-home__search',
        'type': 'search',
        'value': query.value,
        'placeholder': t.value.searchDocuments,
        'aria-label': t.value.searchDocuments,
        'onInput': (event: Event) => query.value = (event.target as HTMLInputElement).value,
      }),
      h('kbd', { class: 'pm-ui-kbd' }, 'Ctrl K'),
    ])
  },
})

const SiteHome = defineComponent({
  name: 'PresmiumSiteHome',
  setup() {
    const { site, theme } = useData()
    const documents = useDocuments()
    const tag = ref<string>()
    const workbench = inject(IN_WORKBENCH, false)
    const t = computed(() => WEB_MESSAGES[currentLocale()])
    const tags = computed(() => [...new Set(documents.value.flatMap(doc => doc.tags ?? []))].sort())
    const shown = computed(() => {
      const words = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
      return documents.value.filter(doc => (!tag.value || doc.tags?.includes(tag.value))
        && words.every(word => `${doc.title} ${doc.dir} ${doc.description ?? ''} ${(doc.tags ?? []).join(' ')}`.toLowerCase().includes(word)))
    })
    return () => h('div', { class: ['pm-site-home', 'pm-ui', workbench && 'pm-site-home--workbench'] }, [
      workbench ? null : h('h1', { class: 'pm-site-home__title' }, site.value.title),
      h('section', { 'class': 'pm-site-home__section', 'aria-labelledby': 'pm-site-home-documents' }, [
        h('div', { class: 'pm-site-home__filters' }, [
          h('h2', { id: 'pm-site-home-documents', class: 'pm-ui-heading' }, t.value.documentsHeading),
          workbench ? null : h(SearchBox),
          tags.value.length > 0
            ? h('div', { 'class': 'pm-site-home__tags pm-ui-segmented', 'role': 'group', 'aria-label': t.value.tags }, [
                h('button', { 'type': 'button', 'class': 'pm-site-home__tag pm-ui-segmented__option', 'aria-pressed': tag.value === undefined, 'onClick': () => tag.value = undefined }, t.value.allTags),
                ...tags.value.map(name => h('button', { 'type': 'button', 'class': 'pm-site-home__tag pm-ui-segmented__option', 'aria-pressed': tag.value === name, 'onClick': () => tag.value = tag.value === name ? undefined : name }, name)),
              ])
            : null,
        ]),
        h('div', { class: 'pm-site-home__grid' }, [
          shown.value.length === 0
            ? h(PmEmpty, { class: 'pm-site-home__empty', icon: 'document' }, () => t.value.noDocuments)
            : h('ul', { class: 'pm-site-home__documents', role: 'list' }, shown.value.map(doc => card(doc, t.value))),
          h(PmToolbar, { place: 'home', filter: bySlot('create') }),
        ]),
      ]),
      theme.value.presmium?.server
        ? h('section', { class: 'pm-site-home__cards' }, [h(PmToolbar, { place: 'home', filter: bySlot('home') }), h(McpCard)])
        : null,
    ])
  },
})

/**
 * The home page of a site whose `site.home` names a document: it leads to
 * that document (a refresh in the page's head does without JavaScript too),
 * and says so with a link meanwhile.
 */
const SiteRedirect = defineComponent({
  name: 'PresmiumSiteRedirect',
  setup() {
    const { theme, page } = useData()
    const href = computed(() => theme.value.presmium?.redirect as string | undefined)
    onMounted(() => {
      if (href.value) location.replace(href.value)
    })
    return () => h('p', { class: 'pm-site-home' }, [h('a', { class: 'pm-site-home__link', href: href.value }, page.value.title)])
  },
})

/** The host of the home page: no document, no steps; the toolbar, the shared states, the server's client and the appearance switch. */
function homeHost(lang: string, sharedState: HostAdapter['useSharedState']): HostAdapter {
  const cursor = readonly(ref({ slide: 1, step: 0 }))
  return {
    mode: 'document',
    lang,
    useCursor: () => cursor,
    useStep: () => readonly(ref(FINAL_STEP)),
    useViewRole: () => readonly(ref('reader' as const)),
    useStaticRender: () => readonly(ref(false)),
    useSectionConfig: () => readonly(ref({})),
    useSharedState: sharedState,
    getService: presmiumService,
    startReport: presmiumReport,
    useDarkMode: () => useData().isDark,
  }
}

/** The workspace's files in the side bar: each document's directory (its pages), and the workspace's configuration. */
const Files = defineComponent({
  name: 'PresmiumWorkspaceFiles',
  setup() {
    const { site } = useData()
    const documents = useDocuments()
    const t = useMessages(WEB_MESSAGES)
    return () => h('aside', { 'class': 'pm-workbench__files', 'aria-label': t.value.files }, [
      h('p', { class: 'pm-workbench__name' }, site.value.title),
      h('ul', { class: 'pm-workbench__tree', role: 'list' }, [
        ...documents.value.map(doc => h('li', { key: doc.dir }, [
          h('a', { class: 'pm-workbench__file', href: doc.href, title: doc.title }, [h(PmIcon, { name: 'folder', size: 15 }), `${doc.dir}/`]),
        ])),
        h('li', [h('span', { class: 'pm-workbench__file pm-workbench__file--plain' }, [h(PmIcon, { name: 'document', size: 15 }), 'presmium.workspace.yaml'])]),
      ]),
    ])
  },
})

/** The workbench of a served home page (docs/design/home.dc.html). */
const Workbench = defineComponent({
  name: 'PresmiumWorkbench',
  setup() {
    provide(IN_WORKBENCH, true)
    const t = useMessages(WEB_MESSAGES)
    const theme = useTheme()
    const focusSearch = () => document.querySelector<HTMLInputElement>('.pm-workbench .pm-site-home__search')?.focus()
    const toDocuments = () => {
      document.querySelector('.pm-workbench__main')?.scrollTo({ top: 0 })
      document.querySelector<HTMLElement>('.pm-site-home__link')?.focus()
    }
    return () => h('div', { class: 'pm-workbench pm-ui' }, [
      h('nav', { 'class': 'pm-workbench__activity', 'aria-label': t.value.activity }, [
        h('div', { 'class': 'pm-workbench__logo', 'aria-hidden': 'true' }, 'P'),
        h(PmIconButton, { 'icon': 'document', 'label': t.value.documentsHeading, 'aria-pressed': 'true', 'onClick': toDocuments }),
        h(PmIconButton, { icon: 'search', label: t.value.search, onClick: focusSearch }),
        h(PmToolbar, { place: 'activity', filter: (item: ToolbarItem) => inTools(item) && Boolean(item.icon) }),
        h('div', { class: 'pm-workbench__activity-end' }, [h(PmToolbar, { place: 'activity', filter: bySlot('settings') })]),
      ]),
      h(Files),
      h('div', { class: 'pm-workbench__main' }, [
        h('header', { class: 'pm-workbench__bar' }, [
          h('span', { class: 'pm-workbench__title' }, t.value.launcher),
          h(SearchBox),
          h('div', { class: 'pm-workbench__actions' }, [h(PmToolbar, { filter: (item: ToolbarItem) => inTools(item) && !item.icon })]),
        ]),
        h('main', { class: 'pm-workbench__content' }, [h(Content)]),
        h('footer', { 'class': 'pm-workbench__status', 'aria-label': t.value.statusBar }, [
          h(PmToolbar, { place: 'status', filter: bySlot('status') }),
          h('button', {
            'type': 'button',
            'class': 'pm-workbench__theme',
            'aria-label': theme.dark.value ? t.value.toLight : t.value.toDark,
            'title': theme.dark.value ? t.value.toLight : t.value.toDark,
            'onClick': theme.toggle,
          }, [h(PmIcon, { name: theme.dark.value ? 'sun' : 'moon', size: 14 })]),
        ]),
      ]),
    ])
  },
})

const Layout = defineComponent({
  name: 'PresmiumSiteHomeLayout',
  setup() {
    const { theme, page } = useData()
    return () => (theme.value.presmium?.server && !page.value.isNotFound
      ? h(Workbench)
      : h(DefaultTheme.Layout, null, {
          'nav-bar-content-after': () => h(PmToolbar, { class: 'pm-toolbar--bar' }),
          'nav-screen-content-after': () => h(PmToolbar, { class: 'pm-toolbar--screen' }),
        }))
  },
})

/** The VitePress theme of a workspace site's home page. */
export function createSiteHomeTheme(input: SiteHomeInput): Theme {
  return {
    extends: DefaultTheme,
    Layout,
    enhanceApp({ app, router, siteData }) {
      app.component('PresmiumSiteHome', SiteHome)
      app.component('PresmiumSiteRedirect', SiteRedirect)
      // The documents are sites of their own: a link to one loads it, rather than the router's 404.
      router.onBeforeRouteChange = (to) => {
        if (!inBrowser) return
        const url = new URL(to, location.href)
        const { base } = siteData.value
        const own = [base, `${base}index.html`, siteData.value.themeConfig.presmium?.list]
        if (url.origin !== location.origin || samePage(url.pathname, location.pathname) || own.includes(url.pathname)) return
        location.assign(url.href)
        return false
      }
      const shared = createSharedStates(`${siteData.value.title} (home)`)
      installHost(app, homeHost(siteData.value.lang, shared.sharedState))
      if (!inBrowser) return
      const served = Boolean(siteData.value.themeConfig.presmium?.server)
      const server = served ? createServerClient({ document: '' }) : undefined
      provideServer(server)
      const navigation: Navigation = { position: computed(() => ({ slide: 1, step: 0 })), go: () => {} }
      void Promise.all(input.plugins.map(load => load().catch((error: unknown) => {
        console.error('[presmium] a plugin module failed to load', error)
        return {}
      }))).then((modules) => {
        modules.flatMap(module => pluginsOf(module, HOME_CONFIG)).forEach(registerPresmiumPlugin)
        return startHost({ mode: 'document', config: HOME_CONFIG, navigation, transports: shared.transports, server })
      })
    },
  }
}
