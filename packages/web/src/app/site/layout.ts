import { PmDrawer, PmIcon, PmIconButton, PmPopover, PmPresenterPanels, PmToolbar, useAppearance, useMessages } from '@lincyaw/host'
import { isChapterTitle } from '@lincyaw/kernel'
import { listViews, OverlayViewOutlet, PageViewOutlet, useViewer } from '@lincyaw/viewer'
import type { PropType, VNodeChild } from 'vue'
import { computed, defineComponent, h, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { WEB_MESSAGES } from '../../domain/index.ts'
import type { AppConfig, NavItem, SiteLocale } from '../../domain/index.ts'
import type { PageRouter } from '../router.ts'
import { SearchDialog } from './search.ts'

/**
 * The site around a document's pages, as a reader of the built site or of a dev server sees it: the header with the
 * site's navigation, search, languages, views, the plugins' toolbar and the appearance; the chapters beside the page,
 * the page's sections on the other side, the pager and the footer below it. Below 768 px the chapters and the header's
 * tools move into a drawer.
 */

const messages = () => useMessages(WEB_MESSAGES)

export const ViewMenu = defineComponent({
  name: 'PresmiumViewMenu',
  props: {
    /** In the header (`bar`), or in the drawer of a phone (`screen`). */
    place: { type: String as PropType<'bar' | 'screen'>, default: 'bar' },
  },
  setup(props) {
    const viewer = useViewer()
    const t = messages()
    return () => h('select', {
      'class': ['pm-view-menu', 'pm-ui-select', `pm-view-menu--${props.place}`],
      'aria-label': t.value.viewMenu,
      'value': viewer.view.value,
      'onChange': (event: Event) => viewer.setView((event.target as HTMLSelectElement).value),
    }, listViews().filter(view => !view.hidden || view.id === viewer.view.value).map(view => h('option', { value: view.id }, view.label)))
  },
})

/** The light or dark appearance, remembered in the reader's browser; the page's head reads it before the first paint. */
export const APPEARANCE_KEY = 'presmium-appearance'

const AppearanceToggle = defineComponent({
  name: 'PresmiumAppearance',
  setup() {
    const t = messages()
    const { dark, setDark } = useAppearance()
    const toggle = () => {
      setDark(!dark.value)
      try {
        localStorage.setItem(APPEARANCE_KEY, dark.value ? 'dark' : 'light')
      } catch {}
    }
    return () => h(PmIconButton, { class: 'pm-site-appearance', icon: dark.value ? 'sun' : 'moon', label: dark.value ? t.value.toLight : t.value.toDark, onClick: toggle })
  },
})

const NavLinks = defineComponent({
  name: 'PresmiumSiteNav',
  props: {
    items: { type: Array as PropType<NavItem[]>, required: true },
    vertical: Boolean,
  },
  setup(props) {
    const open = ref<string>()
    const link = (item: NavItem) => {
      const external = item.link !== undefined && /^[a-z][a-z\d+.-]*:/i.test(item.link)
      return h('a', { class: 'pm-site-nav__link', href: item.link, ...external ? { target: '_blank', rel: 'noopener' } : {} }, [item.text, external ? h(PmIcon, { name: 'external' }) : null])
    }
    const group = (item: NavItem): VNodeChild => props.vertical
      ? h('li', { class: 'pm-site-nav__group' }, [h('p', { class: 'pm-site-nav__heading' }, item.text), h('ul', { class: 'pm-site-nav__items' }, item.items!.map(entry))])
      : h('li', { class: 'pm-site-nav__group' }, h(PmPopover, {
          'open': open.value === item.text,
          'label': item.text,
          'placement': 'below-start',
          'name': 'pm-site-nav',
          'onUpdate:open': (value: boolean) => open.value = value ? item.text : undefined,
        }, {
          trigger: () => [h('button', { type: 'button', class: 'pm-site-nav__link', onClick: () => open.value = open.value === item.text ? undefined : item.text }, [item.text, h(PmIcon, { name: 'chevron-down' })])],
          default: () => h('ul', { class: 'pm-site-nav__items' }, item.items!.map(entry)),
        }))
    const entry = (item: NavItem): VNodeChild => (item.items?.length ? group(item) : h('li', { class: 'pm-site-nav__item' }, link(item)))
    return () => h('ul', { class: ['pm-site-nav', props.vertical && 'pm-site-nav--vertical'] }, props.items.map(entry))
  },
})

const LanguageMenu = defineComponent({
  name: 'PresmiumLanguageMenu',
  props: {
    locales: { type: Array as PropType<SiteLocale[]>, required: true },
    lang: { type: String, required: true },
    /** The address of the page shown in a language, given the language's site path. */
    hrefIn: { type: Function as PropType<(locale: SiteLocale) => string>, required: true },
  },
  setup(props) {
    const t = messages()
    const open = ref(false)
    return () => h(PmPopover, { 'open': open.value, 'label': t.value.language, 'name': 'pm-site-languages', 'onUpdate:open': (value: boolean) => open.value = value }, {
      trigger: () => [h(PmIconButton, { icon: 'language', label: t.value.language, onClick: () => open.value = !open.value })],
      default: () => h('ul', { class: 'pm-site-languages' }, props.locales.map(locale => h('li', [
        h('a', { 'class': 'pm-site-languages__link', 'href': props.hrefIn(locale), 'lang': locale.lang, 'aria-current': locale.lang === props.lang ? 'true' : undefined }, locale.label),
      ]))),
    })
  },
})

const Sidebar = defineComponent({
  name: 'PresmiumSiteSidebar',
  props: {
    router: { type: Object as PropType<PageRouter>, required: true },
  },
  setup(props) {
    const viewer = useViewer()
    const t = messages()
    return () => {
      const { router } = props
      return h('nav', { 'class': 'pm-site-sidebar', 'aria-label': t.value.sidebarNav }, h('ol', { class: 'pm-site-sidebar__chapters' }, router.pages.value.map((page) => {
        const current = page.path === router.shown.value?.path
        const sections = page.sections.slice(1).flatMap(id => viewer.section(id) ?? [])
        return h('li', { class: ['pm-site-sidebar__chapter', current && 'pm-current'] }, [
          h('a', { 'class': 'pm-site-sidebar__link', 'href': router.href(page), 'aria-current': current ? 'page' : undefined }, page.title),
          sections.length > 0
            ? h('ol', { class: 'pm-site-sidebar__sections' }, sections.map(section => h('li', [h('a', { class: 'pm-site-sidebar__section', href: router.sectionHref(section.id) }, section.title)])))
            : null,
        ])
      })))
    }
  },
})

const Outline = defineComponent({
  name: 'PresmiumSiteOutline',
  props: {
    router: { type: Object as PropType<PageRouter>, required: true },
    /** In the popover of a phone's local navigation: no title of its own (the popover has it). */
    compact: Boolean,
  },
  setup(props) {
    const viewer = useViewer()
    const t = messages()
    // The page's sections below its chapter's title (an `h1`): those its headings list.
    const sections = computed(() => (props.router.shown.value?.sections ?? []).flatMap(id => viewer.section(id) ?? []).filter(section => !isChapterTitle(viewer.doc.value, section)))
    const title = props.compact ? 'pm-site-outline-title-compact' : 'pm-site-outline-title'
    return () => sections.value.length === 0
      ? null
      : h('nav', { 'class': 'pm-site-outline', 'aria-labelledby': title }, [
          h('p', { id: title, class: ['pm-site-outline__title', props.compact && 'pm-ui-sr-only'] }, t.value.outline),
          h('ol', { class: 'pm-site-outline__items' }, sections.value.map(section => h('li', [
            h('a', {
              'class': 'pm-site-outline__link',
              'href': `#${encodeURIComponent(section.id)}`,
              'aria-current': viewer.position.value.section === section.id ? 'location' : undefined,
            }, section.title),
          ]))),
        ])
  },
})

const Pager = defineComponent({
  name: 'PresmiumSitePager',
  props: {
    config: { type: Object as PropType<AppConfig>, required: true },
    router: { type: Object as PropType<PageRouter>, required: true },
  },
  setup(props) {
    const t = messages()
    const neighbour = (step: -1 | 1) => {
      const { pages, shown } = props.router
      const i = pages.value.findIndex(page => page.path === shown.value?.path)
      const other = pages.value[i + step]
      if (other) return { text: other.title, link: props.router.href(other) }
      const across = props.config.site.neighbours
      return step < 0 ? across?.prev : across?.next
    }
    return () => {
      const [prev, next] = [neighbour(-1), neighbour(1)]
      if (!prev && !next) return null
      const side = (other: { text: string, link: string } | undefined, label: string, rel: string) => other
        ? h('a', { class: `pm-site-pager__link pm-site-pager__link--${rel}`, href: other.link, rel }, [h('span', { class: 'pm-site-pager__label' }, label), h('span', { class: 'pm-site-pager__title' }, other.text)])
        : h('span')
      return h('nav', { 'class': 'pm-site-pager', 'aria-label': t.value.pager }, [side(prev, t.value.prevChapter, 'prev'), side(next, t.value.nextChapter, 'next')])
    }
  },
})

export const SiteFooter = defineComponent({
  name: 'PresmiumSiteFooter',
  props: {
    config: { type: Object as PropType<AppConfig>, required: true },
  },
  setup(props) {
    // The workspace's own words: HTML, as the site's configuration writes it.
    return () => {
      const { message, copyright } = props.config.site.shell.footer ?? {}
      if (!message && !copyright) return null
      return h('footer', { class: 'pm-site-footer' }, [
        message ? h('p', { class: 'pm-site-footer__message', innerHTML: message }) : null,
        copyright ? h('p', { class: 'pm-site-footer__copyright', innerHTML: copyright }) : null,
      ])
    }
  },
})

/** The site's header: the title, the navigation and the tools; `document` adds those of a document's page. */
export const SiteHeader = defineComponent({
  name: 'PresmiumSiteHeader',
  props: {
    config: { type: Object as PropType<AppConfig>, required: true },
    titleHref: { type: String, required: true },
    hrefIn: { type: Function as PropType<(locale: SiteLocale) => string>, required: true },
    document: Boolean,
  },
  emits: ['menu', 'search'],
  setup(props, { emit }) {
    const t = messages()
    return () => {
      const { config } = props
      const nav = config.site.nav ?? config.site.shell.nav ?? []
      return h('header', { class: 'pm-site-header' }, [
        h('div', { class: 'pm-site-header__start' }, [
          h(PmIconButton, { class: 'pm-site-header__menu', icon: 'menu', label: t.value.mobileNav, onClick: () => emit('menu') }),
          h('a', { class: 'pm-site-header__title', href: props.titleHref }, config.site.title),
        ]),
        nav.length > 0 ? h('nav', { 'class': 'pm-site-header__nav', 'aria-label': t.value.extraNav }, h(NavLinks, { items: nav })) : null,
        h('div', { class: 'pm-site-header__tools' }, [
          props.document && config.search
            ? h('button', { 'type': 'button', 'class': 'pm-site-search-button pm-ui-search', 'aria-label': t.value.search, 'onClick': () => emit('search') }, [
                h(PmIcon, { name: 'search' }),
                h('span', { class: 'pm-site-search-button__text' }, t.value.search),
                h('kbd', { class: 'pm-ui-kbd' }, t.value.searchShortcut),
              ])
            : null,
          config.site.home ? h('a', { class: 'pm-site-link', href: config.site.home }, [h(PmIcon, { name: 'arrow-left' }), t.value.documents]) : null,
          config.site.locales.length > 1 ? h(LanguageMenu, { locales: config.site.locales, lang: config.lang, hrefIn: props.hrefIn }) : null,
          props.document ? h(ViewMenu, { place: 'bar' }) : null,
          h(PmToolbar, { class: 'pm-toolbar--bar' }),
          h(AppearanceToggle),
        ]),
      ])
    }
  },
})

/** A document's page on its site. */
export const DocumentSite = defineComponent({
  name: 'PresmiumDocumentSite',
  props: {
    config: { type: Object as PropType<AppConfig>, required: true },
    router: { type: Object as PropType<PageRouter>, required: true },
  },
  setup(props) {
    const viewer = useViewer()
    const t = messages()
    // The drawer of a phone: the site's navigation and tools, or the document's chapters.
    const drawer = ref<'site' | 'chapters'>()
    const outline = ref(false)
    const searching = ref(false)
    const { router } = props
    watch(router.page, () => {
      drawer.value = undefined
      outline.value = false
    })
    const hrefIn = (locale: SiteLocale) => {
      const shown = router.shown.value
      const own = locale.base.replace(/\/$/, '')
      return shown && shown.path !== 'index' ? `${own}/${shown.path}.html` : `${own}/`
    }
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && props.config.search) {
        event.preventDefault()
        searching.value = true
      }
    }
    onMounted(() => window.addEventListener('keydown', onKey))
    onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
    return () => {
      const { config } = props
      const shown = router.shown.value
      return h('div', { class: 'pm-site' }, [
        h('a', { class: 'pm-site__skip', href: '#pm-site-main' }, t.value.skipToContent),
        h(SiteHeader, { config, titleHref: config.site.home ?? router.href(router.pages.value[0] ?? { path: 'index', title: '', sections: [] }), hrefIn, document: true, onMenu: () => drawer.value = 'site', onSearch: () => searching.value = true }),
        h('div', { class: 'pm-site-localnav' }, [
          h('button', { type: 'button', class: 'pm-site-localnav__button', onClick: () => drawer.value = 'chapters' }, [h(PmIcon, { name: 'navigation' }), t.value.menu]),
          (shown?.sections.length ?? 0) > 1
            ? h(PmPopover, { 'open': outline.value, 'label': t.value.outline, 'placement': 'below-end', 'name': 'pm-site-outline-menu', 'onUpdate:open': (value: boolean) => outline.value = value }, {
                trigger: () => [h('button', { type: 'button', class: 'pm-site-localnav__button', onClick: () => outline.value = !outline.value }, [t.value.outline, h(PmIcon, { name: 'chevron-down' })])],
                default: () => h(Outline, { router, compact: true }),
              })
            : null,
        ]),
        h('div', { class: 'pm-site__body' }, [
          h('aside', { class: 'pm-site__sidebar' }, h(Sidebar, { router })),
          h('main', { id: 'pm-site-main', class: 'pm-site__main', tabindex: -1 }, [
            h('article', { class: 'pm-site__article' }, [h(PageViewOutlet, { key: shown?.path, sections: shown?.sections ?? [] })]),
            h(Pager, { config, router }),
            h(SiteFooter, { config }),
          ]),
          h('aside', { class: 'pm-site__aside' }, h(Outline, { router })),
        ]),
        h('div', { class: 'pm-document pm-overlay-views' }, [h(OverlayViewOutlet)]),
        viewer.view.value === 'presenter' ? h(PmPresenterPanels, { to: '.pm-presenter__side', docked: true }) : null,
        config.search ? h(SearchDialog, { 'open': searching.value, 'index': config.search, 'onUpdate:open': (value: boolean) => searching.value = value }) : null,
        h(PmDrawer, { 'open': drawer.value !== undefined, 'label': drawer.value === 'site' ? t.value.mobileNav : t.value.menu, 'closeLabel': t.value.close, 'name': 'pm-site-menu', 'onUpdate:open': (value: boolean) => drawer.value = value ? drawer.value : undefined }, () => drawer.value === 'site'
          ? [
              (config.site.nav ?? config.site.shell.nav)?.length ? h(NavLinks, { items: config.site.nav ?? config.site.shell.nav!, vertical: true }) : null,
              config.site.home ? h('a', { class: 'pm-site-link', href: config.site.home }, [h(PmIcon, { name: 'arrow-left' }), t.value.documents]) : null,
              h('div', { class: 'pm-site-menu__tools' }, [h(ViewMenu, { place: 'screen' }), h(PmToolbar, { class: 'pm-toolbar--screen' })]),
            ]
          : [h(Sidebar, { router })]),
      ])
    }
  },
})
