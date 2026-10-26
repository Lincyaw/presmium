import { useEffect, useMemo, useRef, useState } from 'react'
import { PmButton, PmIcon, PmIconButton, PmMenu, PmNotice, PmToolbar, PmToolbarButton } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchState } from '../context.tsx'
import { timeAgo } from '../messages.ts'
import { countWords, documentOutline } from '../outline.ts'
import { isAgentChanging } from '../workbench.ts'
import { ExportPanel } from './ExportPanel.tsx'
import { HistoryPanel } from './HistoryPanel.tsx'
import { PreviewPanel } from './PreviewPanel.tsx'
import { PageRenameDialog } from './PageRenameDialog.tsx'
import { PageDeleteDialog } from './PageDeleteDialog.tsx'
import { SourceDocumentPanel } from './SourceDocumentPanel.tsx'

export type DocumentAside = 'comments' | 'history' | 'export'

const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, [contenteditable]') !== null)

// The navigation pane starts open where there is room for it beside the page.
const ROOMY = '(min-width: 1280px)'

/**
 * The open document as an editor shows it: the command bar, what needs the author's attention, the navigation pane,
 * the page (or the slide) on its canvas, the comments or the history, and the status bar. `framed`: the layout around
 * it shows the document's title and the way back to the documents, so the command bar does not.
 */
export function DocumentView({ active = true, framed = false }: { active?: boolean, framed?: boolean }) {
  const workbench = useWorkbench()
  const [aside, setAside] = useState<DocumentAside | null>(null)
  const [presenting, setPresenting] = useState(false)
  const [changingView, setChangingView] = useState(false), [viewFailure, setViewFailure] = useState<string>()
  const transition = useRef(0), exiting = useRef<Promise<void>>()
  const [commentsPortal, setCommentsPortal] = useState<HTMLDivElement | null>(null)
  const t = useMessages()
  const document = useWorkbenchState(state => state.document)
  const view = useWorkbenchState(state => state.webView)
  const currentScope = useRef({ document, active })
  currentScope.current = { document, active }
  const [navigation, setNavigation] = useState(() => typeof matchMedia === 'function' && matchMedia(ROOMY).matches)
  const exitPresent = (): Promise<void> => {
    if (exiting.current) return exiting.current
    const generation = ++transition.current, identity = workbench.getState().authoring?.identity
    setChangingView(true); setViewFailure(undefined)
    const current = () => generation === transition.current && currentScope.current.active && currentScope.current.document === document && workbench.getState().authoring?.identity === identity
    const work = Promise.resolve().then(async () => {
      try {
        // The child flushes its latest position before acknowledging this pause.
        await workbench.pausePlayback()
        if (!current()) return
        setPresenting(false)
        workbench.setMode('editing')
        workbench.setWebView('document')
      } catch { if (current()) setViewFailure(t.presentationReturnFailed) }
      finally { if (current()) setChangingView(false); if (exiting.current === work) exiting.current = undefined }
    })
    exiting.current = work
    return work
  }
  useEffect(() => {
    transition.current++; exiting.current = undefined
    setPresenting(false)
    setChangingView(false); setViewFailure(undefined)
    setAside(null)
  }, [document])
  useEffect(() => { if (!active) { transition.current++; exiting.current = undefined; setChangingView(false) } }, [active])
  useEffect(() => () => { transition.current++ }, [])
  useEffect(() => {
    if (presenting && view === 'document') void exitPresent()
  }, [view, presenting])
  useEffect(() => {
    if (!active) return
    const keys = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isTyping(event.target) || !(event.ctrlKey || event.metaKey) || event.altKey) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        void workbench.undo()
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault()
        void workbench.redo()
      }
    }
    window.addEventListener('keydown', keys)
    return () => window.removeEventListener('keydown', keys)
  }, [active, workbench])
  return (
    <div className="pmw-document" data-workspace={presenting ? 'presentation' : 'content'} data-presenting={presenting || undefined} data-aside={aside ?? undefined} data-navigation={navigation || undefined}>
      {presenting ? <PmToolbar className="pmw-toolbar pmw-toolbar--present" label={t.presentationPreview}><PmToolbarButton asChild><PmIconButton small icon="close" label={t.exitPresentation} shortcut="Escape" loading={changingView} onClick={() => void exitPresent()} /></PmToolbarButton></PmToolbar> : <DocumentToolbar framed={framed} aside={aside} navigation={navigation} onPresent={() => {
        const source = workbench.getState().authoring
        if (!source?.content || source.loading || source.dirty || source.saving || source.restored || source.error || source.composing || isAgentChanging(workbench.getState())) return
        transition.current++; setViewFailure(undefined)
        workbench.setMode('viewing')
        workbench.setWebView('present')
        setPresenting(true)
      }} onNavigation={() => { setNavigation(shown => !shown); if (!navigation && matchMedia('(max-width: 1279px)').matches) setAside(null) }} onAside={next => { setAside(current => (current === next ? null : next)); if (matchMedia('(max-width: 1279px)').matches) setNavigation(false) }} />}
      {viewFailure && <PmNotice tone="danger">{viewFailure}</PmNotice>}
      <DocumentNotices />
      <div className="pmw-document__body" role="region" aria-label={presenting ? t.presentationPreview : t.documentEditor}>
        {!presenting && navigation && <NavigationPane onClose={() => setNavigation(false)} onSelect={() => { if (matchMedia('(max-width: 1279px)').matches) setNavigation(false) }} />}
        <div className="pmw-document__main"><div className="pmw-document__source" hidden={presenting}><SourceDocumentPanel commentsPortal={commentsPortal} /></div>{presenting && <><PreviewPanel active={active} /><StepTimeline /></>}</div>
        {!presenting && aside && (
          <aside className="pmw-document__aside pm-ui-block-editor" aria-label={aside}>
            {aside === 'comments' ? <section className="pmw-pane"><header className="pmw-pane__header"><h2 className="pmw-pane__title">{t.comments}</h2><PmIconButton small icon="close" label={t.close} onClick={() => setAside(null)} /></header><div ref={setCommentsPortal} /></section> : aside === 'export' ? <ExportPanel documentOnly onClose={() => setAside(null)} /> : <HistoryPanel onClose={() => setAside(null)} />}
          </aside>
        )}
      </div>
      {!presenting && <StatusBar />}
    </div>
  )
}

