import { createSharedStates, currentLocale, installHost, PmEmpty, PmIcon, pluginsOf, PmToolbar, presmiumReport, presmiumService, registerPresmiumPlugin, startHost, useMessages } from '@lincyaw/host'
import type { HostAdapter, Navigation } from '@lincyaw/host'
import { FINAL_STEP } from '@lincyaw/viewer'
import type { Theme } from 'vitepress'
import { inBrowser, useData } from 'vitepress'
import DefaultTheme from 'vitepress/theme-without-fonts'
import { computed, defineComponent, h, onBeforeUnmount, onMounted, readonly, ref } from 'vue'
import { samePage, WEB_MESSAGES } from '../domain/index.ts'
import './style.css'

export interface SiteHomeInput {
  plugins: (() => Promise<unknown>)[]
}

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

const query = ref('')

function useDocuments() {
  const { theme } = useData()
  return computed<HomeDocument[]>(() => theme.value.presmium?.documents ?? [])
}

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
    const { site } = useData()
    const documents = useDocuments()
    const tag = ref<string>()
    const t = computed(() => WEB_MESSAGES[currentLocale()])
    const tags = computed(() => [...new Set(documents.value.flatMap(doc => doc.tags ?? []))].sort())
    const shown = computed(() => {
      const words = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
      return documents.value.filter(doc => (!tag.value || doc.tags?.includes(tag.value))
        && words.every(word => `${doc.title} ${doc.dir} ${doc.description ?? ''} ${(doc.tags ?? []).join(' ')}`.toLowerCase().includes(word)))
    })
    return () => h('div', { class: 'pm-site-home pm-ui' }, [
      h('h1', { class: 'pm-site-home__title' }, site.value.title),
      h('section', { 'class': 'pm-site-home__section', 'aria-labelledby': 'pm-site-home-documents' }, [
        h('div', { class: 'pm-site-home__filters' }, [
          h('h2', { id: 'pm-site-home-documents', class: 'pm-ui-heading' }, t.value.documentsHeading),
          h(SearchBox),
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
        ]),
      ]),
    ])
  },
})

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

const Layout = defineComponent({
  name: 'PresmiumSiteHomeLayout',
  setup() {
    return () => h(DefaultTheme.Layout, null, {
      'nav-bar-content-after': () => h(PmToolbar, { class: 'pm-toolbar--bar' }),
      'nav-screen-content-after': () => h(PmToolbar, { class: 'pm-toolbar--screen' }),
    })
  },
})

export function createSiteHomeTheme(input: SiteHomeInput): Theme {
  return {
    extends: DefaultTheme,
    Layout,
    enhanceApp({ app, router, siteData }) {
      app.component('PresmiumSiteHome', SiteHome)
      app.component('PresmiumSiteRedirect', SiteRedirect)
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
      const navigation: Navigation = { position: computed(() => ({ slide: 1, step: 0 })), go: () => {} }
      void Promise.all(input.plugins.map(load => load().catch((error: unknown) => {
        console.error('[presmium] a plugin module failed to load', error)
        return {}
      }))).then((modules) => {
        modules.flatMap(module => pluginsOf(module)).forEach(registerPresmiumPlugin)
        return startHost({ mode: 'document', config: {}, navigation, transports: shared.transports })
      })
    },
  }
}
