import { useEffect, useMemo, useRef, useState } from 'react'
import { PmBadge, PmButton, PmIcon, PmIconButton, PmNotice, PmTabs, PmToolbar, PmToolbarButton } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchState } from '../context.tsx'
import { timeAgo } from '../messages.ts'
import { countWords, documentOutline } from '../outline.ts'
import { isAgentChanging } from '../workbench.ts'
import { CommentsPanel } from './CommentsPanel.tsx'
import { ExportPanel } from './ExportPanel.tsx'
import { HistoryPanel } from './HistoryPanel.tsx'
import { PreviewPanel } from './PreviewPanel.tsx'
import { NarrationPanel } from './NarrationPanel.tsx'

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
  const [workspace, setWorkspace] = useState<'content' | 'sequence'>('content')
  const [presenting, setPresenting] = useState(false)
  const beforePresent = useRef<'content' | 'sequence'>('content')
  const t = useMessages()
  const narration = useWorkbenchState(state => state.narration)
  const view = useWorkbenchState(state => state.webView)
  const [navigation, setNavigation] = useState(() => typeof matchMedia === 'function' && matchMedia(ROOMY).matches)
  const chooseWorkspace = (next: 'content' | 'sequence') => {
    setWorkspace(next)
    setPresenting(false)
    workbench.setMode(next === 'content' ? 'editing' : 'viewing')
    workbench.setWebView(next === 'content' ? 'document' : 'present')
    if (next === 'content') workbench.closeNarration()
  }
  const exitPresent = () => chooseWorkspace(beforePresent.current)
  useEffect(() => {
    if (narration && workspace === 'content' && !presenting) chooseWorkspace('sequence')
  }, [narration?.section, narration?.step])
  useEffect(() => {
    if (presenting && view === 'document') exitPresent()
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
    <div className="pmw-document" data-workspace={workspace} data-presenting={presenting || undefined} data-aside={aside ?? undefined} data-navigation={navigation || undefined}>
      {presenting ? <PmToolbar className="pmw-toolbar pmw-toolbar--present" label={t.present}><PmToolbarButton asChild><PmIconButton small icon="close" label={t.exitPresentation} shortcut="Escape" onClick={exitPresent} /></PmToolbarButton></PmToolbar> : <DocumentToolbar framed={framed} aside={aside} navigation={navigation} workspace={workspace} onWorkspace={chooseWorkspace} onPresent={() => {
        beforePresent.current = workspace
        workbench.setMode('viewing')
        workbench.setWebView('present')
        setPresenting(true)
      }} onNavigation={() => { setNavigation(shown => !shown); if (!navigation && matchMedia('(max-width: 1279px)').matches) { setAside(null); workbench.closeNarration() } }} onAside={next => { workbench.closeNarration(); setAside(current => (current === next ? null : next)); if (matchMedia('(max-width: 1279px)').matches) setNavigation(false) }} />}
      <DocumentNotices />
      <div className="pmw-document__body" role="tabpanel" id={`pmw-workspace-${workspace}-panel`} aria-labelledby={`pmw-workspace-${workspace}-tab`}>
        {!presenting && navigation && <NavigationPane onClose={() => setNavigation(false)} onSelect={() => { if (matchMedia('(max-width: 1279px)').matches) setNavigation(false) }} />}
        <div className="pmw-document__main"><PreviewPanel active={active} />{workspace === 'sequence' && !presenting && <StepTimeline />}</div>
        {!presenting && (narration ? <aside className="pmw-document__aside"><NarrationPanel /></aside> : aside && (
          <aside className="pmw-document__aside" aria-label={aside}>
            {aside === 'comments' ? <CommentsPanel onClose={() => setAside(null)} /> : aside === 'export' ? <ExportPanel onClose={() => setAside(null)} /> : <HistoryPanel onClose={() => setAside(null)} />}
          </aside>
        ))}
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
  const doc = useWorkbenchState(state => state.ir?.doc)
  const slides = useWorkbenchState(state => state.previewRenderer === 'slides' || state.webView !== 'document')
  const current = useWorkbenchState(state => state.position?.section)
  const editing = useWorkbenchState(state => state.mode === 'editing')
  const creating = useWorkbenchState(state => Boolean(state.isCreatingPage))
  const canCreate = useWorkbenchState(state => state.previewRenderer === 'web' && state.webView === 'document' && Boolean(state.previewIrRevision) && !state.editing && !isAgentChanging(state))
  const pages = editing || slides
  const items = useMemo(() => documentOutline(doc), [doc])
  const top = Math.min(...items.map(item => item.depth))
  return (
    <nav className="pmw-navigation" aria-label={t.navigation}>
      <header className="pmw-pane__header">
        <h2 className="pmw-pane__title">{editing ? t.pages : slides ? t.renderers.slides : t.navigation}</h2>
        {editing && <PmIconButton icon="plus" label={t.newPage} small disabled={!canCreate || creating || !items.length} onClick={() => workbench.createPage()} />}
        <PmIconButton icon="close" label={t.closeNavigation} small onClick={onClose} />
      </header>
      {items.length === 0
        ? <p className="pmw-muted pmw-navigation__empty">{t.noSections}</p>
        : (
            <ol className="pmw-navigation__list" data-kind={pages ? 'slides' : 'headings'}>
              {items.map(item => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="pmw-navigation__item"
                    data-depth={pages ? undefined : Math.min(item.depth - top, 3)}
                    aria-current={item.id === current ? 'location' : undefined}
                    onClick={() => { workbench.goToSection(item.id); onSelect() }}
                  >
                    {pages && <span className="pmw-navigation__number">{item.number}</span>}
                    <span className="pmw-navigation__title">{item.title}</span>
                  </button>
                </li>
              ))}
            </ol>
          )}
    </nav>
  )
}