/** All states remain reachable, including initial state and the final steps of long animations. */
function StepTimeline() {
  const t = useMessages()
  const workbench = useWorkbench()
  const doc = useWorkbenchState(state => state.ir?.doc)
  const position = useWorkbenchState(state => state.position)
  const index = Math.max(0, doc?.sections.findIndex(section => section.id === position?.section) ?? 0)
  const section = doc?.sections[index]
  if (!section || !doc) return null
  const step = Math.min(position?.step ?? 0, section.steps)
  const previous = () => {
    if (step > 0) workbench.goToStep(section.id, step - 1)
    else if (index > 0) { const previous = doc.sections[index - 1]!; workbench.goToStep(previous.id, previous.steps) }
  }
  const next = () => {
    if (step < section.steps) workbench.goToStep(section.id, step + 1)
    else if (index < doc.sections.length - 1) workbench.goToStep(doc.sections[index + 1]!.id, 0)
  }
  return <section className="pmw-step-timeline" aria-label={t.stepTimeline}>
    <div className="pmw-step-timeline__heading"><span>{section.title}</span><span>{t.stepLabel(step + 1, section.steps + 1)}</span></div>
    <PmToolbar className="pmw-step-timeline__steps" label={t.stepTimeline}>
      <PmToolbarButton asChild><PmIconButton small icon="chevron-left" label={t.previousStep} disabled={index === 0 && step === 0} onClick={previous} /></PmToolbarButton>
      {Array.from({ length: section.steps + 1 }, (_, value) => <PmToolbarButton key={value} asChild><PmButton small aria-label={t.narrationStep(index + 1, value + 1)} aria-pressed={value === step} onClick={() => workbench.goToStep(section.id, value)}>{value + 1}</PmButton></PmToolbarButton>)}
      <PmToolbarButton asChild><PmIconButton small icon="chevron-right" label={t.nextStep} disabled={index === doc.sections.length - 1 && step === section.steps} onClick={next} /></PmToolbarButton>
    </PmToolbar>
  </section>
}

