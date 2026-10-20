import { Group, Panel, Separator, usePanelRef } from 'react-resizable-panels'
import { ChangesPanel, DocumentView, FilesPanel, HomePanel, PmDialog, PmIcon, StatusItems, useWorkbench, WorkbenchProvider } from '@lincyaw/workbench'
import type { Workbench } from '@lincyaw/workbench'
import type { IconName } from '@lincyaw/design'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { Logo, useFrameMessages } from './brand.tsx'
import { ACTIVITY, CENTER_MIN, clamp, DOCK_MAX, DOCK_MIN, NARROW, RIGHTBAR_MAX_RATIO, RIGHTBAR_MIN, SIDE_COLLAPSE, SIDE_MAX, SIDE_MIN } from './layout.ts'
import type { Activity, LayoutActions, LayoutState, NarrowView } from './layout.ts'

interface FrameProps {
  useStore: DshSelectorHook<LayoutState>
  useSessions: DshSelectorHook<{ byId: Record<string, { id: string, title?: string, cwd?: string, retainedBy: { mainView?: number } }> }>
  usePanelInfo: DshSelectorHook<LayoutState['panelInfo']>
  actions: LayoutActions
  renderSlot(name: string, props?: Record<string, unknown>, options?: Record<string, unknown>): ReactNode
}

interface WorkspaceNavigation {
  workspaceStore: DshObservable<{ items: readonly { workspaceId: string, path: string }[] }>
  panelStore: DshObservable<readonly DshSlotEntry[]>
  openWorkspace(id: string): Promise<void>
}

const workspacePath = (path: string) => path.replace(/\\/g, '/').replace(/\/$/, '')

export function frameFor(workbench: Workbench, openSettings: () => void, openWorkspace: WorkspaceNavigation['openWorkspace'], workspaceStore: WorkspaceNavigation['workspaceStore'], panelStore: WorkspaceNavigation['panelStore']) {
  return function PresmiumFrame(props: FrameProps) {
    return (
      <WorkbenchProvider workbench={workbench}>
        <Frame {...props} workbench={workbench} openSettings={openSettings} openWorkspace={openWorkspace} workspaceStore={workspaceStore} panelStore={panelStore} />
      </WorkbenchProvider>
    )
  }
}

function solve(info: LayoutState['layoutInfo']) {
  const viewport = info.viewportWidth
  const narrow = viewport < NARROW
  const collapsed = viewport < SIDE_COLLAPSE
  const side = narrow ? 0 : (collapsed ? info.sideExpanded : info.sideOpen) ? info.side : 0
  const dock = narrow || !info.dockOpen ? 0 : collapsed ? Math.min(info.dock, Math.max(300, Math.round(viewport * 0.4))) : info.dock
  const room = viewport - ACTIVITY - side - dock - CENTER_MIN - 24
  const besideChat = room >= RIGHTBAR_MIN ? room : viewport - ACTIVITY - dock - CENTER_MIN - 16
  const available = besideChat >= RIGHTBAR_MIN || info.rightbarShown ? besideChat : viewport - ACTIVITY - CENTER_MIN - 16
  const preference = info.rightbar ?? Math.round(viewport * 0.3)
  const rightbar = narrow || available < RIGHTBAR_MIN ? 0 : Math.min(available, clamp(preference, RIGHTBAR_MIN, viewport * RIGHTBAR_MAX_RATIO))
  return { viewport, narrow, collapsed, side, dock, rightbar, track: info.rightbarTrack ? rightbar : 0 }
}

