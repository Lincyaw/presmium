import { Children, createElement as h, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { PmTabs, PmTabPanel } from './components.ts'

export interface ContentLayoutProps { title?: string, children?: ReactNode }
export interface ColumnsLayoutProps extends ContentLayoutProps { columnWidths?: number[] }
const heading = (title?: string) => title ? h('h3', { className: 'pm-layout__title' }, title) : null

/** Authored column proportions are content geometry; narrow surfaces stack the same children. */
export function PmColumns({ title, columnWidths, children }: ColumnsLayoutProps) {
  const items = Children.toArray(children)
  const columns = items.map((_, index) => `minmax(0, ${Number.isFinite(columnWidths?.[index]) && columnWidths![index]! > 0 ? columnWidths![index] : 1}fr)`).join(' ')
  const style: CSSProperties & { '--pm-layout-columns': string } = { '--pm-layout-columns': columns || 'minmax(0, 1fr)' }
  return h('div', { className: 'pm-layout-columns', style }, heading(title), items.map((item, index) => h('div', { className: 'pm-layout__item', key: index }, item)))
}
export function PmStack({ title, children }: ContentLayoutProps) {
  return h('div', { className: 'pm-layout-stack' }, heading(title), children)
}
export interface TabLayoutEntry { id: string, title: string, content: ReactNode, visible?: boolean }
export function PmTabGroup({ title, label, tabs, staticView = false }: { title?: string, label: string, tabs: TabLayoutEntry[], staticView?: boolean }) {
  const [chosen, setChosen] = useState<string>()
  if (staticView) return h('div', { className: 'pm-layout-stack', 'data-layout-static': 'tabs' }, heading(title), tabs.map(tab => h('section', { key: tab.id, className: 'pm-layout-stack' }, h('h4', { className: 'pm-layout__title' }, tab.title), tab.content)))
  const visible = tabs.filter(tab => tab.visible !== false)
  const active = visible.find(tab => tab.id === chosen)?.id ?? visible[0]?.id ?? ''
  return h('div', { className: 'pm-layout-stack' }, heading(title), h(PmTabs, {
    label: title || label, value: active, tabs: visible.map(tab => ({ value: tab.id, label: tab.title })), onValueChange: setChosen,
  }, tabs.map(tab => h(PmTabPanel, { key: tab.id, value: tab.id, forceMount: true, hidden: tab.id !== active || tab.visible === false }, tab.content))))
}
