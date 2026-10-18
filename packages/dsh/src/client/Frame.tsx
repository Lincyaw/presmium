import { ChangesPanel, DocumentView, FilesPanel, HomePanel, PmDialog, PmIcon, StatusItems, useWorkbench, WorkbenchProvider } from '@presmium/workbench'
import type { Workbench } from '@presmium/workbench'
import type { IconName } from '@presmium/design'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import { Logo, useFrameMessages } from './brand.tsx'
import { ACTIVITY, CENTER_MIN, clamp, NARROW, RIGHTBAR_MAX_RATIO, RIGHTBAR_MIN, SIDE_COLLAPSE } from './layout.ts'
import type { Activity, LayoutActions, LayoutState, NarrowView } from './layout.ts'

interface FrameProps {
  useStore: DshSelectorHook<LayoutState>
  useSessions: DshSelectorHook<{ byId: Record<string, { id: string, title?: string, cwd?: string, retainedBy: { mainView?: number } }> }>
  usePanelInfo: DshSelectorHook<LayoutState['panelInfo']>
  actions: LayoutActions
  renderSlot(name: string, props?: Record<string, unknown>, options?: Record<string, unknown>): ReactNode
}

export function frameFor(workbench: Workbench, openSettings: () => void) {
  return function PresmiumFrame(props: FrameProps) {
    return (
      <WorkbenchProvider workbench={workbench}>
        <Frame {...props} workbench={workbench} openSettings={openSettings} />
      </WorkbenchProvider>
    )
  }
}

function solve(info: LayoutState['layoutInfo']) {
  const viewport = info.viewportWidth
  const narrow = viewport < NARROW
  const collapsed = viewport < SIDE_COLLAPSE
  const side = narrow || collapsed ? 0 : info.sideOpen ? info.side : 0
  const dock = narrow ? 0 : collapsed ? Math.min(info.dock, Math.max(300, Math.round(viewport * 0.4))) : info.dock
  const room = viewport - (narrow ? 0 : ACTIVITY) - side - dock - CENTER_MIN
  const preference = info.rightbar ?? Math.round(viewport * 0.3)
  const rightbar = narrow || room < RIGHTBAR_MIN ? 0 : Math.min(room, clamp(preference, RIGHTBAR_MIN, viewport * RIGHTBAR_MAX_RATIO))
  return { viewport, narrow, collapsed, side, dock, rightbar, track: info.rightbarTrack ? rightbar : 0 }
}

