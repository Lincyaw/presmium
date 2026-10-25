import * as Tabs from '@radix-ui/react-tabs'
import { createStore, useStore } from '@lincyaw/host'
import type { MdastNode } from '@lincyaw/kernel'
import type { Element, ElementContent } from 'hast'
import type { Handler } from 'mdast-util-to-hast'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { h } from '../element.ts'
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
  content: () => ReactNode[]
}

export function tabEntries(set: Element, render: (nodes: ElementContent[]) => ReactNode[]): TabEntry[] {
  return set.children.flatMap((panel): TabEntry[] => panel.type !== 'element' ? [] : [{
    title: String(panel.properties.dataTitle ?? ''),
    sync: typeof panel.properties.dataSync === 'string' ? panel.properties.dataSync : undefined,
    selected: panel.properties.dataSelected === 'true',
    content: () => render(panel.children),
  }])
}

const synced = createStore<string | undefined>(undefined)
export function TabSetView({ tabs, className }: { tabs: TabEntry[], className?: string }) {
  const key = useStore(synced)
  const [active, setActive] = useState(() => Math.max(0, tabs.findIndex(tab => tab.selected)))
  useEffect(() => { const index = tabs.findIndex(tab => tab.sync && tab.sync === key); if (index >= 0) setActive(index) }, [key, tabs])
  const choose = (value: string) => { const index = Number(value); setActive(index); const key = tabs[index]?.sync; if (key) synced.set(key) }
  return h(Tabs.Root, { value: String(active), onValueChange: choose, className }, [h(Tabs.List, { className: 'pm-tabs__list' }, tabs.map((tab, k) => h(Tabs.Trigger, { key: k, value: String(k), className: 'pm-tabs__tab' }, tab.title))), ...tabs.map((tab, k) => h(Tabs.Content, { key: k, value: String(k), className: 'pm-tabs__panel', forceMount: true, hidden: k !== active, tabIndex: 0 }, tab.content()))])
}
