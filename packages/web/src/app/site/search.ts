import { PmDialog, PmIcon, useMessages } from '@lincyaw/host'
import { tokenize } from '@lincyaw/kernel/reading'
import type MiniSearch from 'minisearch'
import type { SearchResult } from 'minisearch'
import { computed, defineComponent, h, nextTick, ref, shallowRef, watch } from 'vue'
import { SEARCH_FIELDS, WEB_MESSAGES } from '../../domain/index.ts'

/** How a query is weighed: titles first. */
const QUERY = { prefix: true, fuzzy: 0.2, boost: { title: 4, text: 2, titles: 1 } }
const LIMIT = 30

const indexes = new Map<string, Promise<MiniSearch>>()

/** The search index at `url`, loaded the first time it is searched. */
function loadIndex(url: string): Promise<MiniSearch> {
  let index = indexes.get(url)
  if (!index) {
    index = Promise.all([import('minisearch'), fetch(url).then((response) => {
      if (!response.ok) throw new Error(`the search index could not be read (${response.status})`)
      return response.text()
    })]).then(([{ default: Search }, json]) => Search.loadJSON(json, { ...SEARCH_FIELDS, tokenize }))
    index.catch(() => indexes.delete(url))
    indexes.set(url, index)
  }
  return index
}

/** Forgets the index at `url`: a dev server rebuilt it. */
export function forgetIndex(url: string): void {
  indexes.delete(url)
}

/** The document's search, as a dialog: results as the reader types, arrows to move, Enter to open one. */
export const SearchDialog = defineComponent({
  name: 'PresmiumSearch',
  props: {
    open: Boolean,
    index: { type: String, required: true },
  },
  emits: ['update:open'],
  setup(props, { emit }) {
    const t = useMessages(WEB_MESSAGES)
    const query = ref('')
    const results = shallowRef<SearchResult[]>([])
    const active = ref(0)
    const failed = ref(false)
    const input = ref<HTMLInputElement>()
    const list = ref<HTMLElement>()
    let asked = 0

    const search = async () => {
      const text = query.value.trim()
      const mine = ++asked
      if (!text) {
        results.value = []
        return
      }
      try {
        const index = await loadIndex(props.index)
        if (mine !== asked) return
        results.value = index.search(text, QUERY).slice(0, LIMIT)
        active.value = 0
        failed.value = false
      } catch (error) {
        console.warn('[presmium] the search is not available', error)
        failed.value = true
      }
    }
    watch(query, () => void search())
    watch(() => props.open, async (open) => {
      if (!open) return
      await nextTick()
      input.value?.focus()
      input.value?.select()
    })

    const move = (step: number) => {
      if (results.value.length === 0) return
      active.value = (active.value + step + results.value.length) % results.value.length
      void nextTick(() => list.value?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }))
    }
    const choose = () => {
      const link = list.value?.querySelector<HTMLAnchorElement>('[aria-selected="true"] a')
      if (!link) return
      emit('update:open', false)
      // Followed as a click on the link, so that the page's router turns to it when it is one of the document's pages.
      link.click()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') move(1)
      else if (event.key === 'ArrowUp') move(-1)
      else if (event.key === 'Enter') choose()
      else return
      event.preventDefault()
    }
    const empty = computed(() => query.value.trim() !== '' && results.value.length === 0)

    return () => h(PmDialog, { 'open': props.open, 'label': t.value.search, 'closeLabel': t.value.close, 'name': 'pm-site-search', 'onUpdate:open': (value: boolean) => emit('update:open', value) }, () => [
      h('label', { class: 'pm-ui-search pm-site-search__field' }, [
        h(PmIcon, { name: 'search' }),
        h('input', {
          'ref': input,
          'class': 'pm-site-search__input',
          'type': 'search',
          'aria-controls': 'pm-site-search-results',
          'aria-label': t.value.search,
          'placeholder': t.value.searchPlaceholder,
          'value': query.value,
          'onInput': (event: Event) => query.value = (event.target as HTMLInputElement).value,
          'onKeydown': onKey,
        }),
      ]),
      h('ul', { id: 'pm-site-search-results', ref: list, class: 'pm-site-search__results', role: 'listbox', 'aria-label': t.value.search }, results.value.map((result, i) => h('li', {
        'key': String(result.id),
        'role': 'option',
        'aria-selected': i === active.value,
        'class': 'pm-site-search__result',
        'onMouseenter': () => active.value = i,
      }, [h('a', { 'class': 'pm-site-search__link', 'href': String(result.id), 'aria-label': [...(result.titles as string[] | undefined) ?? [], String(result.title)].join(' > '), 'onClick': () => emit('update:open', false) }, [
        (result.titles as string[] | undefined)?.length ? h('span', { class: 'pm-site-search__path' }, (result.titles as string[]).join(' › ')) : null,
        h('span', { class: 'pm-site-search__title' }, String(result.title)),
      ])]))),
      empty.value || failed.value ? h('p', { class: 'pm-site-search__empty' }, t.value.noResults(query.value.trim())) : null,
      h('p', { class: 'pm-site-search__keys' }, [
        h('span', [h('kbd', { 'class': 'pm-ui-kbd', 'aria-label': t.value.keyEnter }, '↵'), ` ${t.value.searchSelect}`]),
        h('span', [h('kbd', { 'class': 'pm-ui-kbd', 'aria-label': t.value.keyUp }, '↑'), h('kbd', { 'class': 'pm-ui-kbd', 'aria-label': t.value.keyDown }, '↓'), ` ${t.value.searchNavigate}`]),
        h('span', [h('kbd', { 'class': 'pm-ui-kbd', 'aria-label': t.value.keyEscape }, 'Esc'), ` ${t.value.searchClose}`]),
      ]),
    ])
  },
})
