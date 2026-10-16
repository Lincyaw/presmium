/**
 * The home page of a workspace site (P-122): the documents, with a search
 * box and their tags, each linking to its pages. In `presmium serve` the page
 * has the server: it starts the host (the toolbar, the server's client for
 * the workspace, the approvals) and the site's plugins, e.g. the workspace's
 * browser plugin, which adds the document operations to the toolbar; the
 * list follows the server (re-read when a plugin says the documents changed,
 * the window event `presmium:documents`).
 */
import { createServerClient, createSharedStates, currentLocale, installHost, pluginsOf, PmToolbar, presmiumReport, presmiumService, provideServer, registerPresmiumPlugin, startHost } from '@presmium/host'
import type { HostAdapter, Navigation } from '@presmium/host'
import { FINAL_STEP } from '@presmium/viewer'
import type { Theme } from 'vitepress'
import { inBrowser, useData } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import { computed, defineComponent, h, onBeforeUnmount, onMounted, readonly, ref, shallowRef } from 'vue'
import { samePage, WEB_MESSAGES } from '../domain/index.ts'
import './style.css'

export interface SiteHomeInput {
  /** Loaders of the site's plugins' `src/client/plugin.ts`. */
  plugins: (() => Promise<unknown>)[]
}

/** A document as the home page lists it (see ../node/sites.ts). */
interface HomeDocument {
  dir: string
  title: string
  lang?: string
  tags?: string[]
  href: string
}

/** The event a plugin sends after it changed the documents, so the list is read again. */
export const DOCUMENTS_EVENT = 'presmium:documents'

/** The configuration the home page's plugins get: they are on the home page of a workspace site. */
const HOME_CONFIG = { 'presmium.workspace': { home: true } }

const SiteHome = defineComponent({
  name: 'PresmiumSiteHome',
  setup() {
    const { theme, site } = useData()
    const options = computed(() => theme.value.presmium ?? {})
    const documents = shallowRef<HomeDocument[]>(options.value.documents ?? [])
    const query = ref('')
    const tag = ref<string>()
    const t = computed(() => WEB_MESSAGES[currentLocale()])
    const refresh = async () => {
      if (!options.value.endpoint) return
      try {
        const response = await fetch(options.value.endpoint, { cache: 'no-store' })
        if (response.ok) documents.value = ((await response.json()) as { documents: HomeDocument[] }).documents
      } catch (error) {
        console.warn('[presmium] could not read the documents of the site', error)
      }
    }
    const onChange = () => void refresh()
    onMounted(() => {
      void refresh()
      window.addEventListener(DOCUMENTS_EVENT, onChange)
    })
    onBeforeUnmount(() => window.removeEventListener(DOCUMENTS_EVENT, onChange))
    const tags = computed(() => [...new Set(documents.value.flatMap(doc => doc.tags ?? []))].sort())
    const shown = computed(() => {
      const words = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
      return documents.value.filter(doc => (!tag.value || doc.tags?.includes(tag.value))
        && words.every(word => `${doc.title} ${doc.dir} ${(doc.tags ?? []).join(' ')}`.toLowerCase().includes(word)))
    })
    return () => h('div', { class: 'pm-site-home' }, [
      h('h1', { class: 'pm-site-home__title' }, site.value.title),
      h('div', { class: 'pm-site-home__filters' }, [
        h('input', {
          'class': 'pm-site-home__search',
          'type': 'search',
          'value': query.value,
          'placeholder': t.value.searchDocuments,
          'aria-label': t.value.searchDocuments,
          'onInput': (event: Event) => query.value = (event.target as HTMLInputElement).value,
        }),
        tags.value.length > 0
          ? h('div', { 'class': 'pm-site-home__tags', 'role': 'group', 'aria-label': t.value.tags }, [
              h('button', { 'type': 'button', 'class': 'pm-site-home__tag', 'aria-pressed': tag.value === undefined, 'onClick': () => tag.value = undefined }, t.value.allTags),
              ...tags.value.map(name => h('button', { 'type': 'button', 'class': 'pm-site-home__tag', 'aria-pressed': tag.value === name, 'onClick': () => tag.value = tag.value === name ? undefined : name }, name)),
            ])
          : null,
      ]),
      shown.value.length === 0
        ? h('p', { class: 'pm-site-home__empty' }, t.value.noDocuments)
        : h('ul', { class: 'pm-site-home__documents' }, shown.value.map(doc => h('li', { 'class': 'pm-site-home__document', 'data-document': doc.dir }, [
            h('a', { class: 'pm-site-home__link', href: doc.href, ...doc.lang ? { lang: doc.lang } : {} }, doc.title),
            h('span', { class: 'pm-site-home__dir' }, doc.dir),
            ...(doc.tags ?? []).map(name => h('span', { class: 'pm-site-home__badge' }, name)),
          ]))),
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

/** The host of the home page: no document, no steps; the toolbar, the shared states and the server's client. */
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
  }
}

const Layout = defineComponent({
  name: 'PresmiumSiteHomeLayout',
  setup() {
    return () => h(DefaultTheme.Layout, null, {
      'nav-bar-content-after': () => h(PmToolbar, { class: 'pm-toolbar--bar' }),
      'nav-screen-content-after': () => h(PmToolbar, { class: 'pm-toolbar--screen' }),
    })
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