/** The document's sections, or its slides: where the preview is, and a click to go to another. */
function NavigationPane({ onClose, onSelect }: { onClose(): void, onSelect(): void }) {
  const t = useMessages()
  const workbench = useWorkbench()
  const doc = useWorkbenchState(state => state.authoring?.content)
  const slides = useWorkbenchState(state => state.previewRenderer === 'slides' || state.webView !== 'document')
  const current = useWorkbenchState(state => state.position?.section)
  const editing = useWorkbenchState(state => state.mode === 'editing')
  const creating = useWorkbenchState(state => Boolean(state.isCreatingPage))
  const pageBusy = useWorkbenchState(state => Boolean(state.isEditingPage))
  const failure = useWorkbenchState(state => state.pageEditFailure)
  const document = useWorkbenchState(state => state.document)
  const [renaming, setRenaming] = useState<{ id: string, title: string, trigger?: HTMLButtonElement }>()
  const [deleting, setDeleting] = useState<{ id: string, title: string, trigger?: HTMLButtonElement }>()
  const canDelete = useWorkbenchState(state => Boolean(state.authoring?.content))
  const menuTriggers = useRef(new Map<string, HTMLButtonElement>())
  useEffect(() => { setRenaming(undefined); setDeleting(undefined) }, [document])
  const canCreate = useWorkbenchState(state => Boolean(state.authoring?.content) && !state.authoring?.loading && !state.authoring?.composing && !isAgentChanging(state))
  const pages = editing || slides
  const items = useMemo(() => documentOutline(doc), [doc])
  const top = Math.min(...items.map(item => Math.max(1, item.depth)))
  return (
    <nav className="pmw-navigation" aria-label={t.navigation}>
      <header className="pmw-pane__header">
        <h2 className="pmw-pane__title">{editing ? t.pages : slides ? t.renderers.slides : t.navigation}</h2>
        {editing && <PmIconButton icon="plus" label={t.newPage} small loading={creating} disabled={!canCreate || pageBusy || !items.length} onClick={() => workbench.createPage()} />}
        <PmIconButton icon="close" label={t.closeNavigation} small onClick={onClose} />
      </header>
      {failure && !renaming && !deleting && <PmNotice tone="danger">{failure}</PmNotice>}
      {items.length === 0
        ? <p className="pmw-muted pmw-navigation__empty">{t.noSections}</p>
        : (
            <ol className="pmw-navigation__list" data-kind={pages ? 'slides' : 'headings'}>
              {items.map((item, index) => {
                const capability = workbench.pageEditCapability(item.id)
                const previousPeer = index > 0
                const nextPeer = index < items.length - 1
                const moveDescription = capability.reason ?? (!previousPeer || !nextPeer ? t.pageEditHierarchy : undefined)
                return (
                <li key={item.id} className="pmw-navigation__row">
                  <button
                    type="button"
                    className="pmw-navigation__item"
                    data-depth={slides ? undefined : Math.min(Math.max(1, item.depth) - top, 3)}
                    aria-current={item.id === current ? 'location' : undefined}
                    onClick={() => { workbench.goToSection(item.id); onSelect() }}
                  >
                    {pages && <span className="pmw-navigation__number">{item.number}</span>}
                    <span className="pmw-navigation__title">{item.title}</span>
                  </button>
                  {editing && <PmMenu label={t.pageMore(item.title)} description={moveDescription} triggerRef={node => { if (node) menuTriggers.current.set(item.id, node); else menuTriggers.current.delete(item.id) }} items={[
                    { id: 'rename', label: t.rename, icon: 'edit', disabled: !capability.rename || !canCreate || pageBusy || creating },
                    { id: 'up', label: t.movePageUp, disabled: !capability.move || !canCreate || pageBusy || creating || !previousPeer },
                    { id: 'down', label: t.movePageDown, disabled: !capability.move || !canCreate || pageBusy || creating || !nextPeer },
                    ...(canDelete ? [{ id: 'delete', label: t.pageDelete, icon: 'trash' as const, danger: true, separator: true, disabled: !canCreate || pageBusy || creating }] : []),
                  ]} onSelect={id => {
                    workbench.clearPageEditFailure()
                    if (id === 'rename') setRenaming({ id: item.id, title: item.title, trigger: menuTriggers.current.get(item.id) })
                    else if (id === 'delete') setDeleting({ id: item.id, title: item.title, trigger: menuTriggers.current.get(item.id) })
                    else if (id === 'up' && index > 0) void workbench.movePage(item.id, items[index - 1]!.id)
                    else if (id === 'down') void workbench.movePage(item.id, items[index + 2]?.id ?? null)
                  }} />}
                </li>
              )})}
            </ol>
          )}
      {renaming && <PageRenameDialog section={renaming.id} title={renaming.title} trigger={renaming.trigger} onClose={() => { setRenaming(undefined); workbench.clearPageEditFailure() }} />}
      {deleting && <PageDeleteDialog section={deleting.id} title={deleting.title} trigger={deleting.trigger} onClose={() => { setDeleting(undefined); workbench.clearPageEditFailure() }} />}
    </nav>
  )
}