/** Where the author is, how long the document is, and what the mode lets them do. */
function StatusBar() {
  const t = useMessages()
  const doc = useWorkbenchState(state => state.ir?.doc)
  const slides = useWorkbenchState(state => state.previewRenderer === 'slides' || state.webView !== 'document')
  const section = useWorkbenchState(state => state.position?.section)
  const mode = useWorkbenchState(state => state.mode)
  const words = useMemo(() => countWords(doc), [doc])
  const total = doc?.sections.length ?? 0
  const at = section === undefined ? -1 : doc?.sections.findIndex(s => s.id === section) ?? -1
  return (
    <footer className="pmw-statusbar" aria-label={t.statusBar}>
      {at >= 0 && <span className="pmw-statusbar__item">{slides ? t.slideOf(at + 1, total) : t.sectionOf(at + 1, total)}</span>}
      {doc && <span className="pmw-statusbar__item">{t.words(words)}</span>}
      <span className="pmw-spacer" />

      <span className="pmw-statusbar__item pmw-statusbar__mode" data-mode={mode}><PmIcon name={mode === 'editing' ? 'edit' : 'eye'} />{mode === 'editing' ? t.editingStatus : t.viewingStatus}</span>
    </footer>
  )
}

function DocumentToolbar({ framed, aside, navigation, workspace, onWorkspace, onPresent, onNavigation, onAside }: { framed: boolean, aside: DocumentAside | null, navigation: boolean, workspace: 'content' | 'sequence', onWorkspace(value: 'content' | 'sequence'): void, onPresent(): void, onNavigation(): void, onAside(aside: DocumentAside): void }) {
  const t = useMessages()
  const workbench = useWorkbench()
  const narration = useWorkbenchState(state => state.narration)
  const title = useWorkbenchState(state => state.documents?.documents.find(doc => doc.dir === state.document)?.title ?? state.ir?.doc.meta.title ?? '')
  const history = useWorkbenchState(state => state.history)
  const busy = useWorkbenchState(state => state.isHistoryBusy || Boolean(state.editing) || Boolean(state.isCreatingPage) || isAgentChanging(state))
  const blocked = useWorkbenchState(state => Boolean(state.bodyDirty || state.narrationDirty || state.sourceDirty || state.save.kind === 'saving' || state.save.kind === 'failed' || !state.previewIrRevision || state.previewIrRevision !== state.ir?.revision))
  const openComments = useWorkbenchState(state => state.comments.filter(comment => comment.status === 'open').length)
  return (
    <PmToolbar className="pmw-toolbar" label={t.commands}>
      {!framed && <>
        <PmToolbarButton asChild><PmIconButton icon="arrow-left" label={t.back} small onClick={() => workbench.closeDocument()} /></PmToolbarButton>
        <h1 className="pmw-toolbar__title" title={title}>{title}</h1>
      </>}
      <PmTabs label={t.workspaceLabel} value={workspace} idPrefix="pmw-workspace" iconOnly tabs={[{ value: 'content', label: t.contentWorkspace, icon: 'document' }, { value: 'sequence', label: t.sequenceWorkspace, icon: 'arrange' }]} onValueChange={value => onWorkspace(value as 'content' | 'sequence')} />
      <span className="pmw-toolbar__divider" aria-hidden="true" />
      <PmToolbarButton asChild><PmIconButton small icon="navigation" label={t.navigationPane} aria-pressed={navigation} onClick={onNavigation} /></PmToolbarButton>
      <PmToolbarButton asChild><PmIconButton small icon="undo" label={t.undo} shortcut="⌘/Ctrl+Z" disabled={!history?.undo || busy} onClick={() => void workbench.undo()} /></PmToolbarButton>
      <PmToolbarButton asChild><PmIconButton small icon="redo" label={t.redo} shortcut="⌘/Ctrl+Shift+Z" disabled={!history?.redo || busy} onClick={() => void workbench.redo()} /></PmToolbarButton>
      <SaveStatus />
      <span className="pmw-spacer" />
      <PmToolbarButton asChild><PmIconButton small icon="edit-text" label={t.narration} aria-pressed={Boolean(narration)} onClick={() => {
        if (narration) workbench.closeNarration()
        else { const at = workbench.state.position; const section = at?.section ?? workbench.state.ir?.doc.sections[0]?.id; if (section) { onWorkspace('sequence'); workbench.selectNarration(section, at?.step ?? 0) } }
      }} /></PmToolbarButton>
      <PmToolbarButton asChild><PmIconButton small icon="comment" label={openComments ? `${t.comments} (${openComments})` : t.comments} aria-pressed={aside === 'comments'} onClick={() => onAside('comments')} /></PmToolbarButton>
      <PmToolbarButton asChild><PmIconButton small icon="versions" label={t.versionHistory} aria-pressed={aside === 'history'} onClick={() => onAside('history')} /></PmToolbarButton>
      <span className="pmw-toolbar__divider" aria-hidden="true" />
      <PmToolbarButton asChild><PmIconButton small icon="slides" label={t.present} hint={blocked ? t.presentationPending : t.presentHint} disabled={blocked} onClick={onPresent} /></PmToolbarButton>
      <PmToolbarButton asChild><PmIconButton small icon="export" label={t.exportPane} aria-pressed={aside === 'export'} onClick={() => onAside('export')} /></PmToolbarButton>
    </PmToolbar>
  )
}

