import { DocumentView, HistoryPanel, HomePanel, PreviewPanel, useWorkbench, useWorkbenchState, WorkbenchProvider } from '@lincyaw/workbench'
import type { Workbench } from '@lincyaw/workbench'
import { useRef } from 'react'
import type { ComponentType } from 'react'
import { Logo } from './brand.tsx'
import { CLIENT_ID } from './contract.ts'
import { CLIENT_MESSAGES } from './messages.ts'
import { RuntimeDiagnosticsNotice, WorkbenchRuntimeBoundary } from './runtime-diagnostics.tsx'

export const FALLBACK_PANEL = 'presmium'

function Centre() {
  const workbench = useWorkbench()
  const document_ = useWorkbenchState(state => state.document)
  const retainedDocument = useRef(false)
  if (document_ !== undefined) retainedDocument.current = true
  return (
    <div className="pmw-fallback pm-ui" data-pmw-fallback="">
      <RuntimeDiagnosticsNotice workbench={workbench} />
      {document_ === undefined && <HomePanel />}
      {retainedDocument.current && <div className="pmw-fallback__doc" hidden={document_ === undefined}>
        <DocumentView active={document_ !== undefined} />
      </div>}
    </div>
  )
}

/** With DeepSeek Harness's own layout: the workbench is a global panel of `main`, the document and its history are rightbar tab types. */
export function registerFallbackLayout(ctx: DshClientContext, workbench: Workbench): void {
  const t = () => CLIENT_MESSAGES[workbench.state.locale]
  const provided = (Component: ComponentType, className?: string) => function PresmiumPanel() {
    return (
      <WorkbenchProvider workbench={workbench}>
        <WorkbenchRuntimeBoundary workbench={workbench}>{className ? <div className={className}><Component /></div> : <Component />}</WorkbenchRuntimeBoundary>
      </WorkbenchProvider>
    )
  }
  ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: FALLBACK_PANEL, order: -10, label: () => t().product }, () => <Logo size={20} />)), 'presmium: the panel list entry')
  ctx.effect(() => ctx.slots.register({ name: 'main', key: FALLBACK_PANEL }, provided(Centre)), 'presmium: the workbench as a global panel')
  ctx.inject(['sidebarRightTabs'], (inner) => {
    const History = () => <HistoryPanel onClose={() => {}} />
    const tabs = [
      { kind: 'presmium-preview', Panel: PreviewPanel as ComponentType, title: () => `Presmium · ${t().preview}` },
      { kind: 'presmium-history', Panel: History, title: () => `Presmium · ${t().history}` },
    ]
    for (const { kind, Panel, title } of tabs) {
      const id = `${CLIENT_ID}/${kind}`
      const Body = provided(Panel, 'pmw-fallback__tab pm-ui')
      inner.effect(() => inner.sidebarRightTabs.register({ id, kind, priority: 'extension', keepMounted: true, title, guide: [{ id: kind, order: 50, title }] }), `presmium: ${kind} tab type`)
      inner.effect(() => inner.slots.inject('sidebar.right.pane.tab', () => inner.slots.register({ name: 'sidebar.right.pane.tab', key: id }, Body)), `presmium: ${kind} tab body`)
    }
  })
}
