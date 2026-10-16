/**
 * Cards, grids, tabs and buttons (docs/ir.md 2.10, P-46): the standard mdast
 * of MyST's extensions (`grid`, `grid-item`, `card`, `tabSet`, `tabItem`, a
 * link with `class: 'button'`) as hast, and the tab set the reader switches.
 * A grid has as many columns as its argument gives for the screen width
 * (phone, small, medium, large; style.css); a card that links somewhere is a
 * link as a whole; choosing a tab with a `:sync:` key chooses the tabs with
 * that key in the other tab sets of the page.
 */
import type { MdastNode } from '@presmium/kernel'
import type { Element, ElementContent, Properties } from 'hast'
import type { Handler, State } from 'mdast-util-to-hast'
import type { PropType, VNodeChild } from 'vue'
import { defineComponent, h, reactive, ref, useId, watch } from 'vue'

/** The screen widths a grid's columns are given for, as the `--pm-grid-<width>` properties of style.css. */
const WIDTHS = ['xs', 'sm', 'md', 'lg'] as const

function element(tagName: string, properties: Properties, children: ElementContent[] = []): Element {
  return { type: 'element', tagName, properties, children }
}

function classes(node: MdastNode): string[] {
  return typeof node.class === 'string' ? node.class.split(/\s+/).filter(Boolean) : []
}

/** A link that `{button}` made. */
export function isButton(node: MdastNode): boolean {
  return classes(node).includes('button')
}

/** The columns of a grid at each width: MyST gives one to four (1 to 12), the last one holds for the wider widths. */
function gridColumns(node: MdastNode): number[] {
  const given = Array.isArray(node.columns) ? node.columns.map(Number).filter(n => Number.isInteger(n) && n >= 1) : []
  return WIDTHS.map((_, i) => given[Math.min(i, given.length - 1)] ?? 1)
}

const style = (values: Record<string, number>) => Object.entries(values).map(([key, value]) => `${key}: ${value}`).join('; ')

/**
 * The grid with its columns at each width; an item with `:columns:` (twelfths
 * of a row, as in sphinx-design) spans as many of the grid's columns.
 */
const grid: Handler = (state, node: MdastNode) => {
  const columns = gridColumns(node)
  const children = state.all(node as never).map((child) => {
    const twelfths = child.type === 'element' ? Number(child.properties.dataPmColumns) : Number.NaN
    if (child.type !== 'element' || !(twelfths >= 1)) return child
    const spans = Object.fromEntries(WIDTHS.map((width, i) => [`--pm-span-${width}`, Math.min(columns[i]!, Math.max(1, Math.round(twelfths * columns[i]! / 12)))]))
    return { ...child, properties: { ...child.properties, style: style(spans) } }
  })
  const widths = Object.fromEntries(WIDTHS.map((width, i) => [`--pm-grid-${width}`, columns[i]!]))
  return element('div', { className: ['pm-grid', ...classes(node)], style: style(widths) }, children)
}

const gridItem: Handler = (state, node: MdastNode) =>
  element('div', { className: ['pm-grid__item', ...classes(node)], dataPmColumns: typeof node.columns === 'number' ? node.columns : undefined }, state.all(node as never))

/**
 * A card: its header, its title (a link where the card links somewhere,
 * which then covers the whole card), its body and its footer.
 */
const card: Handler = (state: State, node: MdastNode) => {
  const items = node.children ?? []
  const part = (type: string) => items.find(child => child.type === type)
  const url = typeof node.url === 'string' && node.url ? node.url : undefined
  const header = part('header')
  const footer = part('footer')
  const title = part('cardTitle')
  const content: ElementContent[] = []
  if (header) content.push(element('header', { className: ['pm-card__header'] }, state.all(header as never)))
  if (title || url) {
    const words: MdastNode[] = title?.children?.length ? title.children : [{ type: 'text', value: url ?? '' }]
    // The link goes through the `link` handler, which resolves links to sections.
    const inner = url ? [state.one({ type: 'link', url, children: words } as never, node as never) as ElementContent] : state.all({ type: 'paragraph', children: words } as never)
    content.push(element('p', { className: ['pm-card__title'] }, inner))
  }
  const body = items.filter(child => child !== header && child !== title && child !== footer)
  content.push(element('div', { className: ['pm-card__body'] }, state.all({ type: 'root', children: body } as never)))
  if (footer) content.push(element('footer', { className: ['pm-card__footer'] }, state.all(footer as never)))
  return element('div', { className: ['pm-card', ...url ? ['pm-card--link'] : [], ...classes(node)] }, content)
}