function Frame({ useStore, useSessions, usePanelInfo, actions, renderSlot, workbench, openSettings, openWorkspace, workspaceStore, panelStore }: FrameProps & WorkspaceNavigation & { workbench: Workbench, openSettings(): void }) {
  const info = useStore(state => state.layoutInfo)
  const activePanel = usePanelInfo(panel => panel.activePanelId)
  const t = useFrameMessages(workbench)
  const document_ = useWorkbench(state => state.document)
  const documentTitle = useWorkbench(state => state.documents?.documents.find(doc => doc.dir === state.document)?.title)
  const activeFile = useWorkbench(state => state.active)
  const sourceNavigation = useWorkbench(state => state.reveal?.seq)
  const workspaces = useSyncExternalStore(workspaceStore.subscribe, workspaceStore.getSnapshot).items
  const globalPanels = useSyncExternalStore(panelStore.subscribe, panelStore.getSnapshot)
  const session = useSessions(state => Object.values(state.byId).find(session => (session.retainedBy.mainView ?? 0) > 0))
  const [root, setRoot] = useState<string>()
  const workspaceId = root ? workspaces.find(workspace => workspacePath(workspace.path) === workspacePath(root))?.workspaceId : undefined
  const workspaceOpened = useRef(false)
  const pending = useWorkbench(state => state.review?.changes.length ?? 0)
  const frame = useRef<HTMLDivElement>(null)
  const rightbarTrack = useRef<HTMLDivElement>(null)
  const [rightbarBox, setRightbarBox] = useState<{ left: number, top: number, width: number, height: number }>()
  const [helpOpen, setHelpOpen] = useState(false)
  const geometry = solve(info)
  const { narrow, collapsed } = geometry
  const lastSource = useRef({ file: activeFile, navigation: sourceNavigation })
  useEffect(() => {
    const changed = lastSource.current.file !== activeFile || lastSource.current.navigation !== sourceNavigation
    lastSource.current = { file: activeFile, navigation: sourceNavigation }
    if (narrow && activeFile && (changed || (info.view !== 'conversation' && info.view !== 'sessions'))) actions.show('source')
  }, [narrow, activeFile, sourceNavigation, actions])
  const dockPanel = usePanelRef()
  const sidePanelRef = usePanelRef()
  useEffect(() => {
    if (narrow || info.dockOpen) dockPanel.current?.expand()
    else dockPanel.current?.collapse()
  }, [narrow, info.dockOpen, dockPanel])
  const sideShown = !narrow && (collapsed ? info.sideExpanded : info.sideOpen)
  useLayoutEffect(() => {
    if (sideShown || (narrow && info.view === 'sessions')) sidePanelRef.current?.expand()
    else sidePanelRef.current?.collapse()
  }, [sideShown, narrow, info.view, sidePanelRef])

  useLayoutEffect(() => {
    const track = rightbarTrack.current
    if (!track) { setRightbarBox(undefined); return }
    const measure = () => {
      const box = track.getBoundingClientRect()
      const origin = frame.current!.getBoundingClientRect()
      setRightbarBox(before => before?.left === box.left - origin.left && before.top === box.top - origin.top && before.width === box.width && before.height === box.height ? before : { left: box.left - origin.left, top: box.top - origin.top, width: box.width, height: box.height })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(track)
    observer.observe(frame.current!)
    return () => observer.disconnect()
  }, [info.rightbarShown, info.rightbarTrack, info.rightbarFullscreen, info.dockOpen, sideShown, narrow])

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

  const opened = useRef(document_)
  useEffect(() => {
    if (document_ !== undefined && document_ !== opened.current) {
      if (narrow) actions.show('files')
      else if (info.activity !== 'files') actions.choose('files')
    }
    if (document_ === undefined && narrow && (info.view === 'files' || info.view === 'source' || info.view === 'preview' || info.view === 'changes')) actions.show('documents')
    opened.current = document_
  }, [document_, narrow, actions, info.activity, info.view])

  useEffect(() => {
    let active = true
    void workbench.client.workbench().then(answer => { if (active) setRoot(answer.root) }).catch(() => {})
    return () => { active = false }
  }, [workbench])
  useEffect(() => {
    if (!root || workspaceOpened.current) return
    if (session?.cwd && workspacePath(session.cwd) === workspacePath(root)) {
      workspaceOpened.current = true
      return
    }
    if (!workspaceId) return
    workspaceOpened.current = true
    void openWorkspace(workspaceId).catch(() => { workspaceOpened.current = false })
  }, [root, workspaceId, openWorkspace, session?.id, session?.cwd])
  const sessionTitle = session?.title
  useEffect(() => {
    const title = sessionTitle ?? documentTitle
    document.title = title ? `${title} — Presmium` : 'Presmium'
  }, [sessionTitle, documentTitle])

  const sidebar = useMemo(() => renderSlot('sidebar', { collapsed: false, width: narrow ? geometry.viewport : Math.max(geometry.side, 264) }), [renderSlot, narrow, geometry.viewport, geometry.side])
  const conversation = useMemo(() => renderSlot('main', {}, { entryKey: 'conversation' }), [renderSlot])
  const overlays = useMemo(() => renderSlot('shell.overlay', {}), [renderSlot])
  const bottom = useMemo(() => renderSlot('shell.bottom', {}), [renderSlot])
  const panel = activePanel !== null ? renderSlot('main', {}, { entryKey: activePanel }) : null
  const rightbar = renderSlot('rightbar', { width: rightbarBox?.width ?? geometry.rightbar, viewportWidth: geometry.viewport, canShow: geometry.rightbar > 0 })

  const go = (target: Activity | NarrowView) => {
    if (target === 'sessions') { actions.toggleConversations(); return }
    if (narrow || target !== 'conversation') actions.selectPanel(null)
    if (target === 'documents') {
      workbench.closeDocument()
      if (narrow && workbench.state.document === undefined) actions.show('documents')
      return
    }
    if (narrow) actions.show(target as NarrowView)
    else if (target === 'files' || target === 'changes') actions.choose(target)
  }
  const sideContent = info.activity === 'sessions' ? 'sessions' : info.activity === 'changes' && document_ !== undefined ? 'changes' : 'files'
  const view: NarrowView = narrow ? info.view : 'documents'

  const documentShown = panel === null && (!narrow || view === 'source' || view === 'preview')
  const centre = <>
    {panel !== null && <div className="pmw-frame__panel" data-pmw-slot={`main:${activePanel}`}>{panel}</div>}
    {document_ !== undefined && <div className="pmw-frame__document" hidden={!documentShown}>
      <DocumentView only={narrow ? view === 'preview' ? 'preview' : 'source' : undefined} />
    </div>}
    {panel === null && (narrow
      ? view === 'changes' && document_ !== undefined ? <ChangesPanel /> : view === 'files' ? <FilesOrDocuments workbench={workbench} onOpen={() => actions.show('source')} />
        : view === 'documents' || (document_ === undefined && (view === 'source' || view === 'preview')) ? <HomePanel /> : null
      : document_ === undefined ? <HomePanel /> : null)}
  </>

  const changes = document_ === undefined ? [] : [{ id: 'changes' as const, icon: 'diff' as const, label: t.changes, pressed: narrow ? view === 'changes' : sideShown && sideContent === 'changes', count: pending }]
  const activities: { id: Activity | NarrowView, icon: IconName, label: string, pressed: boolean, count?: number }[] = narrow
    ? [
        { id: 'documents', icon: 'document', label: t.documents, pressed: activePanel === null && view === 'documents' },
        { id: 'files', icon: 'folder', label: t.files, pressed: view === 'files' },
        { id: 'source', icon: 'edit', label: t.source, pressed: view === 'source' },
        { id: 'preview', icon: 'slides', label: t.preview, pressed: view === 'preview' },
        ...changes,
        { id: 'sessions', icon: 'history', label: t.conversationHistory, pressed: view === 'sessions' || view === 'conversation' },
      ]
    : [
        { id: 'documents', icon: 'document', label: t.documents, pressed: document_ === undefined && activePanel === null && !sideShown },
        { id: 'files', icon: 'folder', label: t.files, pressed: sideShown && sideContent === 'files' },
        ...changes,
        { id: 'sessions', icon: 'history', label: t.conversationHistory, pressed: info.dockOpen || (sideShown && sideContent === 'sessions') },
      ]

  const sidePanel = (<>
          <aside className="pmw-frame__side" aria-label={t.side} data-shown={sideShown || undefined} data-content={sideContent}>
            <div className="pmw-frame__side-files" hidden={sideContent !== 'files'}>{!narrow && <FilesOrDocuments workbench={workbench} />}</div>
            {sideContent === 'changes' && <ChangesPanel />}
          </aside>
          <div className="pmw-frame__sidebar" data-pmw-slot="sidebar" data-shown={(narrow ? view === 'sessions' : sideShown && sideContent === 'sessions') || undefined}>{sidebar}</div>
        </>)

  return (
    <div
      ref={frame}
      className="pmw-frame pm-ui"
      data-narrow={narrow || undefined}
      data-collapsed={collapsed || undefined}
      data-view={narrow ? view : undefined}
      data-rightbar-fullscreen={info.rightbarFullscreen || undefined}
    >
      <a className="pmw-frame__skip" href="#pmw-centre">{t.skip}</a>
      <nav className="pmw-activity" aria-label={t.activity}>
        <span className="pmw-activity__logo"><Logo size={28} /></span>
        {activities.map(item => (
          <button key={item.id} type="button" className="pmw-activity__button" data-activity={item.id} aria-label={item.label} title={item.label} aria-pressed={item.pressed && (!narrow || activePanel === null)} onClick={() => go(item.id)}>
            <PmIcon name={item.icon} />
            {item.count ? <span className="pmw-activity__count">{item.count}</span> : null}
          </button>
        ))}
        <span className="pmw-activity__end">
          {globalPanels.map(({ options }) => {
            const id = options.id!
            const label = typeof options.label === 'function' ? options.label() : options.label ?? id
            return <button key={id} type="button" className="pmw-activity__button" data-activity={id} aria-label={label} title={label} aria-pressed={activePanel === id} onClick={() => {
              actions.selectPanel(activePanel === id ? null : id)
              if (narrow) actions.show(activePanel === id && document_ !== undefined ? 'preview' : 'documents')
            }}>
              {renderSlot('sidebar.panellist', { size: 20, active: activePanel === id }, { only: id })}
            </button>
          })}
          <button type="button" className="pmw-activity__button" data-activity="settings" aria-label={t.settings} title={t.settings} onClick={openSettings}><PmIcon name="sliders" /></button>
          <button type="button" className="pmw-activity__button" data-activity="help" aria-label={t.help} title={t.help} onClick={() => setHelpOpen(true)}><PmIcon name="help" /></button>
        </span>
      </nav>

      <Group className="pmw-frame__panels" disabled={narrow} onLayoutChanged={(layout, meta) => {
        if (!meta.isUserInteraction) return
        const width = info.viewportWidth - ACTIVITY
        if (layout.files !== undefined) actions.setSide(layout.files * width / 100)
        if (layout.files === 0 && sideShown) actions.toggleSidebar()
        if (layout.conversation !== undefined) {
          actions.setDockOpen(layout.conversation > 0)
          if (layout.conversation > 0) actions.setDock(layout.conversation * width / 100)
        }
        if (layout.rightbar !== undefined) actions.setRightbar(layout.rightbar * width / 100)
      }}>
        <Panel id="files" panelRef={sidePanelRef} groupResizeBehavior="preserve-pixel-size" collapsible collapsedSize={0} defaultSize={info.side} minSize={narrow ? 0 : SIDE_MIN} maxSize={SIDE_MAX} className="pmw-frame__side-panel" hidden={narrow ? view !== 'sessions' : !sideShown}>{sidePanel}</Panel>
        {sideShown && <Separator className="pmw-frame__handle" data-side="side" aria-label={t.resize} />}
        <Panel id="centre" minSize={narrow ? 0 : 200} className="pmw-frame__centre-panel" hidden={narrow && (view === 'sessions' || view === 'conversation') && panel === null}>
          <main id="pmw-centre" className="pmw-frame__centre" aria-label={documentTitle ?? t.centre}>{centre}</main>
        </Panel>
        {!narrow && info.rightbarShown && !info.rightbarFullscreen && geometry.track > 0 && (
          <>
            <Separator className="pmw-frame__handle" data-side="rightbar" aria-label={t.resize} />
            <Panel id="rightbar" groupResizeBehavior="preserve-pixel-size" defaultSize={geometry.track} minSize={RIGHTBAR_MIN} maxSize="70%"><div className="pmw-frame__rightbar-track" ref={rightbarTrack} /></Panel>
          </>
        )}
        {!narrow && info.dockOpen && <Separator className="pmw-frame__handle" data-side="dock" aria-label={t.resize} />}
        <Panel id="conversation" panelRef={dockPanel} groupResizeBehavior="preserve-pixel-size" collapsible collapsedSize={0} defaultSize={info.dock} minSize={narrow ? 0 : DOCK_MIN} maxSize={narrow ? '100%' : DOCK_MAX} hidden={narrow && view !== 'conversation'}>
          <aside className="pmw-frame__dock" aria-label={t.conversation} data-pmw-slot="main:conversation" data-shown={narrow ? view === 'conversation' || undefined : info.dockOpen || undefined} hidden={!narrow && !info.dockOpen}>
            {conversation}
          </aside>
        </Panel>
      </Group>
      <div className="pmw-frame__rightbar pmw-frame__rightbar-overlay" data-pmw-slot="rightbar" style={info.rightbarFullscreen ? { right: 0, width: geometry.viewport } : rightbarBox ?? { right: geometry.dock, width: geometry.track }}>{rightbar}</div>

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

function FilesOrDocuments({ workbench, onOpen }: { workbench: Workbench, onOpen?: () => void }) {
  const document_ = useWorkbench(state => state.document)
  const documents = useWorkbench(state => state.documents)
  const t = useFrameMessages(workbench)
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
