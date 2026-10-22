import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels'
import { ChangesPanel, DocumentEditor, FilesPanel, HomePanel, PmDialog, PmIcon, QuickOpen, StatusItems, useWorkbenchState, WorkbenchProvider } from '@lincyaw/workbench'
import type { DocumentPane, Workbench } from '@lincyaw/workbench'
import type { IconName } from '@lincyaw/design'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode, RefObject } from 'react'
import { Logo } from './brand.tsx'
import { mainViewAgentSession } from './document-context.ts'
import { ACTIVITY, clamp, CONVERSATION_MAX, CONVERSATION_MIN, NARROW, RIGHTBAR_MAX_RATIO, RIGHTBAR_MIN, rightbarRoom, SIDE_COLLAPSE, SIDE_MAX, SIDE_MIN } from './layout.ts'
import type { Activity, LayoutActions, LayoutState, NarrowPane } from './layout.ts'
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
  const activeFile = useWorkbenchState(state => state.activeFile)
  const sourceNavigation = useWorkbenchState(state => state.reveal?.sequence)
  const session = useSessions(state => mainViewAgentSession(state.byId))
  const frame = useRef<HTMLDivElement>(null)
  const rightbarTrack = useRef<HTMLDivElement>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const geometry = solveGeometry(info)
  const { narrow, collapsed } = geometry
  const lastEditorPane = useRef<DocumentPane>('preview')
  if (narrow && (info.narrowPane === 'source' || info.narrowPane === 'preview')) lastEditorPane.current = info.narrowPane
  const lastSource = useRef({ file: activeFile, navigation: sourceNavigation })
  useEffect(() => {
    const changed = lastSource.current.file !== activeFile || lastSource.current.navigation !== sourceNavigation
    lastSource.current = { file: activeFile, navigation: sourceNavigation }
    if (narrow && activeFile && (changed || (info.narrowPane !== 'conversation' && info.narrowPane !== 'sessions'))) actions.showNarrowPane('source')
  }, [narrow, activeFile, sourceNavigation, actions])
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
    if (document_ !== undefined && document_ !== opened.current) {
      if (narrow) actions.showNarrowPane('preview')
      else if (info.activity !== 'files') actions.selectActivity('files')
    }
    if (document_ === undefined && narrow && (info.narrowPane === 'files' || info.narrowPane === 'source' || info.narrowPane === 'preview' || info.narrowPane === 'changes')) actions.showNarrowPane('documents')
    opened.current = document_
  }, [document_, narrow, actions, info.activity, info.narrowPane])

  useOpenStartupWorkspace(workbench, dshWorkspaces, openDshWorkspace, session)
  useDocumentTitle(session?.title, documentTitle)

  const sidebar = useMemo(() => renderSlot('sidebar', { collapsed: false, width: narrow ? geometry.viewport : Math.max(geometry.side, 264) }), [renderSlot, narrow, geometry.viewport, geometry.side])
  const conversation = useMemo(() => renderSlot('main', {}, { entryKey: 'conversation' }), [renderSlot])
  const overlays = useMemo(() => renderSlot('shell.overlay', {}), [renderSlot])
  const bottom = useMemo(() => renderSlot('shell.bottom', {}), [renderSlot])
  const panel = activePanel !== null ? renderSlot('main', {}, { entryKey: activePanel }) : null
  const rightbar = renderSlot('rightbar', { width: rightbarBox?.width ?? geometry.rightbar, viewportWidth: geometry.viewport, canShow: geometry.rightbar > 0 })

  const sideContent = info.activity === 'sessions' ? 'sessions' : info.activity === 'changes' && document_ !== undefined ? 'changes' : 'files'
  const pane: NarrowPane = narrow ? info.narrowPane : 'documents'

  const documentShown = panel === null && (!narrow || pane === 'source' || pane === 'preview')
  const centre = <>
    {panel !== null && <div className="pmw-frame__panel" data-pmw-slot={`main:${activePanel}`}>{panel}</div>}
    {retainedDocument.current && <div className="pmw-frame__document" hidden={document_ === undefined || !documentShown}>
      <DocumentEditor active={document_ !== undefined && documentShown} only={narrow ? pane === 'preview' ? 'preview' : 'source' : undefined} onNavigate={narrow ? pane => actions.showNarrowPane(pane) : undefined} />
    </div>}
    {panel === null && (narrow
      ? pane === 'changes' && document_ !== undefined ? <ChangesPanel /> : pane === 'files' ? <FilesOrDocuments workbench={workbench} onOpen={() => actions.showNarrowPane('source')} />
        : pane === 'documents' || (document_ === undefined && (pane === 'source' || pane === 'preview')) ? <HomePanel /> : null
      : document_ === undefined ? <HomePanel /> : null)}
  </>

  const sidePanel = (<>
          <aside className="pmw-frame__side" aria-label={t.side} data-shown={sideShown || undefined} data-content={sideContent}>
            <div className="pmw-frame__side-files" hidden={sideContent !== 'files'}>{!narrow && <FilesOrDocuments workbench={workbench} />}</div>
            {sideContent === 'changes' && <ChangesPanel />}
          </aside>
          <div className="pmw-frame__sidebar" data-pmw-slot="sidebar" data-shown={(narrow ? pane === 'sessions' : sideShown && sideContent === 'sessions') || undefined}>{sidebar}</div>
        </>)

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
      <ActivityBar workbench={workbench} info={info} actions={actions} renderSlot={renderSlot} activePanel={activePanel} globalPanels={globalPanels} pane={pane} sideShown={sideShown} sideContent={sideContent} narrow={narrow} lastEditorPane={lastEditorPane} openSettings={openSettings} openHelp={() => setHelpOpen(true)} />

      <Group className="pmw-frame__panels" disabled={narrow} onLayoutChanged={(layout, meta) => {
        if (!meta.isUserInteraction) return
        const width = info.viewportWidth - ACTIVITY
        if (layout.files !== undefined) actions.setSideWidth(layout.files * width / 100)
        if (layout.files === 0 && sideShown) actions.toggleSidebar()
        if (layout.conversation !== undefined) {
          actions.setConversationOpen(layout.conversation > 0)
          if (layout.conversation > 0) actions.setConversationWidth(layout.conversation * width / 100)
        }
        if (layout.rightbar !== undefined) actions.setRightbarWidth(layout.rightbar * width / 100)
      }}>
        <Panel id="files" panelRef={sidePanelRef} groupResizeBehavior="preserve-pixel-size" collapsible collapsedSize={0} defaultSize={info.sideWidth} minSize={narrow ? 0 : SIDE_MIN} maxSize={SIDE_MAX} className="pmw-frame__side-panel" hidden={narrow ? pane !== 'sessions' : !sideShown}>{sidePanel}</Panel>
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

      <footer className="pmw-frame__status" aria-label={t.status}>
        <StatusItems />
      </footer>
      <div className="pmw-frame__bottom" data-pmw-slot="shell.bottom">{bottom}</div>
      <div className="pmw-frame__overlay" data-pmw-slot="shell.overlay">{overlays}</div>


      <PmDialog open={helpOpen} label={t.help} closeLabel={t.close} onClose={() => setHelpOpen(false)}>
        <p>{t.helpText}</p>
      </PmDialog>
    </div>
  )
}