/** Where the author is, how long the document is, and what the mode lets them do. */
function StatusBar() {
  const t = useMessages()
  const doc = useWorkbenchState(state => state.authoring?.content)
  const slides = useWorkbenchState(state => state.previewRenderer === 'slides' || state.webView !== 'document')
  const section = useWorkbenchState(state => state.position?.section)
  const mode = useWorkbenchState(state => state.mode)
  const words = useMemo(() => countWords(doc), [doc])
  const total = doc?.sectionOrder.length ?? 0
  const at = section === undefined ? -1 : doc?.sectionOrder.indexOf(section) ?? -1
  return (
    <footer className="pmw-statusbar" aria-label={t.statusBar}>
      {at >= 0 && <span className="pmw-statusbar__item">{slides ? t.slideOf(at + 1, total) : t.sectionOf(at + 1, total)}</span>}
      {doc && <span className="pmw-statusbar__item">{t.words(words)}</span>}
      <span className="pmw-spacer" />

      <span className="pmw-statusbar__item pmw-statusbar__mode" data-mode={mode}><PmIcon name={mode === 'editing' ? 'edit' : 'eye'} />{mode === 'editing' ? t.editingStatus : t.viewingStatus}</span>
    </footer>
  )
}

function DocumentToolbar({ framed, aside, navigation, onPresent, onNavigation, onAside }: { framed: boolean, aside: DocumentAside | null, navigation: boolean, onPresent(): void, onNavigation(): void, onAside(aside: DocumentAside): void }) {
  const t = useMessages()
  const workbench = useWorkbench()
  const title = useWorkbenchState(state => state.authoring?.content?.metadata.title ?? state.documents?.documents.find(doc => doc.dir === state.document)?.title ?? '')
  const history = useWorkbenchState(state => state.history)
  const editorHistory = useWorkbenchState(state => state.editorHistory)
  const dirty = useWorkbenchState(state => Boolean(state.authoring?.dirty))
  const busy = useWorkbenchState(state => state.isHistoryBusy || state.isHistoryPreparing || Boolean(state.isCreatingPage) || Boolean(state.isEditingPage || state.authoring?.composing) || isAgentChanging(state))
  const blocked = useWorkbenchState(state => Boolean(!state.authoring?.content || state.authoring.loading || state.authoring.dirty || state.authoring.saving || state.authoring.restored || state.authoring.error || state.authoring.composing || state.isEditingPage || state.isCreatingPage || isAgentChanging(state)))
  const openComments = useWorkbenchState(state => Object.values(state.authoring?.content?.comments ?? {}).filter(comment => !comment.resolved && !comment.deletedAt).length)
  return (
    <PmToolbar className="pmw-toolbar" label={t.commands}>
      {!framed && <>
        <PmToolbarButton asChild><PmIconButton icon="arrow-left" label={t.back} small onClick={() => workbench.closeDocument()} /></PmToolbarButton>
        <h1 className="pmw-toolbar__title" title={title}>{title}</h1>
      </>}
      <PmToolbarButton asChild><PmIconButton small icon="navigation" label={t.navigationPane} aria-pressed={navigation} onClick={onNavigation} /></PmToolbarButton>
      <PmToolbarButton asChild><PmIconButton small icon="undo" label={t.undo} shortcut="⌘/Ctrl+Z" disabled={!editorHistory?.undo && !history?.undo && !dirty || busy} onClick={() => void workbench.undo()} /></PmToolbarButton>
      <PmToolbarButton asChild><PmIconButton small icon="redo" label={t.redo} shortcut="⌘/Ctrl+Shift+Z" disabled={!editorHistory?.redo && (dirty || !history?.redo) || busy} onClick={() => void workbench.redo()} /></PmToolbarButton>
      <SaveStatus />
      <span className="pmw-spacer" />
      <PmToolbarButton asChild><PmIconButton small icon="comment" label={openComments ? `${t.comments} (${openComments})` : t.comments} aria-pressed={aside === 'comments'} onClick={() => onAside('comments')} /></PmToolbarButton>
      <PmToolbarButton asChild><PmIconButton small icon="versions" label={t.versionHistory} aria-pressed={aside === 'history'} onClick={() => onAside('history')} /></PmToolbarButton>
      <span className="pmw-toolbar__divider" aria-hidden="true" />
      <PmToolbarButton asChild><PmIconButton small icon="slides" label={t.presentationPreview} hint={blocked ? t.presentationPending : t.presentHint} disabled={blocked} onClick={onPresent} /></PmToolbarButton>
      <PmToolbarButton asChild><PmIconButton small icon="export" label={t.exportPane} aria-pressed={aside === 'export'} onClick={() => onAside('export')} /></PmToolbarButton>
    </PmToolbar>
  )
}

