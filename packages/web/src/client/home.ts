/**
 * The home page of a workspace site (P-122): the documents, as cards, with a
 * search box and their tags, each linking to its pages. In `presmium serve`
 * (and `presmium dev`) the page has the server and is a workbench (N-10,
 * docs/design/home.dc.html): the activity bar (after a link that skips to
 * the content), the workspace's files (its name as the page's heading, and
 * the tree of the `files` slot; where the side bar gives way, in a drawer of
 * the activity bar), the launcher with its search (Ctrl K) over the
 * documents, their sections and the commands, and the status bar, around the
 * cards. It starts the host (the toolbar, the server's client, the
 * approvals) and the site's plugins, e.g. the workspace's browser plugin,
 * whose entries fill the places of the workbench (`ToolbarItem.slot`); while
 * its editor is open (`EDIT_MODE`), the launcher's place shows it (`tabs`,
 * `source`). The list follows the server (re-read when a plugin says the
 * documents changed, the window event `presmium:documents`). A static site
 * keeps the default theme's page, with the same cards.
 */
import { createServerClient, createSharedStates, currentLocale, EDIT_MODE, installHost, PmButton, PmCard, PmDrawer, PmEmpty, PmIcon, PmIconButton, pluginsOf, PmToolbar, presmiumReport, presmiumService, provideServer, registerPresmiumPlugin, startHost, TOOLBAR, useMessages, useService, useTheme } from '@presmium/host'
import type { HostAdapter, Navigation, ToolbarItem, ToolbarSlot } from '@presmium/host'
import { FINAL_STEP } from '@presmium/viewer'
import type { Theme } from 'vitepress'
import { Content, inBrowser, useData } from 'vitepress'
import DefaultTheme from 'vitepress/theme-without-fonts'
import type { InjectionKey } from 'vue'
import { computed, defineComponent, h, inject, nextTick, onBeforeUnmount, onMounted, provide, readonly, ref, shallowRef, watchEffect } from 'vue'
import { samePage, WEB_MESSAGES } from '../domain/index.ts'
import './style.css'

export interface SiteHomeInput {
  /** Loaders of the site's plugins' `src/client/plugin.ts`. */
  plugins: (() => Promise<unknown>)[]
}

/**
 * A document as the home page lists it (see ../node/sites.ts). A card shows
 * the description, the number of pages and the result of the checks when
 * the list has them; the launcher's search finds its sections.
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
  sections?: { id: string, title: string, href: string }[]
}

/** The event a plugin sends after it changed the documents, so the list is read again. */
export const DOCUMENTS_EVENT = 'presmium:documents'

/** The configuration the home page's plugins get: they are on the home page of a workspace site. */
const HOME_CONFIG = { 'presmium.workspace': { home: true } }

/** The documents read from the server, once it has answered; before, those of the site's data. */
const served = shallowRef<HomeDocument[]>()
/** The search box of a static site's home page, which the cards are filtered by (the workbench's launcher lists what it finds instead). */
const query = ref('')
/** The cards are in the workbench, whose bar has the search box. */
const IN_WORKBENCH: InjectionKey<boolean> = Symbol('presmium.workbench')

/** The server's live list of the documents (`presmium serve`), once a page found it. */
let endpoint: string | undefined
/** Reads the list again; with `compile`, the documents not compiled yet compile (their sections), and it is read until they are. */
async function refresh(compile = false): Promise<void> {
  if (!endpoint) return
  for (let tries = 0; tries < 60; tries++) {
    try {
      const response = await fetch(`${endpoint}${compile ? '?compile=1' : ''}`, { cache: 'no-store' })
      if (!response.ok) return
      const answer = (await response.json()) as { documents: HomeDocument[], compiling?: boolean }
      served.value = answer.documents
      if (!compile || !answer.compiling) return
    } catch (error) {
      console.warn('[presmium] could not read the documents of the site', error)
      return
    }
    await new Promise(done => setTimeout(done, 1000))
  }
}

/** The documents of the site, following the server in `presmium serve`. Must be called inside a component setup. */
function useDocuments() {
  const { theme } = useData()
  const options = computed(() => theme.value.presmium ?? {})
  onMounted(() => {
    if (endpoint || !options.value.endpoint) return
    endpoint = options.value.endpoint as string
    served.value = options.value.documents ?? []
    void refresh()
    window.addEventListener(DOCUMENTS_EVENT, () => void refresh())
  })
  return computed<HomeDocument[]>(() => served.value ?? options.value.documents ?? [])
}

