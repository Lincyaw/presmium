import { PmIconButton } from '@lincyaw/workbench'
import type { Workbench } from '@lincyaw/workbench'
import type { ReactNode } from 'react'
import { isBootEntryLoaded, UI_SIDEBAR } from './contract.ts'
import type { LayoutActions, LayoutState } from './layout.ts'
import { NARROW, SIDE_COLLAPSE } from './layout.ts'
import { useClientMessages } from './messages.ts'

interface SidebarProps {
  renderSlot(name: string, props?: Record<string, unknown>, options?: Record<string, unknown>): ReactNode
}

/**
 * Replaces Harness's navigation shell through public slots: the history sidebar, the conversation's header actions,
 * and the global panels (`sidebar.panellist`), which it keeps in `globalPanels` for the activity bar. Harness still
 * owns the session browser and its dialogs.
 */
export function registerNavigationShell(ctx: DshClientContext, workbench: Workbench, layout: { actions: LayoutActions, getSnapshot(): LayoutState }, globalPanels: { set(entries: readonly DshSlotEntry[]): void }, startSession: () => Promise<void>): void {
  const { actions } = layout
  // An already running host retains its old plugin roster until it is restarted.
  if (!isBootEntryLoaded(UI_SIDEBAR)) ctx.effect(() => {
    const updatePanels = () => globalPanels.set(ctx.slots.entries('sidebar.panellist'))
    const offPanels = ctx.slots.subscribe('sidebar.panellist', updatePanels)
    ctx.slots.inject('sidebar.panellist', updatePanels)
    const closeHistory = () => {
      if (layout.getSnapshot().layoutInfo.viewportWidth < SIDE_COLLAPSE) actions.revealConversation()
      else actions.toggleSidebar()
    }
    function Sidebar({ renderSlot }: SidebarProps) {
      const t = useClientMessages(workbench)
      return <section className="pmw-history" aria-label={t.conversationHistory}>
        <header className="pmw-history__header"><h2>{t.conversationHistory}</h2><PmIconButton icon="close" small label={t.closeHistory} onClick={closeHistory} /></header>
        <div className="pmw-history__browser">{renderSlot('sidebar.workspaces', { wide: true, expandSidebar: () => actions.selectActivity('sessions') })}</div>
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
      const t = useClientMessages(workbench)
      return <div className="pmw-chat-actions pm-ui" role="group" aria-label={t.conversation}>
        <span className="pmw-chat-actions__title" aria-hidden="true">{t.conversation}</span>
        <PmIconButton icon="plus" label={t.newConversation} small onClick={() => void startSession()} />
        <PmIconButton icon="history" label={t.conversationHistory} small onClick={() => actions.showHistory()} />
        <PmIconButton icon="close" label={t.hideConversation} small onClick={() => {
          if (layout.getSnapshot().layoutInfo.viewportWidth < NARROW) actions.showNarrowPane(workbench.state.document === undefined ? 'documents' : 'preview')
          else actions.setConversationOpen(false)
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
}