/**
 * A tab set as hast: a `div` marked `data-pm-tabs` whose children are the
 * panels, each with its title and sync key; `hastToVNodes` renders it as a
 * `TabSetView`.
 */
const tabSet: Handler = (state, node: MdastNode) => {
  const panels = (node.children ?? []).filter(child => child.type === 'tabItem').map(item => element('div', {
    className: ['pm-tabs__panel'],
    dataTitle: typeof item.title === 'string' ? item.title : '',
    dataSync: typeof item.sync === 'string' && item.sync ? item.sync : undefined,
    dataSelected: item.selected === true ? 'true' : undefined,
  }, state.all(item as never)))
  return element('div', { className: ['pm-tabs', ...classes(node)], dataPmTabs: '' }, panels)
}

/** The handlers of the cards, grids and tabs; a `tabItem` outside a tab set is its content. */
export function cardHandlers(): Record<string, Handler> {
  return {
    'grid': grid,
    'grid-item': gridItem,
    'card': card,
    'tabSet': tabSet,
    'tabItem': (state, node) => element('div', {}, state.all(node)),
  }
}

/** One tab of a `TabSetView`: its title, its sync key, whether it is chosen at first, and its content. */
export interface TabEntry {
  title: string
  sync?: string
  selected: boolean
  content: () => VNodeChild[]
}

/** The tabs of a tab set's hast (see `tabSet`), whose panels `render` turns into virtual nodes. */
export function tabEntries(set: Element, render: (nodes: ElementContent[]) => VNodeChild[]): TabEntry[] {
  return set.children.flatMap((panel): TabEntry[] => panel.type !== 'element' ? [] : [{
    title: String(panel.properties.dataTitle ?? ''),
    sync: typeof panel.properties.dataSync === 'string' ? panel.properties.dataSync : undefined,
    selected: panel.properties.dataSelected === 'true',
    content: () => render(panel.children),
  }])
}

/** The sync key chosen last on the page, and a count of the choices, so choosing a key again is seen. */
const synced = reactive({ key: undefined as string | undefined, choices: 0 })

/** The keys that move between the tabs of a tab list (WAI-ARIA tabs pattern). */
const MOVES: Record<string, (k: number, n: number) => number> = {
  ArrowRight: (k, n) => (k + 1) % n,
  ArrowLeft: (k, n) => (k - 1 + n) % n,
  Home: () => 0,
  End: (_, n) => n - 1,
}

/**
 * A tab set: a tab list and one panel per tab, the chosen one shown. The
 * other panels stay in the page, hidden, so the server render and the search
 * of the page hold their text.
 */
export const TabSetView = defineComponent({
  name: 'PmTabSet',
  props: {
    tabs: { type: Array as PropType<TabEntry[]>, required: true },
  },
  setup(props) {
    const id = useId()
    const withKey = (key?: string) => (key ? props.tabs.findIndex(tab => tab.sync === key) : -1)
    // The tab of the key chosen last on the page, else the one marked `:selected:`, else the first.
    const active = ref([withKey(synced.key), props.tabs.findIndex(tab => tab.selected), 0].find(k => k >= 0)!)
    watch(() => synced.choices, () => {
      const k = withKey(synced.key)
      if (k >= 0) active.value = k
    })
    const choose = (k: number) => {
      active.value = k
      const key = props.tabs[k]?.sync
      if (key) {
        synced.key = key
        synced.choices++
      }
    }
    const tabId = (k: number) => `${id}-tab-${k}`
    const panelId = (k: number) => `${id}-panel-${k}`
    const onKeydown = (event: KeyboardEvent) => {
      const move = MOVES[event.key]
      if (!move) return
      event.preventDefault()
      const k = move(active.value, props.tabs.length)
      choose(k)
      document.getElementById(tabId(k))?.focus()
    }
    // The tab set's classes (`pm-tabs` and its `:class:`) fall through to the root.
    return () => h('div', {}, [
      h('div', { class: 'pm-tabs__list', role: 'tablist' }, props.tabs.map((tab, k) => h('button', {
        'type': 'button',
        'role': 'tab',
        'class': 'pm-tabs__tab',
        'id': tabId(k),
        'aria-selected': k === active.value ? 'true' : 'false',
        'aria-controls': panelId(k),
        'tabindex': k === active.value ? 0 : -1,
        'onClick': () => choose(k),
        onKeydown,
      }, tab.title))),
      ...props.tabs.map((tab, k) => h('div', {
        'class': 'pm-tabs__panel',
        'role': 'tabpanel',
        'id': panelId(k),
        'aria-labelledby': tabId(k),
        'tabindex': 0,
        'hidden': k !== active.value,
      }, tab.content())),
    ])
  },
})