function Frame({ useStore, useSessions, usePanelInfo, actions, renderSlot, workbench, openSettings }: FrameProps & { workbench: Workbench, openSettings(): void }) {
  const info = useStore(state => state.layoutInfo)
  const activePanel = usePanelInfo(panel => panel.activePanelId)
  const t = useFrameMessages(workbench)
  const document_ = useWorkbench(state => state.document)
  const documentTitle = useWorkbench(state => state.documents?.documents.find(doc => doc.dir === state.document)?.title)
  const pending = useWorkbench(state => state.review?.changes.length ?? 0)
  const frame = useRef<HTMLDivElement>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const geometry = solve(info)
  const { narrow, collapsed } = geometry

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

  const sessionTitle = useSessions((state) => {
    const current = Object.values(state.byId).find(session => (session.retainedBy.mainView ?? 0) > 0)
    return current?.title
  })
  useEffect(() => {
    const title = sessionTitle ?? documentTitle
    document.title = title ? `${title} — Presmium` : 'Presmium'
  }, [sessionTitle, documentTitle])

  const sidebar = useMemo(() => renderSlot('sidebar', { collapsed: false, width: narrow ? geometry.viewport : Math.max(geometry.side, 264) }), [renderSlot, narrow, geometry.viewport, geometry.side])
  const conversation = useMemo(() => renderSlot('main', {}, { entryKey: 'conversation' }), [renderSlot])
  const overlays = useMemo(() => renderSlot('shell.overlay', {}), [renderSlot])
  const bottom = useMemo(() => renderSlot('shell.bottom', {}), [renderSlot])
  const panel = activePanel !== null ? renderSlot('main', {}, { entryKey: activePanel }) : null
  const rightbar = renderSlot('rightbar', { width: geometry.rightbar, viewportWidth: geometry.viewport, canShow: geometry.rightbar > 0 })

  const go = (target: Activity | NarrowView) => {
    if (target !== 'sessions' && target !== 'conversation') actions.selectPanel(null)
    if (target === 'documents') {
      workbench.closeDocument()
      if (narrow) actions.show('documents')
      return
    }
    if (narrow) actions.show(target as NarrowView)
    else if (target === 'files' || target === 'changes' || target === 'sessions') actions.choose(target)
  }
  const sideContent = info.activity === 'sessions' ? 'sessions' : info.activity === 'changes' && document_ !== undefined ? 'changes' : 'files'
  const view: NarrowView = narrow ? info.view : 'documents'
  const sideShown = !narrow && (collapsed ? info.sideExpanded : info.sideOpen)

  const centre = panel !== null
    ? <div className="pmw-frame__panel" data-pmw-slot={`main:${activePanel}`}>{panel}</div>
    : narrow
      ? (
          view === 'files'
            ? <FilesOrDocuments workbench={workbench} onOpen={() => actions.show('source')} />
            : view === 'source' || view === 'preview'
              ? (document_ === undefined ? <HomePanel /> : <DocumentView only={view} />)
              : view === 'changes' && document_ !== undefined
                ? <ChangesPanel />
                : view === 'documents' ? <HomePanel /> : null
        )
      : (document_ === undefined ? <HomePanel /> : <DocumentView />)

  const changes = document_ === undefined ? [] : [{ id: 'changes' as const, icon: 'diff' as const, label: t.changes, pressed: narrow ? view === 'changes' : sideShown && sideContent === 'changes', count: pending }]
  const activities: { id: Activity | NarrowView, icon: IconName, label: string, pressed: boolean, count?: number }[] = narrow
    ? [
        { id: 'documents', icon: 'document', label: t.documents, pressed: view === 'documents' },
        { id: 'files', icon: 'folder', label: t.files, pressed: view === 'files' },
        { id: 'source', icon: 'edit', label: t.source, pressed: view === 'source' },
        { id: 'preview', icon: 'slides', label: t.preview, pressed: view === 'preview' },
        ...changes,
        { id: 'sessions', icon: 'history', label: t.sessions, pressed: view === 'sessions' },
        { id: 'conversation', icon: 'sparkle', label: t.conversation, pressed: view === 'conversation' },
      ]
    : [
        { id: 'documents', icon: 'document', label: t.documents, pressed: document_ === undefined && activePanel === null },
        { id: 'files', icon: 'folder', label: t.files, pressed: sideShown && sideContent === 'files' },
        ...changes,
        { id: 'sessions', icon: 'history', label: t.sessions, pressed: sideShown && sideContent === 'sessions' },
      ]

  return (
    <div
      ref={frame}
      className="pmw-frame pm-ui"
      data-narrow={narrow || undefined}
      data-collapsed={collapsed || undefined}
      data-view={narrow ? view : undefined}
      data-rightbar-fullscreen={info.rightbarFullscreen || undefined}
      style={narrow ? undefined : { gridTemplateColumns: `${ACTIVITY}px ${geometry.side}px minmax(0, 1fr) ${geometry.track}px ${geometry.dock}px` }}
    >
      <a className="pmw-frame__skip" href="#pmw-centre">{t.skip}</a>
      <nav className="pmw-activity" aria-label={t.activity}>
        <span className="pmw-activity__logo"><Logo size={28} /></span>
        {activities.map(item => (
          <button key={item.id} type="button" className="pmw-activity__button" data-activity={item.id} aria-label={item.label} title={item.label} aria-pressed={item.pressed} onClick={() => go(item.id)}>
            <PmIcon name={item.icon} />
            {item.count ? <span className="pmw-activity__count">{item.count}</span> : null}
          </button>
        ))}
        <span className="pmw-activity__end">
          <button type="button" className="pmw-activity__button" data-activity="settings" aria-label={t.settings} title={t.settings} onClick={openSettings}><PmIcon name="sliders" /></button>
          <button type="button" className="pmw-activity__button" data-activity="help" aria-label={t.help} title={t.help} onClick={() => setHelpOpen(true)}><PmIcon name="help" /></button>
        </span>
      </nav>

      {!narrow && (
        <aside className="pmw-frame__side" aria-label={t.side} data-shown={sideShown || undefined} data-content={sideContent}>
          <div className="pmw-frame__side-files" hidden={sideContent !== 'files'}><FilesOrDocuments workbench={workbench} /></div>
          {sideContent === 'changes' && <ChangesPanel />}
        </aside>
      )}

      <div className="pmw-frame__sidebar" data-pmw-slot="sidebar" data-shown={(narrow ? view === 'sessions' : sideShown && sideContent === 'sessions') || undefined}>{sidebar}</div>

      <main id="pmw-centre" className="pmw-frame__centre" aria-label={documentTitle ?? t.centre} hidden={narrow && (view === 'sessions' || view === 'conversation') && panel === null}>{centre}</main>

      <div className="pmw-frame__rightbar" data-pmw-slot="rightbar">{rightbar}</div>

      <aside className="pmw-frame__dock" aria-label={t.conversation} data-pmw-slot="main:conversation" data-shown={!narrow || view === 'conversation' || undefined}>{conversation}</aside>

      <footer className="pmw-frame__status" aria-label={t.status}>
        <StatusItems />
      </footer>
      <div className="pmw-frame__bottom" data-pmw-slot="shell.bottom">{bottom}</div>
      <div className="pmw-frame__overlay" data-pmw-slot="shell.overlay">{overlays}</div>

      {!narrow && sideShown && <DragHandle side="side" left={ACTIVITY + geometry.side} onDrag={(start, dx) => actions.setSide(start + dx)} start={geometry.side} label={t.resize} />}
      {!narrow && info.rightbarShown && !info.rightbarFullscreen && geometry.track > 0 && <DragHandle side="rightbar" left={geometry.viewport - geometry.dock - geometry.track} onDrag={(start, dx) => actions.setRightbar(start - dx)} start={geometry.track} label={t.resize} />}
      {!narrow && <DragHandle side="dock" left={geometry.viewport - geometry.dock} onDrag={(start, dx) => actions.setDock(start - dx)} start={geometry.dock} label={t.resize} />}

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

function DragHandle({ side, left, start, label, onDrag }: { side: string, left: number, start: number, label: string, onDrag(start: number, dx: number): void }) {
  const origin = useRef<{ x: number, start: number } | null>(null)
  const down = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    origin.current = { x: event.clientX, start }
  }, [start])
  const move = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (origin.current) onDrag(origin.current.start, event.clientX - origin.current.x)
  }
  const up = () => {
    origin.current = null
  }
  return <div className="pmw-frame__handle" data-side={side} role="separator" aria-orientation="vertical" aria-label={label} style={{ left }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
}
