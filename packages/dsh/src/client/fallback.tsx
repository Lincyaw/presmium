import { DocumentView, FilesPanel, HomePanel, PreviewPanel, useWorkbench, WorkbenchProvider } from '@presmium/workbench'
import type { Workbench } from '@presmium/workbench'
import type { ComponentType } from 'react'
import { Logo } from './brand.tsx'
import { CLIENT_ID } from './contract.ts'
import { FRAME_MESSAGES } from './messages.ts'

export const FALLBACK_PANEL = 'presmium'

function Centre() {
  const document_ = useWorkbench(state => state.document)
  return (
    <div className="pmw-fallback pm-ui" data-pmw-fallback="">
      {document_ === undefined
        ? <HomePanel />
        : (
            <div className="pmw-fallback__doc">
              <FilesPanel />
              <DocumentView />
            </div>
          )}
    </div>
  )
}

export function fallback(ctx: DshClientContext, workbench: Workbench): void {
  const t = () => FRAME_MESSAGES[workbench.state.locale]
  const provided = (Component: ComponentType, className?: string, protectChanges = false) => function PresmiumPanel() {
    return (
      <WorkbenchProvider workbench={workbench} protectChanges={protectChanges}>
        {className ? <div className={className}><Component /></div> : <Component />}
      </WorkbenchProvider>
    )
  }
  ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({ name: 'sidebar.panellist', id: FALLBACK_PANEL, order: -10, label: () => t().product }, () => <Logo size={20} />)), 'presmium: the panel list entry')
  ctx.effect(() => ctx.slots.register({ name: 'main', key: FALLBACK_PANEL }, provided(Centre, undefined, true)), 'presmium: the workbench as a global panel')
  ctx.inject(['sidebarRightTabs'], (inner) => {
    const kind = 'presmium-preview'
    const id = `${CLIENT_ID}/${kind}`
    const title = () => `Presmium · ${t().preview}`
    const Body = provided(PreviewPanel, 'pmw-fallback__tab pm-ui')
    inner.effect(() => inner.sidebarRightTabs.register({ id, kind, priority: 'extension', keepMounted: true, title, guide: [{ id: kind, order: 50, title }] }), `presmium: ${kind} tab type`)
    inner.effect(() => inner.slots.inject('sidebar.right.pane.tab', () => inner.slots.register({ name: 'sidebar.right.pane.tab', key: id }, Body)), `presmium: ${kind} tab body`)
  })
}