/** The slots the toolbar's items fill now. Must be called inside a component setup. */
function useFilledSlots() {
  const toolbar = useService(TOOLBAR)
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
  return slots
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

/** One result of the launcher's search. */
interface Found {
  id: string
  group: 'documents' | 'sections' | 'commands'
  label: string
  detail?: string
  run(): void
}

/** Whether a text holds every word of the query. */
const matches = (text: string, words: string[]) => words.every(word => text.toLowerCase().includes(word))

/**
 * The commands of the home page: each item of the toolbar drawn on it that
 * opens something (its first control, pressed), under its title; and the
 * appearance switch.
 */
function commands(items: ToolbarItem[], toggleTheme: { label: string, run(): void }): Found[] {
  const found: Found[] = []
  for (const item of items) {
    if (item.slot && !['tools', 'settings', 'create'].includes(item.slot)) continue
    const control = document.querySelector<HTMLElement>(`[data-toolbar-item="${CSS.escape(item.id)}"]`)
    const target = control?.matches('button, a[href]') ? control : control?.querySelector<HTMLElement>('button, a[href]')
    if (target) found.push({ id: `command:${item.id}`, group: 'commands', label: item.title, run: () => target.click() })
  }
  found.push({ id: 'command:theme', group: 'commands', label: toggleTheme.label, run: toggleTheme.run })
  return found
}

/**
 * The launcher's search (Ctrl K, ⌘ K): the documents, their sections and the
 * commands it finds, as a list under the box (arrow keys, Enter); the
 * documents' cards stay as they are, so a search for a section does not
 * empty them. Opened, it has the documents not compiled yet compiled, so
 * their sections are found.
 */
const LauncherSearch = defineComponent({
  name: 'PresmiumLauncherSearch',
  setup() {
    const t = useMessages(WEB_MESSAGES)
    const documents = useDocuments()
    // The launcher's own words: what it finds is listed under the box, and the cards stay as they are.
    const query = ref('')
    const toolbar = useService(TOOLBAR)
    const theme = useTheme()
    const input = ref<HTMLInputElement>()
    const open = ref(false)
    const active = ref(0)
    let outlined = false
    const results = computed((): Found[] => {
      const words = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
      if (words.length === 0) return []
      const docs = documents.value.filter(doc => matches(`${doc.title} ${doc.dir} ${doc.description ?? ''} ${(doc.tags ?? []).join(' ')}`, words))
        .slice(0, 8).map((doc): Found => ({ id: `document:${doc.dir}`, group: 'documents', label: doc.title, detail: `${doc.dir}/`, run: () => location.assign(doc.href) }))
      const sections = documents.value.flatMap(doc => (doc.sections ?? []).filter(section => matches(section.title, words))
        .map((section): Found => ({ id: `section:${doc.dir}:${section.id}`, group: 'sections', label: section.title, detail: doc.title, run: () => location.assign(section.href) }))).slice(0, 12)
      const found = commands(toolbar.value?.list() ?? [], { label: t.value.toggleTheme, run: theme.toggle }).filter(command => matches(command.label, words)).slice(0, 8)
      return [...docs, ...sections, ...found]
    })
    const choose = (found: Found | undefined) => {
      if (!found) return
      open.value = false
      found.run()
    }
    const onFocus = () => {
      open.value = true
      if (outlined) return
      outlined = true
      void refresh(true)
    }
    const onKeydown = (event: KeyboardEvent) => {
      const count = results.value.length
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        open.value = true
        if (count) active.value = (active.value + (event.key === 'ArrowDown' ? 1 : -1) + count) % count
      } else if (event.key === 'Enter') {
        event.preventDefault()
        choose(results.value[active.value])
      } else if (event.key === 'Escape' && open.value) {
        event.stopPropagation()
        open.value = false
      }
    }
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        input.value?.focus()
      }
    }
    onMounted(() => window.addEventListener('keydown', onKey))
    onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
    const optionId = (index: number) => `pm-launcher-option-${index}`
    const groups: Found['group'][] = ['documents', 'sections', 'commands']
    const groupLabel = (group: Found['group']) => (group === 'documents' ? t.value.groupDocuments : group === 'sections' ? t.value.groupSections : t.value.groupCommands)
    return () => {
      const list = results.value
      if (active.value >= list.length) active.value = 0
      const expanded = open.value && query.value.trim() !== ''
      return h('div', { class: 'pm-launcher', onFocusout: (event: FocusEvent) => {
        if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node | null)) open.value = false
      } }, [
        h('label', { class: 'pm-ui-search pm-site-home__search-box' }, [
          h(PmIcon, { name: 'search', size: 15, strokeWidth: 1.8 }),
          h('input', {
            'ref': input,
            'class': 'pm-site-home__search',
            'type': 'text',
            'role': 'combobox',
            'value': query.value,
            'placeholder': t.value.searchAll,
            'aria-label': t.value.searchAll,
            'aria-autocomplete': 'list',
            'aria-expanded': expanded ? 'true' : 'false',
            'aria-controls': 'pm-launcher-results',
            'aria-activedescendant': expanded && list.length ? optionId(active.value) : undefined,
            'onInput': (event: Event) => {
              query.value = (event.target as HTMLInputElement).value
              active.value = 0
              open.value = true
            },
            'onFocus': onFocus,
            'onKeydown': onKeydown,
          }),
          h('kbd', { class: 'pm-ui-kbd' }, 'Ctrl K'),
        ]),
        expanded
          ? h('div', { id: 'pm-launcher-results', class: 'pm-launcher__results', role: 'listbox', 'aria-label': t.value.results }, list.length === 0
              ? [h('p', { class: 'pm-launcher__none' }, t.value.noResults)]
              : groups.flatMap((group) => {
                  const members = list.map((found, index) => ({ found, index })).filter(({ found }) => found.group === group)
                  return members.length === 0
                    ? []
                    : [h('div', { 'role': 'group', 'aria-label': groupLabel(group), 'class': 'pm-launcher__group' }, [
                        h('p', { 'class': 'pm-launcher__heading', 'aria-hidden': 'true' }, groupLabel(group)),
                        ...members.map(({ found, index }) => h('div', {
                          'id': optionId(index),
                          'role': 'option',
                          'class': 'pm-launcher__option',
                          'data-result': found.id,
                          'aria-selected': index === active.value ? 'true' : 'false',
                          'onMousedown': (event: MouseEvent) => event.preventDefault(),
                          'onClick': () => choose(found),
                          'onMouseenter': () => active.value = index,
                        }, [h('span', found.label), found.detail ? h('span', { class: 'pm-launcher__detail' }, found.detail) : null])),
                      ])]
                })) : null,
      ])
    }
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

