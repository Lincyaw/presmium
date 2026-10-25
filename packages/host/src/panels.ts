import { createElement as h, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ComponentType } from 'react'
import { PRESENTER_PANELS } from '@lincyaw/kernel'
import type { PresenterPanel } from '@lincyaw/kernel'
import { TOOLBAR } from './contracts.ts'
import type { ToolbarItem, ToolbarPlacement } from './contracts.ts'
import { useService, useStartReport } from './host.ts'
import { useMessages } from './locale.ts'
import { componentErrors, componentErrorRevision } from './error-boundary.ts'
import { useStore } from './store.ts'
import { HOST_MESSAGES } from './messages.ts'
import { ToolbarPlacementContext } from './design/components.ts'
export function PmToolbar({ filter = (item: ToolbarItem) => !item.slot || item.slot === 'tools' || item.slot === 'settings', placement = 'bar', className }: { className?: string, filter?: (item: ToolbarItem) => boolean, placement?: ToolbarPlacement }) {
  const service = useService(TOOLBAR); const [items, setItems] = useState<ToolbarItem[]>([])
  useEffect(() => { const update = () => setItems(service?.list() ?? []); update(); return service?.subscribe(update) }, [service])
  return h(ToolbarPlacementContext.Provider, { value: placement }, h('span', { className: `pm-toolbar${className ? ` ${className}` : ''}`, 'data-placement': placement }, items.filter(filter).map(item => h(item.component as ComponentType, { key: item.id, 'data-toolbar-item': item.id } as any))))
}
export function PmPresenterPanels({ to = 'body', docked = false }: { to?: string, docked?: boolean }) {
  const t = useMessages(HOST_MESSAGES); const service = useService(PRESENTER_PANELS); const [panels, setPanels] = useState<PresenterPanel[]>([])
  useEffect(() => { const update = () => setPanels(service?.list() ?? []); update(); return service?.subscribe(update) }, [service])
  const [target, setTarget] = useState<Element | null>(null)
  useEffect(() => { setTarget(document.querySelector(to)) }, [to])
  const report = useStartReport(); useStore(componentErrorRevision)
  const problems = (report?.plugins.filter(plugin => plugin.status === 'failed' || plugin.status === 'disabled').length ?? 0) + componentErrors().length
  const content = service ? h('details', { className: `pm-presenter-panels${docked ? ' pm-presenter-panels--docked' : ''}` }, h('summary', {}, t.panels, problems ? h('span', { className: 'pm-presenter-panels__badge', title: t.problems(problems) }, problems) : null), panels.map(panel => h('section', { key: panel.id, 'data-panel': panel.id }, h('h3', {}, panel.title), h(panel.component as ComponentType)))) : null
  return target ? createPortal(content, target) : null
}
