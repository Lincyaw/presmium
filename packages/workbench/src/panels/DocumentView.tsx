import { useEffect, useMemo, useState } from 'react'
import type { IconName } from '@lincyaw/design'
import { PmBadge, PmButton, PmIcon, PmIconButton, PmNotice } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchState } from '../context.tsx'
import { timeAgo } from '../messages.ts'
import { countWords, documentOutline } from '../outline.ts'
import { isAgentChanging } from '../workbench.ts'
import type { WorkbenchMode } from '../workbench.ts'
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
  const narration = useWorkbenchState(state => state.narration)
  const [navigation, setNavigation] = useState(() => typeof matchMedia === 'function' && matchMedia(ROOMY).matches)
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
    <div className="pmw-document" data-aside={aside ?? undefined} data-navigation={navigation || undefined}>
      <DocumentToolbar framed={framed} aside={aside} navigation={navigation} onNavigation={() => setNavigation(shown => !shown)} onAside={next => setAside(current => (current === next ? null : next))} />
      <DocumentNotices />
      <div className="pmw-document__body">
        {navigation && <NavigationPane onClose={() => setNavigation(false)} />}
        <PreviewPanel active={active} />
        {narration ? <aside className="pmw-document__aside"><NarrationPanel /></aside> : aside && (
          <aside className="pmw-document__aside" aria-label={aside}>
            {aside === 'comments' ? <CommentsPanel onClose={() => setAside(null)} /> : aside === 'export' ? <ExportPanel onClose={() => setAside(null)} /> : <HistoryPanel onClose={() => setAside(null)} />}
          </aside>
        )}
      </div>
      <StatusBar />
    </div>
  )
}

