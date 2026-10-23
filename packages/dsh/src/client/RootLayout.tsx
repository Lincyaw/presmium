import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels'
import { DocumentView, HomePanel, PmDialog, PmIcon, PmMenu, useWorkbenchState, WorkbenchProvider } from '@lincyaw/workbench'
import type { Workbench } from '@lincyaw/workbench'
import type { IconName } from '@lincyaw/design'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode, RefObject } from 'react'
import { Logo } from './brand.tsx'
import { mainViewAgentSession } from './document-context.ts'
import { ACTIVITY, clamp, CONVERSATION_MAX, CONVERSATION_MIN, NARROW, RIGHTBAR_MAX_RATIO, RIGHTBAR_MIN, rightbarRoom, SIDE_COLLAPSE, SIDE_MAX, SIDE_MIN } from './layout.ts'
import type { LayoutActions, LayoutState, NarrowPane } from './layout.ts'
import { useClientMessages } from './messages.ts'
import { isSamePath } from './paths.ts'

interface RootSlotProps {
  useStore: DshSelectorHook<LayoutState>
  useSessions: DshSelectorHook<{ byId: Record<string, { id: string, title?: string, cwd?: string, retainedBy: { mainView?: number } }> }>
  usePanelInfo: DshSelectorHook<LayoutState['panelInfo']>
  actions: LayoutActions
  renderSlot(name: string, props?: Record<string, unknown>, options?: Record<string, unknown>): ReactNode
}

export interface RootLayoutOptions {
  workbench: Workbench
  openSettings(): void
  /** Opens a DeepSeek Harness workspace in the main view, keeping the current layout. */
  openDshWorkspace(id: string): Promise<void>
  dshWorkspaces: DshObservable<{ items: readonly { workspaceId: string, path: string }[] }>
  globalPanels: DshObservable<readonly DshSlotEntry[]>
}

type Geometry = ReturnType<typeof solveGeometry>
type Box = { left: number, top: number, width: number, height: number }

/** The component of the `root` slot: the root layout with the workbench of `options`. */
export function rootLayoutFor(options: RootLayoutOptions) {
  return function PresmiumRootLayout(props: RootSlotProps) {
    return (
      <WorkbenchProvider workbench={options.workbench}>
        <RootLayout {...props} {...options} />
      </WorkbenchProvider>
    )
  }
}

/** The columns' widths for the viewport: 0 for a column that is not shown. */
function solveGeometry(info: LayoutState['layoutInfo']) {
  const viewport = info.viewportWidth
  const narrow = viewport < NARROW
  const collapsed = viewport < SIDE_COLLAPSE
  const side = narrow ? 0 : (collapsed ? info.isSideExpanded : info.isSideOpen) ? info.sideWidth : 0
  const conversation = narrow || !info.isConversationOpen ? 0 : collapsed ? Math.min(info.conversationWidth, Math.max(300, Math.round(viewport * 0.4))) : info.conversationWidth
  const room = rightbarRoom(viewport, side, conversation, 3)
  const besideChat = room >= RIGHTBAR_MIN ? room : rightbarRoom(viewport, 0, conversation, 2)
  const available = besideChat >= RIGHTBAR_MIN || info.isRightbarOpen ? besideChat : rightbarRoom(viewport, 0, 0, 2)
  const preference = info.rightbarWidth ?? Math.round(viewport * 0.3)
  const rightbar = narrow || available < RIGHTBAR_MIN ? 0 : Math.min(available, clamp(preference, RIGHTBAR_MIN, viewport * RIGHTBAR_MAX_RATIO))
  return { viewport, narrow, collapsed, side, conversation, rightbar, track: info.hasRightbarTrack ? rightbar : 0 }
}

/** Reports the frame's width to the layout store, at most once a frame. */
function useViewportWidth(frame: RefObject<HTMLDivElement>, actions: LayoutActions): void {
  useLayoutEffect(() => {
    const element = frame.current!
    let raf: number | undefined
    const measure = () => {
      const width = element.getBoundingClientRect().width
      if (width > 0) actions.setViewportWidth(width)
    }
    measure()
    const observer = new ResizeObserver(() => {
      raf ??= requestAnimationFrame(() => {
        raf = undefined
        measure()
      })
    })
    observer.observe(element)
    return () => {
      observer.disconnect()
      if (raf !== undefined) cancelAnimationFrame(raf)
    }
  }, [actions])
}