function SaveStatus() {
  const t = useMessages()
  const save = useWorkbenchState(state => state.save)
  const dirty = useWorkbenchState(state => Boolean(state.authoring?.dirty))
  const locale = useWorkbenchState(state => state.locale)
  const [, tick] = useState(0)
  useEffect(() => {
    if (save.kind !== 'saved' || dirty) return
    const timer = setInterval(() => tick(n => n + 1), 30_000)
    return () => clearInterval(timer)
  }, [save, dirty])
  const text = dirty ? t.unsaved : save.kind === 'saving'
    ? t.saving
    : save.kind === 'saved' ? t.savedAt(timeAgo(save.at, locale)) : save.kind === 'idle' ? t.saved : ''
  return <span className="pmw-toolbar__status" role="status" aria-live="polite" data-save={dirty ? 'dirty' : save.kind}>{text}</span>
}

/** What needs the author's attention: the AI's change, an edit to hand over, a failed save, content that did not display. */
function DocumentNotices() {
  const t = useMessages()
  const workbench = useWorkbench()
  const review = useWorkbenchState(state => state.review)
  const save = useWorkbenchState(state => state.save)
  const sourceError = useWorkbenchState(state => state.authoring?.error)
  const historyFailure = useWorkbenchState(state => state.historyFailure)
  const focusFailure = useWorkbenchState(state => state.focusFailure)
  const askFailure = useWorkbenchState(state => (state.pointer ? undefined : state.askFailure))
  return (
    <div className="pmw-notices">
      {review?.running && <PmNotice tone="accent"><span className="pmw-busy" aria-hidden="true" />{t.agentWorking}</PmNotice>}
      {review && !review.running && review.changes.length > 0 && (
        <PmNotice tone="accent">
          <span>{t.agentWaiting(review.changes.length)}</span>
          <span className="pmw-notice__actions">
            <PmButton small onClick={() => void workbench.rejectReview()}>{t.reject}</PmButton>
            <PmButton small variant="primary" onClick={() => void workbench.acceptReview()}>{t.accept}</PmButton>
          </span>
        </PmNotice>
      )}
      {save.kind === 'locked' && <PmNotice tone="warn">{t.saveLocked}</PmNotice>}
      {save.kind === 'failed' && !sourceError && <PmNotice tone="danger">{t.saveFailed(save.message)}</PmNotice>}
      {historyFailure && <PmNotice tone="danger">{t.historyFailed(historyFailure)}</PmNotice>}
      {focusFailure && <PmNotice tone="warn">{t.focusFailed(focusFailure)}</PmNotice>}
      {askFailure && <PmNotice tone="danger">{t.askFailed(askFailure)}</PmNotice>}
      <ProblemsNotice />
    </div>
  )
}

/** Content that did not display, said plainly, with the AI to fix it and the details for whoever wants them. */
function ProblemsNotice() {
  const t = useMessages()
  const workbench = useWorkbench()
  const snapshot = useWorkbenchState(state => state.diagnostics)
  const unavailable = useWorkbenchState(state => state.isDiagnosticsUnavailable)
  const canRepair = useWorkbenchState(state => state.canRepairDiagnostics)
  const repairing = useWorkbenchState(state => state.isRepairingDiagnostics)
  const repairFailure = useWorkbenchState(state => state.diagnosticsRepairFailure)
  const problems = (snapshot?.diagnostics ?? []).filter(diagnostic => diagnostic.severity === 'error' && !diagnostic.checkId.startsWith('presmium.workbench.'))
  if (unavailable) return <PmNotice tone="warn"><span>{t.diagnosticsUnavailable}</span><PmButton small onClick={() => workbench.retryDiagnostics()}>{t.retry}</PmButton></PmNotice>
  if (problems.length === 0) return repairFailure ? <PmNotice tone="danger">{t.fixFailed(repairFailure)}</PmNotice> : null
  return (
    <PmNotice tone="warn">
      <div className="pmw-problems">
        <div className="pmw-problems__summary">
          <span>{t.problems(problems.length)}</span>
          {canRepair && <PmButton small variant="accent" icon="sparkle" disabled={repairing} onClick={() => void workbench.requestRepairDiagnostics()}>{repairing ? t.fixing : t.fixWithAi}</PmButton>}
        </div>
        {repairFailure && <p className="pmw-problems__failure">{t.fixFailed(repairFailure)}</p>}
        <details className="pmw-problems__details">
          <summary>{t.details}</summary>
          <ul>{problems.map(problem => <li key={problem.id}>{problem.message}</li>)}</ul>
        </details>
      </div>
    </PmNotice>
  )
}