/** The document's sections, or its slides: where the preview is, and a click to go to another. */
function NavigationPane({ onClose }: { onClose(): void }) {
  const t = useMessages()
  const workbench = useWorkbench()
  const doc = useWorkbenchState(state => state.ir?.doc)
  const slides = useWorkbenchState(state => state.previewRenderer === 'slides' || state.webView !== 'document')
  const current = useWorkbenchState(state => state.position?.section)
  const items = useMemo(() => documentOutline(doc), [doc])
  const top = Math.min(...items.map(item => item.depth))
  return (
    <nav className="pmw-navigation" aria-label={t.navigation}>
      <header className="pmw-pane__header">
        <h2 className="pmw-pane__title">{slides ? t.renderers.slides : t.navigation}</h2>
        <PmIconButton icon="close" label={t.closeNavigation} small onClick={onClose} />
      </header>
      {items.length === 0
        ? <p className="pmw-muted pmw-navigation__empty">{t.noSections}</p>
        : (
            <ol className="pmw-navigation__list" data-kind={slides ? 'slides' : 'headings'}>
              {items.map(item => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="pmw-navigation__item"
                    data-depth={slides ? undefined : Math.min(item.depth - top, 3)}
                    aria-current={item.id === current ? 'location' : undefined}
                    onClick={() => workbench.goToSection(item.id)}
                  >
                    {slides && <span className="pmw-navigation__number">{item.number}</span>}
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

function DocumentToolbar({ framed, aside, navigation, onNavigation, onAside }: { framed: boolean, aside: DocumentAside | null, navigation: boolean, onNavigation(): void, onAside(aside: DocumentAside): void }) {
  const t = useMessages()
  const workbench = useWorkbench()
  const narration = useWorkbenchState(state => state.narration)
  const narrationDirty = useWorkbenchState(state => state.narrationDirty)
  const title = useWorkbenchState(state => state.documents?.documents.find(doc => doc.dir === state.document)?.title ?? state.ir?.doc.meta.title ?? '')
  const history = useWorkbenchState(state => state.history)
  const busy = useWorkbenchState(state => state.isHistoryBusy || Boolean(state.editing) || isAgentChanging(state))
  const renderer = useWorkbenchState(state => state.previewRenderer)
  const mode = useWorkbenchState(state => state.mode)
  const openComments = useWorkbenchState(state => state.comments.filter(comment => comment.status === 'open').length)
  // Builds and exports being made, the author's or the AI's.
  const making = useWorkbenchState(state => state.jobs?.jobs.filter(job => job.state === 'queued' || job.state === 'running').length ?? 0)
  const asking = useWorkbenchState(state => state.isAsking)
  const summaryOf = (id: string | undefined) => {
    const revision = id ? history?.revisions.find(r => r.id.startsWith(id) || id.startsWith(r.id)) : undefined
    return revision?.message.split('\n')[0] ?? ''
  }
  const undoLabel = history?.undo ? t.undoWhat(summaryOf(history.undo)) : t.nothingToUndo
  const redoTarget = history?.redo && history.revisions.find(r => r.id === history.redo)?.reverts
  const redoLabel = history?.redo ? t.redoWhat(summaryOf(redoTarget ?? history.redo)) : t.nothingToRedo
  const webView = useWorkbenchState(state => state.webView)
  // Reading and presenting share the same viewer; narration is a playback control, and video is an export.
  const views: { id: string, icon: IconName, label: string, hint: string, pressed: boolean, show(): void }[] = [
    { id: 'document', icon: 'document', label: t.renderers.web, hint: t.renderers.web, pressed: renderer === 'web' && webView === 'document', show: () => workbench.setWebView('document') },
    { id: 'present', icon: 'play', label: t.present, hint: t.presentHint, pressed: renderer === 'web' && webView === 'present', show: () => workbench.setWebView('present') },
  ]
  const modes: { id: WorkbenchMode, icon: 'edit' | 'eye', label: string, hint: string }[] = [
    { id: 'editing', icon: 'edit', label: t.editingMode, hint: t.editingHint },
    { id: 'viewing', icon: 'eye', label: t.viewingMode, hint: t.viewingHint },
  ]
  return (
    <header className="pmw-toolbar" role="toolbar" aria-label={t.commands}>
      {!framed && <>
        <PmIconButton icon="arrow-left" label={t.back} small onClick={() => workbench.closeDocument()} />
        <h1 className="pmw-toolbar__title" title={title}>{title}</h1>
        <span className="pmw-toolbar__divider" aria-hidden="true" />
      </>}
      <button type="button" className="pmw-tool" aria-pressed={navigation} aria-label={t.navigationPane} title={t.navigationPane} onClick={onNavigation}><PmIcon name="navigation" /></button>
      <span className="pmw-toolbar__divider" aria-hidden="true" />
      <span className="pmw-toolbar__group" role="group" aria-label={`${t.undo} / ${t.redo}`}>
        <button type="button" className="pmw-tool" aria-label={undoLabel} title={undoLabel} disabled={!history?.undo || busy} onClick={() => void workbench.undo()}><PmIcon name="undo" /></button>
        <button type="button" className="pmw-tool" aria-label={redoLabel} title={redoLabel} disabled={!history?.redo || busy} onClick={() => void workbench.redo()}><PmIcon name="redo" /></button>
        <SaveStatus />
      </span>
      <span className="pmw-toolbar__divider" aria-hidden="true" />
      <span className="pmw-toolbar__group" role="group" aria-label={t.view}>
        {views.map(view => <button key={view.id} type="button" className="pmw-tool" data-view={view.id} aria-label={view.label} title={view.hint} aria-pressed={view.pressed} onClick={view.show}><PmIcon name={view.icon} /><span className="pmw-toolbar__label">{view.label}</span></button>)}
      </span>
      <span className="pmw-toolbar__divider" aria-hidden="true" />
      <span className="pmw-toolbar__group" role="group" aria-label={t.modeLabel}>
        {modes.map(item => <button key={item.id} type="button" className="pmw-tool" aria-label={item.label} aria-pressed={mode === item.id} title={item.hint} onClick={() => workbench.setMode(item.id)}><PmIcon name={item.icon} /><span className="pmw-toolbar__label">{item.label}</span></button>)}
      </span>
      <span className="pmw-spacer" />
      <PmIconButton small icon="captions" label={t.narration} disabled={Boolean(narration && narrationDirty)} aria-pressed={Boolean(narration)} onClick={() => {
        if (workbench.state.narration) workbench.closeNarration()
        else { const at = workbench.state.position; const section = at?.section ?? workbench.state.ir?.doc.sections[0]?.id; if (section) workbench.selectNarration(section, at?.step ?? 0) }
      }} />
      {openComments > 0 && (
        <PmButton small variant="accent" icon="sparkle" aria-label={t.sendComments(openComments)} title={t.sendComments(openComments)} disabled={asking} onClick={() => void workbench.askAgentAboutComments()}>
          <span className="pmw-toolbar__label">{t.sendComments(openComments)}</span>
        </PmButton>
      )}
      <span className="pmw-toolbar__group" role="group" aria-label={`${t.comments} / ${t.versionHistory} / ${t.exportPane}`}>
        <button type="button" className="pmw-tool" aria-label={openComments > 0 ? `${t.comments} (${openComments})` : t.comments} title={t.comments} aria-pressed={aside === 'comments'} onClick={() => onAside('comments')}>
          <PmIcon name="comment" /><span className="pmw-toolbar__label">{t.comments}</span>
          {openComments > 0 && <PmBadge tone="accent" pill>{openComments}</PmBadge>}
        </button>
        <button type="button" className="pmw-tool" aria-label={t.versionHistory} title={t.versionHistory} aria-pressed={aside === 'history'} onClick={() => onAside('history')}><PmIcon name="versions" /><span className="pmw-toolbar__label">{t.versionHistory}</span></button>
        <button type="button" className="pmw-tool" data-aside="export" aria-label={making > 0 ? `${t.exportPane} (${making})` : t.exportPane} title={t.exportHint} aria-pressed={aside === 'export'} onClick={() => onAside('export')}>
          <PmIcon name="export" /><span className="pmw-toolbar__label">{t.exportPane}</span>
          {making > 0 && <PmBadge tone="accent" pill>{making}</PmBadge>}
        </button>
      </span>
    </header>
  )
}

function SaveStatus() {
  const t = useMessages()
  const save = useWorkbenchState(state => state.save)
  const dirty = useWorkbenchState(state => Boolean(state.sourceDirty || state.narrationDirty))
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