/** The rightbar track's box in the frame: the overlay that draws the rightbar follows the resized track. */
function useRightbarBox(frame: RefObject<HTMLDivElement>, track: RefObject<HTMLDivElement>, dependencies: unknown[]): Box | undefined {
  const [box, setBox] = useState<Box>()
  useLayoutEffect(() => {
    const element = track.current
    if (!element) { setBox(undefined); return }
    const measure = () => {
      const rect = element.getBoundingClientRect()
      const origin = frame.current!.getBoundingClientRect()
      setBox(before => before?.left === rect.left - origin.left && before.top === rect.top - origin.top && before.width === rect.width && before.height === rect.height ? before : { left: rect.left - origin.left, top: rect.top - origin.top, width: rect.width, height: rect.height })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    observer.observe(frame.current!)
    return () => observer.disconnect()
  }, dependencies)
  return box
}

/** Opens the workspace root's DeepSeek Harness workspace once at startup, unless the main view's session is already in it. */
function useOpenStartupWorkspace(workbench: Workbench, dshWorkspaces: RootLayoutOptions['dshWorkspaces'], openDshWorkspace: RootLayoutOptions['openDshWorkspace'], session: { id: string, cwd?: string } | undefined): void {
  const workspaces = useSyncExternalStore(dshWorkspaces.subscribe, dshWorkspaces.getSnapshot).items
  const [root, setRoot] = useState<string>()
  const workspaceId = root ? workspaces.find(workspace => isSamePath(workspace.path, root))?.workspaceId : undefined
  const opened = useRef(false)
  useEffect(() => {
    let active = true
    void workbench.client.readWorkbenchInfo().then(answer => { if (active) setRoot(answer.root) }).catch(() => {})
    return () => { active = false }
  }, [workbench])
  useEffect(() => {
    if (!root || opened.current) return
    if (session?.cwd && isSamePath(session.cwd, root)) {
      opened.current = true
      return
    }
    if (!workspaceId) return
    opened.current = true
    void openDshWorkspace(workspaceId).catch(() => { opened.current = false })
  }, [root, workspaceId, openDshWorkspace, session?.id, session?.cwd])
}

/** The page's title: the main view's session, else the open document. */
function useDocumentTitle(sessionTitle: string | undefined, documentTitle: string | undefined): void {
  useEffect(() => {
    const title = sessionTitle ?? documentTitle
    document.title = title ? `${title} — Presmium` : 'Presmium'
  }, [sessionTitle, documentTitle])
}

function RootLayout({ useStore, useSessions, usePanelInfo, actions, renderSlot, workbench, openSettings, openDshWorkspace, dshWorkspaces, globalPanels }: RootSlotProps & RootLayoutOptions) {
  const info = useStore(state => state.layoutInfo)
  const activePanel = usePanelInfo(panel => panel.activePanelId)
  const t = useClientMessages(workbench)
  const document_ = useWorkbenchState(state => state.document)
  const retainedDocument = useRef(false)
  if (document_ !== undefined) retainedDocument.current = true
  const documentTitle = useWorkbenchState(state => state.documents?.documents.find(doc => doc.dir === state.document)?.title)
  const session = useSessions(state => mainViewAgentSession(state.byId))
  const frame = useRef<HTMLDivElement>(null)
  const rightbarTrack = useRef<HTMLDivElement>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const geometry = solveGeometry(info)
  const { narrow, collapsed } = geometry
  const conversationPanel = usePanelRef()
  const sidePanelRef = usePanelRef()
  useEffect(() => {
    if (narrow || info.isConversationOpen) conversationPanel.current?.expand()
    else conversationPanel.current?.collapse()
  }, [narrow, info.isConversationOpen, conversationPanel])
  const sideShown = !narrow && (collapsed ? info.isSideExpanded : info.isSideOpen)
  useLayoutEffect(() => {
    if (sideShown || (narrow && info.narrowPane === 'sessions')) sidePanelRef.current?.expand()
    else sidePanelRef.current?.collapse()
  }, [sideShown, narrow, info.narrowPane, sidePanelRef])

  const rightbarBox = useRightbarBox(frame, rightbarTrack, [info.isRightbarOpen, info.hasRightbarTrack, info.isRightbarFullscreen, info.isConversationOpen, sideShown, narrow])
  useViewportWidth(frame, actions)

  const opened = useRef(document_)
  useEffect(() => {
    if (document_ !== undefined && document_ !== opened.current && narrow) actions.showNarrowPane('preview')
    if (document_ === undefined && narrow && info.narrowPane === 'preview') actions.showNarrowPane('documents')
    opened.current = document_
  }, [document_, narrow, actions, info.narrowPane])

  useOpenStartupWorkspace(workbench, dshWorkspaces, openDshWorkspace, session)
  useDocumentTitle(session?.title, documentTitle)

  const sidebar = useMemo(() => renderSlot('sidebar', { collapsed: false, width: narrow ? geometry.viewport : Math.max(geometry.side, 264) }), [renderSlot, narrow, geometry.viewport, geometry.side])
  const conversation = useMemo(() => renderSlot('main', {}, { entryKey: 'conversation' }), [renderSlot])
  const overlays = useMemo(() => renderSlot('shell.overlay', {}), [renderSlot])
  const bottom = useMemo(() => renderSlot('shell.bottom', {}), [renderSlot])
  const panel = activePanel !== null ? renderSlot('main', {}, { entryKey: activePanel }) : null
  const rightbar = renderSlot('rightbar', { width: rightbarBox?.width ?? geometry.rightbar, viewportWidth: geometry.viewport, canShow: geometry.rightbar > 0 })

  const pane: NarrowPane = narrow ? info.narrowPane : 'documents'
  const documentShown = panel === null && document_ !== undefined && (!narrow || pane === 'preview')
  const centre = <>
    {panel !== null && <div className="pmw-frame__panel" data-pmw-slot={`main:${activePanel}`}>{panel}</div>}
    {retainedDocument.current && <div className="pmw-frame__document" hidden={!documentShown}>
      <DocumentView active={documentShown} />
    </div>}
    {panel === null && (document_ === undefined || (narrow && pane === 'documents')) && <HomePanel />}
  </>

  return (
    <div
      ref={frame}
      className="pmw-frame pm-ui"
      data-narrow={narrow || undefined}
      data-collapsed={collapsed || undefined}
      data-pane={narrow ? pane : undefined}
      data-rightbar-fullscreen={info.isRightbarFullscreen || undefined}
    >
      <a className="pmw-frame__skip" href="#pmw-centre">{t.skip}</a>
      <ActivityBar workbench={workbench} info={info} actions={actions} activePanel={activePanel} globalPanels={globalPanels} pane={pane} narrow={narrow} openSettings={openSettings} openHelp={() => setHelpOpen(true)} />

      <Group className="pmw-frame__panels" disabled={narrow} onLayoutChanged={(layout, meta) => {
        if (!meta.isUserInteraction) return
        const width = info.viewportWidth - ACTIVITY
        if (layout.sessions !== undefined) actions.setSideWidth(layout.sessions * width / 100)
        if (layout.sessions === 0 && sideShown) actions.toggleSidebar()
        if (layout.conversation !== undefined) {
          actions.setConversationOpen(layout.conversation > 0)
          if (layout.conversation > 0) actions.setConversationWidth(layout.conversation * width / 100)
        }
        if (layout.rightbar !== undefined) actions.setRightbarWidth(layout.rightbar * width / 100)
      }}>
        {/* Collapsed, not hidden, on a wide screen: a hidden panel's box sits at the page's corner, and react-resizable-panels takes the gap from it to the centre (the activity bar) for a handle. */}
        <Panel id="sessions" panelRef={sidePanelRef} groupResizeBehavior="preserve-pixel-size" collapsible collapsedSize={0} defaultSize={info.sideWidth} minSize={narrow ? 0 : SIDE_MIN} maxSize={SIDE_MAX} className="pmw-frame__side-panel" hidden={narrow && pane !== 'sessions'}>
          <div className="pmw-frame__sidebar" data-pmw-slot="sidebar" data-shown={(narrow ? pane === 'sessions' : sideShown) || undefined}>{sidebar}</div>
        </Panel>
        {sideShown && <Separator className="pmw-frame__handle" data-side="side" aria-label={t.resize} />}
        <Panel id="centre" minSize={narrow ? 0 : 200} className="pmw-frame__centre-panel" hidden={narrow && (pane === 'sessions' || pane === 'conversation') && panel === null}>
          <main id="pmw-centre" className="pmw-frame__centre" aria-label={documentTitle ?? t.centre}>{centre}</main>
        </Panel>
        {!narrow && info.isRightbarOpen && !info.isRightbarFullscreen && geometry.track > 0 && (
          <>
            <Separator className="pmw-frame__handle" data-side="rightbar" aria-label={t.resize} />
            <Panel id="rightbar" groupResizeBehavior="preserve-pixel-size" defaultSize={geometry.track} minSize={RIGHTBAR_MIN} maxSize="70%"><div className="pmw-frame__rightbar-track" ref={rightbarTrack} /></Panel>
          </>
        )}
        {!narrow && info.isConversationOpen && <Separator className="pmw-frame__handle" data-side="conversation" aria-label={t.resize} />}
        <Panel id="conversation" panelRef={conversationPanel} groupResizeBehavior="preserve-pixel-size" collapsible collapsedSize={0} defaultSize={info.conversationWidth} minSize={narrow ? 0 : CONVERSATION_MIN} maxSize={narrow ? '100%' : CONVERSATION_MAX} hidden={narrow && pane !== 'conversation'}>
          <aside className="pmw-frame__conversation" aria-label={t.conversation} data-pmw-slot="main:conversation" data-shown={narrow ? pane === 'conversation' || undefined : info.isConversationOpen || undefined} hidden={!narrow && !info.isConversationOpen}>
            {conversation}
          </aside>
        </Panel>
      </Group>
      <div className="pmw-frame__rightbar pmw-frame__rightbar-overlay" data-pmw-slot="rightbar" style={info.isRightbarFullscreen ? { right: 0, width: geometry.viewport } : rightbarBox ?? { right: geometry.conversation, width: geometry.track }}>{rightbar}</div>

      <div className="pmw-frame__bottom" data-pmw-slot="shell.bottom">{bottom}</div>
      <div className="pmw-frame__overlay" data-pmw-slot="shell.overlay">{overlays}</div>

      <PmDialog open={helpOpen} label={t.help} closeLabel={t.close} onClose={() => setHelpOpen(false)}>
        <ul className="pmw-help">{t.helpItems.map(item => <li key={item}>{item}</li>)}</ul>
      </PmDialog>
    </div>
  )
}

interface ActivityBarProps {
  workbench: Workbench
  info: LayoutState['layoutInfo']
  actions: LayoutActions
  activePanel: string | null
  globalPanels: RootLayoutOptions['globalPanels']
  pane: NarrowPane
  narrow: boolean
  openSettings(): void
  openHelp(): void
}

/** The activity bar: the documents, the open document (on a narrow screen), the AI assistant; more, settings and help. */
function ActivityBar({ workbench, info, actions, activePanel, globalPanels, pane, narrow, openSettings, openHelp }: ActivityBarProps) {
  const t = useClientMessages(workbench)
  const document_ = useWorkbenchState(state => state.document)
  const documentTitle = useWorkbenchState(state => state.documents?.documents.find(doc => doc.dir === state.document)?.title)
  const working = useWorkbenchState(state => Boolean(state.review?.running))
  const panels = useSyncExternalStore(globalPanels.subscribe, globalPanels.getSnapshot)
  const chatShown = narrow ? pane === 'conversation' || pane === 'sessions' : info.isConversationOpen

  const items: { id: 'documents' | 'document' | 'assistant', icon: IconName, label: string, title?: string, pressed: boolean, busy?: boolean }[] = [
    { id: 'documents', icon: 'folder', label: t.documents, pressed: activePanel === null && (narrow ? pane === 'documents' : document_ === undefined) },
    ...narrow && document_ !== undefined ? [{ id: 'document' as const, icon: 'document' as const, label: t.document, title: documentTitle, pressed: activePanel === null && pane === 'preview' }] : [],
    { id: 'assistant', icon: 'sparkle', label: t.assistant, pressed: chatShown, busy: working },
  ]
  const activate = (id: typeof items[number]['id']) => {
    if (id === 'assistant') {
      if (narrow) actions.showNarrowPane(chatShown ? (document_ === undefined ? 'documents' : 'preview') : 'conversation')
      else actions.setConversationOpen(!info.isConversationOpen)
      return
    }
    // From a global panel, the first click gives back what was under it.
    const fromPanel = activePanel !== null
    actions.selectPanel(null)
    if (id === 'documents') {
      if (fromPanel && !narrow) return
      workbench.closeDocument()
      if (narrow) actions.showNarrowPane('documents')
    } else actions.showNarrowPane('preview')
  }
  const more = panels.map(({ options }) => ({ id: options.id!, label: typeof options.label === 'function' ? options.label() : options.label ?? options.id! }))

  return (
    <nav className="pmw-activity" aria-label={t.activity}>
      <span className="pmw-activity__logo"><Logo size={28} /></span>
      {items.map(item => (
        <button key={item.id} type="button" className="pmw-activity__button" data-activity={item.id} title={item.title ?? item.label} aria-pressed={item.pressed} onClick={() => activate(item.id)}>
          <PmIcon name={item.icon} />
          <span className="pmw-activity__label">{item.label}</span>
          {item.busy && <span className="pmw-activity__busy" aria-hidden="true" />}
        </button>
      ))}
      <span className="pmw-activity__end">
        {more.length > 0 && (
          <span className="pmw-activity__more" data-activity="more">
            <PmMenu label={t.more} placement="above-start" items={more} onSelect={(id) => {
              actions.selectPanel(activePanel === id ? null : id)
              if (narrow) actions.showNarrowPane('documents')
            }} />
            <span className="pmw-activity__label" aria-hidden="true">{t.more}</span>
          </span>
        )}
        <button type="button" className="pmw-activity__button" data-activity="settings" title={t.settings} onClick={openSettings}><PmIcon name="sliders" /><span className="pmw-activity__label">{t.settings}</span></button>
        <button type="button" className="pmw-activity__button" data-activity="help" title={t.help} onClick={openHelp}><PmIcon name="help" /><span className="pmw-activity__label">{t.help}</span></button>
      </span>
    </nav>
  )
}