/** The workspace's files: the tree a plugin gives (`files`), else the documents' directories and the configuration. */
const FileTree = defineComponent({
  name: 'PresmiumWorkspaceTree',
  setup() {
    const documents = useDocuments()
    const filled = useFilledSlots()
    return () => (filled.value.has('files')
      ? h(PmToolbar, { class: 'pm-workbench__tree-items', place: 'home', filter: bySlot('files') })
      : h('ul', { class: 'pm-workbench__tree', role: 'list' }, [
          ...documents.value.map(doc => h('li', { key: doc.dir }, [
            h('a', { class: 'pm-workbench__file', href: doc.href, title: doc.title }, [h(PmIcon, { name: 'folder', size: 15 }), `${doc.dir}/`]),
          ])),
          h('li', [h('span', { class: 'pm-workbench__file pm-workbench__file--plain' }, [h(PmIcon, { name: 'document', size: 15 }), 'presmium.workspace.yaml'])]),
        ]))
  },
})

/** The workspace's side bar: its name, the page's heading where the side bar shows, and its files. */
const Files = defineComponent({
  name: 'PresmiumWorkspaceFiles',
  setup() {
    const { site } = useData()
    const t = useMessages(WEB_MESSAGES)
    return () => h('aside', { 'class': 'pm-workbench__files', 'aria-label': t.value.files }, [
      h('h1', { class: 'pm-workbench__name' }, site.value.title),
      h(FileTree),
    ])
  },
})

