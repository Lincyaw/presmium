import { useEffect, useState } from 'react'
import type { PreviewRenderer } from '@lincyaw/kernel'
import { PmBadge, PmButton, PmIcon, PmIconButton, PmNotice } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchState } from '../context.tsx'
import { timeAgo } from '../messages.ts'
import { hasSlides as hasSlidesForm, isAgentChanging } from '../workbench.ts'
import type { WorkbenchMode } from '../workbench.ts'
import { CommentsPanel } from './CommentsPanel.tsx'
import { HistoryPanel } from './HistoryPanel.tsx'
import { PreviewPanel } from './PreviewPanel.tsx'

export type DocumentAside = 'comments' | 'history'

const isTyping = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || target.closest('input, textarea, select, [contenteditable]') !== null)

/** The open document: its toolbar, what needs the author's attention, the document itself and its comments or history. */
export function DocumentView({ active = true }: { active?: boolean }) {
  const workbench = useWorkbench()
  const [aside, setAside] = useState<DocumentAside | null>(null)
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
    <div className="pmw-document" data-aside={aside ?? undefined}>
      <DocumentToolbar aside={aside} onAside={next => setAside(current => (current === next ? null : next))} />
      <DocumentNotices />
      <div className="pmw-document__body">
        <PreviewPanel active={active} />
        {aside && (
          <aside className="pmw-document__aside" aria-label={aside}>
            {aside === 'comments' ? <CommentsPanel onClose={() => setAside(null)} /> : <HistoryPanel onClose={() => setAside(null)} />}
          </aside>
        )}
      </div>
    </div>
  )
}

function DocumentToolbar({ aside, onAside }: { aside: DocumentAside | null, onAside(aside: DocumentAside): void }) {
  const t = useMessages()
  const workbench = useWorkbench()
  const title = useWorkbenchState(state => state.documents?.documents.find(doc => doc.dir === state.document)?.title ?? state.ir?.doc.meta.title ?? '')
  const history = useWorkbenchState(state => state.history)
  const busy = useWorkbenchState(state => state.isHistoryBusy || Boolean(state.editing) || isAgentChanging(state))
  const renderer = useWorkbenchState(state => state.previewRenderer)
  const hasSlides = useWorkbenchState(state => hasSlidesForm(state.ir))
  const mode = useWorkbenchState(state => state.mode)
  const openComments = useWorkbenchState(state => state.comments.filter(comment => comment.status === 'open').length)
  const asking = useWorkbenchState(state => state.isAsking)
  const summaryOf = (id: string | undefined) => {
    const revision = id ? history?.revisions.find(r => r.id.startsWith(id) || id.startsWith(r.id)) : undefined
    return revision?.message.split('\n')[0] ?? ''
  }
  const undoLabel = history?.undo ? t.undoWhat(summaryOf(history.undo)) : t.nothingToUndo
  const redoTarget = history?.redo && history.revisions.find(r => r.id === history.redo)?.reverts
  const redoLabel = history?.redo ? t.redoWhat(summaryOf(redoTarget ?? history.redo)) : t.nothingToRedo
  const views: PreviewRenderer[] = hasSlides ? ['web', 'slides'] : ['web']
  const modes: { id: WorkbenchMode, icon: 'edit' | 'eye', label: string, hint: string }[] = [
    { id: 'editing', icon: 'edit', label: t.editingMode, hint: t.editingHint },
    { id: 'viewing', icon: 'eye', label: t.viewingMode, hint: t.viewingHint },
  ]
  return (
    <header className="pmw-toolbar">
      <PmIconButton icon="arrow-left" label={t.back} onClick={() => workbench.closeDocument()} />
      <h1 className="pmw-toolbar__title" title={title}>{title}</h1>
      <span className="pmw-toolbar__group" role="group" aria-label={`${t.undo} / ${t.redo}`}>
        <PmIconButton icon="undo" label={undoLabel} disabled={!history?.undo || busy} onClick={() => void workbench.undo()} />
        <PmIconButton icon="redo" label={redoLabel} disabled={!history?.redo || busy} onClick={() => void workbench.redo()} />
      </span>
      <SaveStatus />
      <span className="pmw-spacer" />
      {views.length > 1 && (
        <span className="pm-ui-segmented" role="group" aria-label={t.view}>
          {views.map(view => <button key={view} type="button" className="pm-ui-segmented__option" aria-label={t.renderers[view]} title={t.renderers[view]} aria-pressed={renderer === view} onClick={() => workbench.setPreviewRenderer(view)}><PmIcon name={view === 'web' ? 'document' : 'slides'} size={15} /><span className="pmw-toolbar__label">{t.renderers[view]}</span></button>)}
        </span>
      )}
      <span className="pm-ui-segmented" role="group" aria-label={t.modeLabel}>
        {modes.map(item => <button key={item.id} type="button" className="pm-ui-segmented__option" aria-label={item.label} aria-pressed={mode === item.id} title={item.hint} onClick={() => workbench.setMode(item.id)}><PmIcon name={item.icon} size={15} /><span className="pmw-toolbar__label">{item.label}</span></button>)}
      </span>
      {openComments > 0 && (
        <PmButton variant="accent" icon="sparkle" aria-label={t.sendComments(openComments)} title={t.sendComments(openComments)} disabled={asking} onClick={() => void workbench.askAgentAboutComments()}>
          <span className="pmw-toolbar__label">{t.sendComments(openComments)}</span>
        </PmButton>
      )}
      <PmButton icon="comment" aria-label={openComments > 0 ? `${t.comments} (${openComments})` : t.comments} title={t.comments} aria-pressed={aside === 'comments'} onClick={() => onAside('comments')}>
        <span className="pmw-toolbar__label">{t.comments}</span>
        {openComments > 0 && <PmBadge tone="accent" pill>{openComments}</PmBadge>}
      </PmButton>
      <PmButton icon="versions" aria-label={t.versionHistory} title={t.versionHistory} aria-pressed={aside === 'history'} onClick={() => onAside('history')}><span className="pmw-toolbar__label">{t.versionHistory}</span></PmButton>
    </header>
  )
}

function SaveStatus() {
  const t = useMessages()
  const save = useWorkbenchState(state => state.save)
  const locale = useWorkbenchState(state => state.locale)
  const [, tick] = useState(0)
  useEffect(() => {
    if (save.kind !== 'saved') return
    const timer = setInterval(() => tick(n => n + 1), 30_000)
    return () => clearInterval(timer)
  }, [save])
  const text = save.kind === 'saving'
    ? t.saving
    : save.kind === 'saved' ? t.savedAt(timeAgo(save.at, locale)) : save.kind === 'idle' ? t.saved : ''
  return <span className="pmw-toolbar__status" role="status" aria-live="polite" data-save={save.kind}>{text}</span>
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