interface ActivityBarProps {
  workbench: Workbench
  info: LayoutState['layoutInfo']
  actions: LayoutActions
  renderSlot: RootSlotProps['renderSlot']
  activePanel: string | null
  globalPanels: RootLayoutOptions['globalPanels']
  pane: NarrowPane
  sideShown: boolean
  sideContent: 'sessions' | 'changes' | 'files'
  narrow: boolean
  lastEditorPane: RefObject<DocumentPane>
  openSettings(): void
  openHelp(): void
}

/** The activity bar: the logo, Quick Open, the activities, the global panels, the settings and the help. */
function ActivityBar({ workbench, info, actions, renderSlot, activePanel, globalPanels, pane, sideShown, sideContent, narrow, lastEditorPane, openSettings, openHelp }: ActivityBarProps) {
  const t = useClientMessages(workbench)
  const document_ = useWorkbenchState(state => state.document)
  const pendingReviewCount = useWorkbenchState(state => state.review?.changes.length ?? 0)
  const panels = useSyncExternalStore(globalPanels.subscribe, globalPanels.getSnapshot)

  const activate = (target: Activity | NarrowPane) => {
    if (target === 'sessions') { actions.toggleConversations(); return }
    if (narrow || target !== 'conversation') actions.selectPanel(null)
    if (target === 'documents') {
      workbench.closeDocument()
      if (narrow && workbench.state.document === undefined) actions.showNarrowPane('documents')
      return
    }
    if (narrow) actions.showNarrowPane(target === 'preview' ? workbench.state.layout === 'split' ? lastEditorPane.current! : workbench.state.layout : target as NarrowPane)
    else if (target === 'files' || target === 'changes') actions.selectActivity(target)
  }

  const changes = document_ === undefined ? [] : [{ id: 'changes' as const, icon: 'diff' as const, label: t.changes, pressed: narrow ? pane === 'changes' : sideShown && sideContent === 'changes', count: pendingReviewCount }]
  const activities: { id: Activity | NarrowPane, icon: IconName, label: string, pressed: boolean, count?: number }[] = narrow
    ? [
        { id: 'documents', icon: 'document', label: t.documents, pressed: activePanel === null && pane === 'documents' },
        { id: 'files', icon: 'folder', label: t.files, pressed: pane === 'files' },
        { id: 'preview', icon: 'document', label: t.editor, pressed: pane === 'source' || pane === 'preview' },
        ...changes,
        { id: 'sessions', icon: 'history', label: t.conversationHistory, pressed: pane === 'sessions' || pane === 'conversation' },
      ]
    : [
        { id: 'documents', icon: 'document', label: t.documents, pressed: document_ === undefined && activePanel === null && !sideShown },
        { id: 'files', icon: 'folder', label: t.files, pressed: sideShown && sideContent === 'files' },
        ...changes,
        { id: 'sessions', icon: 'history', label: t.conversationHistory, pressed: info.isConversationOpen || (sideShown && sideContent === 'sessions') },
      ]

  return (
    <nav className="pmw-activity" aria-label={t.activity}>
      <span className="pmw-activity__logo"><Logo size={28} /></span>
      <QuickOpen onNavigate={pane => { actions.selectPanel(null); actions.showNarrowPane(pane) }} />
      {activities.map(item => (
        <button key={item.id} type="button" className="pmw-activity__button" data-activity={item.id} aria-label={item.label} title={item.label} aria-pressed={item.pressed && (!narrow || activePanel === null)} onClick={() => activate(item.id)}>
          <PmIcon name={item.icon} />
          {item.count ? <span className="pmw-activity__count">{item.count}</span> : null}
        </button>
      ))}
      <span className="pmw-activity__end">
        {panels.map(({ options }) => {
          const id = options.id!
          const label = typeof options.label === 'function' ? options.label() : options.label ?? id
          return <button key={id} type="button" className="pmw-activity__button" data-activity={id} aria-label={label} title={label} aria-pressed={activePanel === id} onClick={() => {
            actions.selectPanel(activePanel === id ? null : id)
            if (narrow) actions.showNarrowPane(activePanel === id && document_ !== undefined ? 'preview' : 'documents')
          }}>
            {renderSlot('sidebar.panellist', { size: 20, active: activePanel === id }, { only: id })}
          </button>
        })}
        <button type="button" className="pmw-activity__button" data-activity="settings" aria-label={t.settings} title={t.settings} onClick={openSettings}><PmIcon name="sliders" /></button>
        <button type="button" className="pmw-activity__button" data-activity="help" aria-label={t.help} title={t.help} onClick={openHelp}><PmIcon name="help" /></button>
      </span>
    </nav>
  )
}

function FilesOrDocuments({ workbench, onOpen }: { workbench: Workbench, onOpen?: () => void }) {
  const document_ = useWorkbenchState(state => state.document)
  const documents = useWorkbenchState(state => state.documents)
  const t = useClientMessages(workbench)
  if (document_ !== undefined) return <FilesPanel onOpen={onOpen} />
  return (
    <nav className="pmw-files" aria-label={t.documents}>
      <h2 className="pmw-files__title">{documents?.title ?? t.documents}</h2>
      <ul className="pmw-tree">
        {(documents?.documents ?? []).map(doc => (
          <li key={doc.dir}>
            <button type="button" className="pmw-tree__file" onClick={() => void workbench.openDocument(doc.dir)}>
              <PmIcon name="document" size={15} />
              {doc.title}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