/** Where the side bar gives way (narrower than 1024 px: tablets, phones), the activity bar's entry that opens the files in a drawer. */
const FilesDrawer = defineComponent({
  name: 'PresmiumWorkspaceFilesDrawer',
  setup() {
    const t = useMessages(WEB_MESSAGES)
    const open = ref(false)
    // A file chosen opens elsewhere (its document's page, or the editor in the launcher's place): the drawer closes.
    const onClick = (event: MouseEvent) => {
      if ((event.target as Element | null)?.closest('[data-path], a[href]')) open.value = false
    }
    return () => h(PmDrawer, { 'open': open.value, 'label': t.value.files, 'closeLabel': t.value.close, 'name': 'pm-workbench-files', 'onUpdate:open': (next: boolean) => open.value = next }, {
      trigger: () => h(PmIconButton, { 'icon': 'folder', 'label': t.value.files, 'class': 'pm-workbench-files__toggle', 'aria-expanded': open.value ? 'true' : 'false', 'onClick': () => open.value = !open.value }),
      default: () => h('div', { class: 'pm-workbench-files__body', onClick }, [h(FileTree)]),
    })
  },
})

/** Whether the side bar gives way (`.pm-workbench__files` in style.css): narrower than 1024 px. */
function useNarrow() {
  const narrow = ref(false)
  let media: MediaQueryList | undefined
  const update = () => narrow.value = Boolean(media?.matches)
  onMounted(() => {
    media = window.matchMedia('(max-width: 1023px)')
    update()
    media.addEventListener('change', update)
  })
  onBeforeUnmount(() => media?.removeEventListener('change', update))
  return narrow
}

/** The id of the workbench's content, where the link that skips the bars goes. */
const CONTENT_ID = 'pm-workbench-content'

/** The workbench of a served home page (docs/design/home.dc.html). */
const Workbench = defineComponent({
  name: 'PresmiumWorkbench',
  setup() {
    provide(IN_WORKBENCH, true)
    const t = useMessages(WEB_MESSAGES)
    const theme = useTheme()
    const { site } = useData()
    const edit = useService(EDIT_MODE)
    const editing = computed(() => Boolean(edit.value?.active.value))
    const narrow = useNarrow()
    const focusSearch = () => document.querySelector<HTMLInputElement>('.pm-workbench .pm-site-home__search')?.focus()
    const toDocuments = async () => {
      edit.value?.leave()
      await nextTick()
      document.querySelector('.pm-workbench__main')?.scrollTo({ top: 0 })
      document.querySelector<HTMLElement>('.pm-site-home__link')?.focus()
    }
    const skip = (event: Event) => {
      event.preventDefault()
      document.getElementById(CONTENT_ID)?.focus()
    }
    return () => h('div', { class: 'pm-workbench pm-ui' }, [
      h('a', { class: 'pm-skip-link', href: `#${CONTENT_ID}`, onClick: skip }, t.value.skipToContent),
      h('nav', { 'class': 'pm-workbench__activity', 'aria-label': t.value.activity }, [
        h('div', { 'class': 'pm-workbench__logo', 'aria-hidden': 'true' }, 'P'),
        h(PmIconButton, { 'icon': 'document', 'label': t.value.documentsHeading, 'aria-pressed': editing.value ? 'false' : 'true', 'onClick': () => void toDocuments() }),
        h(PmIconButton, { icon: 'search', label: t.value.search, onClick: focusSearch }),
        narrow.value ? h(FilesDrawer) : null,
        h(PmToolbar, { place: 'activity', filter: (item: ToolbarItem) => inTools(item) && Boolean(item.icon) }),
        h('div', { class: 'pm-workbench__activity-end' }, [h(PmToolbar, { place: 'activity', filter: bySlot('settings') })]),
      ]),
      narrow.value ? null : h(Files),
      h('div', { class: 'pm-workbench__main' }, [
        h('header', { class: 'pm-workbench__bar' }, [
          h('span', { class: 'pm-workbench__title' }, t.value.launcher),
          // Where the side bar gives way, the workspace's name heads the page here.
          h('h1', { class: 'pm-workbench__heading' }, site.value.title),
          h(LauncherSearch),
          h('div', { class: 'pm-workbench__actions' }, [h(PmToolbar, { filter: (item: ToolbarItem) => inTools(item) && !item.icon })]),
        ]),
        h('main', { id: CONTENT_ID, class: 'pm-workbench__content', tabindex: -1 }, editing.value
          ? [h('section', { 'class': 'pm-workbench__source', 'aria-label': t.value.sourcePane }, [
              h('div', { class: 'pm-workbench__tabs' }, [h(PmToolbar, { filter: bySlot('tabs') })]),
              h('div', { class: 'pm-workbench__editor' }, [h(PmToolbar, { place: 'pane', filter: bySlot('source') })]),
            ])]
          : [h(Content)]),
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