function SaveStatus() {
  const t = useMessages()
  const save = useWorkbenchState(state => state.save)
  const dirty = useWorkbenchState(state => Boolean(state.bodyDirty || state.sourceDirty || state.narrationDirty))
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
  const fallback = useWorkbenchState(state => state.editFallback)
  const save = useWorkbenchState(state => state.save)
  const historyFailure = useWorkbenchState(state => state.historyFailure)
  const focusFailure = useWorkbenchState(state => state.focusFailure)
  const asking = useWorkbenchState(state => state.isAsking)
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
      {fallback && (
        <PmNotice tone="warn">
          <span>{t.formattedEdit}</span>
          <span className="pmw-notice__actions">
            <PmButton small onClick={() => workbench.dismissEditFallback()}>{t.cancel}</PmButton>
            <PmButton small variant="accent" icon="sparkle" disabled={asking} onClick={() => {
              void workbench.askAgent(t.rewriteEditRequest(fallback.before, fallback.after), [{ id: 'selection', from: workbench.state.previewRenderer, section: fallback.target.section, ...fallback.target.block ? { block: fallback.target.block } : {} }])
                .then(asked => { if (asked) workbench.dismissEditFallback() })
            }}>{t.rewriteEdit}</PmButton>
          </span>
        </PmNotice>
      )}
      {save.kind === 'locked' && <PmNotice tone="warn">{t.saveLocked}</PmNotice>}
      {save.kind === 'failed' && <PmNotice tone="danger">{t.saveFailed(save.message)}</PmNotice>}
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
  const problems = (snapshot?.diagnostics ?? []).filter(diagnostic => diagnostic.severity === 'error')
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
