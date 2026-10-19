import { PmIconButton } from '@presmium/workbench'
import type { Workbench } from '@presmium/workbench'
import type { ReactNode } from 'react'
import { useFrameMessages } from './brand.tsx'
import type { LayoutActions, LayoutState } from './layout.ts'
import { NARROW, SIDE_COLLAPSE } from './layout.ts'

interface SidebarProps {
  renderSlot(name: string, props?: Record<string, unknown>, options?: Record<string, unknown>): ReactNode
}

/** Replace navigation chrome through public slots; Harness still owns the session browser and dialogs. */
export function chrome(ctx: DshClientContext, workbench: Workbench, actions: LayoutActions, currentLayout: () => LayoutState, startSession: () => Promise<void>): DshObservable<readonly DshSlotEntry[]> {
  let panels: DshSlotEntry[] = []
  const listeners = new Set<() => void>()
  const panelStore = {
    getSnapshot: () => panels,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
  }
  // An already running host retains its old plugin roster until it is restarted.
  if (!window.__DSH_BOOT__?.entries.some(entry => entry.id === '@deepseek-ai/dsh-client-ui-sidebar')) ctx.effect(() => {
    const offPanels = ctx.slots.subscribe('sidebar.panellist', () => {
      panels = ctx.slots.entries('sidebar.panellist')
      for (const listener of listeners) listener()
    })
    ctx.slots.inject('sidebar.panellist', () => {
      panels = ctx.slots.entries('sidebar.panellist')
      for (const listener of listeners) listener()
    })
    const closeHistory = () => {
      if (currentLayout().layoutInfo.viewportWidth < SIDE_COLLAPSE) actions.revealConversation()
      else actions.toggleSidebar()
    }
    function Sidebar({ renderSlot }: SidebarProps) {
      const t = useFrameMessages(workbench)
      return <section className="pmw-history" aria-label={t.conversationHistory}>
        <header className="pmw-history__header"><h2>{t.conversationHistory}</h2><PmIconButton icon="close" small label={t.closeHistory} onClick={closeHistory} /></header>
        <div className="pmw-history__browser">{renderSlot('sidebar.workspaces', { wide: true, expandSidebar: () => actions.choose('sessions') })}</div>
        <div hidden>{renderSlot('sidebar.settings', { wide: false })}</div>
      </section>
    }
    let offSidebar: (() => void) | undefined
    ctx.slots.inject('sidebar', () => {
      offSidebar = ctx.slots.register({ name: 'sidebar', priority: -1, children: {
        'sidebar.brand.mark': { kind: 'single', scope: 'root' },
        'sidebar.brand.name': { kind: 'single', scope: 'root' },
        'sidebar.toggle.badge': { kind: 'single', scope: 'root' },
        'sidebar.workspaces': { kind: 'single', scope: 'root' },
        'sidebar.settings': { kind: 'single', scope: 'root' },
        'sidebar.footer.action': { kind: 'list', scope: 'root' },
      } }, Sidebar)
    })
    return () => { offSidebar?.(); offPanels() }
  }, 'presmium: one navigation shell')
  ctx.effect(() => {
    function ConversationActions() {
      const t = useFrameMessages(workbench)
      return <div className="pmw-chat-actions pm-ui" role="group" aria-label={t.conversation}>
        <PmIconButton icon="plus" label={t.newConversation} small onClick={() => void startSession()} />
        <PmIconButton icon="history" label={t.conversationHistory} small onClick={() => actions.showHistory()} />
        <PmIconButton icon="close" label={t.hideConversation} small onClick={() => {
          if (currentLayout().layoutInfo.viewportWidth < NARROW) actions.show(workbench.state.document === undefined ? 'documents' : 'preview')
          else actions.setDockOpen(false)
        }} />
      </div>
    }
    let off: (() => void) | undefined
    ctx.slots.inject('conversation.header.leading', () => { off = ctx.slots.register({ name: 'conversation.header.leading', priority: -1 }, ConversationActions) })
    return () => off?.()
  }, 'presmium: conversation actions in its resident header')
  ctx.effect(() => {
    let off: (() => void) | undefined
    ctx.slots.inject('conversation.session.header.corner', () => {
      off = ctx.slots.register({ name: 'conversation.session.header.corner', priority: -1 }, () => null)
    })
    return () => off?.()
  }, 'presmium: remove the duplicate sidebar opener')
  return panelStore
}
