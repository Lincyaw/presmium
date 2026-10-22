import { TabsContent, TabsList, TabsRoot, TabsTrigger } from 'reka-ui'
import type { MdastNode } from '@lincyaw/kernel'
import type { Element, ElementContent } from 'hast'
import type { Handler } from 'mdast-util-to-hast'
import type { PropType, VNodeChild } from 'vue'
import { defineComponent, h, reactive, ref, watch } from 'vue'
import { classes, element } from './hast.ts'

const tabSet: Handler = (state, node: MdastNode) => {
  const panels = (node.children ?? []).filter(child => child.type === 'tabItem').map(item => element('div', {
    className: ['pm-tabs__panel'],
    dataTitle: typeof item.title === 'string' ? item.title : '',
    dataSync: typeof item.sync === 'string' && item.sync ? item.sync : undefined,
    dataSelected: item.selected === true ? 'true' : undefined,
  }, state.all(item as never)))
  return element('div', { className: ['pm-tabs', ...classes(node)], dataPmTabs: '' }, panels)
}

/** The handlers of MyST's tab sets: a tab set becomes an element that `hastToVNodes` renders as `TabSetView`. */
export function tabHandlers(): Record<string, Handler> {
  return {
    tabSet,
    tabItem: (state, node) => element('div', {}, state.all(node)),
  }
}

export interface TabEntry {
  title: string
  sync?: string
  selected: boolean
  content: () => VNodeChild[]
}

export function tabEntries(set: Element, render: (nodes: ElementContent[]) => VNodeChild[]): TabEntry[] {
  return set.children.flatMap((panel): TabEntry[] => panel.type !== 'element' ? [] : [{
    title: String(panel.properties.dataTitle ?? ''),
    sync: typeof panel.properties.dataSync === 'string' ? panel.properties.dataSync : undefined,
    selected: panel.properties.dataSelected === 'true',
    content: () => render(panel.children),
  }])
}

const synced = reactive({ key: undefined as string | undefined, choices: 0 })

export const TabSetView = defineComponent({
  name: 'PmTabSet',
  props: {
    tabs: { type: Array as PropType<TabEntry[]>, required: true },
  },
  setup(props) {
    const withKey = (key?: string) => (key ? props.tabs.findIndex(tab => tab.sync === key) : -1)
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
    return () => h(TabsRoot, { modelValue: String(active.value), 'onUpdate:modelValue': value => choose(Number(value)) }, () => [
      h(TabsList, { class: 'pm-tabs__list' }, () => props.tabs.map((tab, k) =>
        h(TabsTrigger, { key: k, value: String(k), class: 'pm-tabs__tab' }, () => tab.title))),
      ...props.tabs.map((tab, k) => h(TabsContent, {
        key: k, value: String(k), class: 'pm-tabs__panel', forceMount: true, hidden: k !== active.value, tabindex: 0,
      }, tab.content)),
    ])
  },
})
