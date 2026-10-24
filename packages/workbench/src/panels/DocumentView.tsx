import { useEffect, useMemo, useState } from 'react'
import type { IconName } from '@lincyaw/design'
import { PmBadge, PmButton, PmIcon, PmIconButton, PmNotice } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchState } from '../context.tsx'
import { timeAgo } from '../messages.ts'
import { countWords, documentOutline } from '../outline.ts'
import { hasSlides as hasSlidesForm, hasVideo, isAgentChanging, isVideo, VIDEO_TARGET } from '../workbench.ts'
import type { WorkbenchMode } from '../workbench.ts'
import { CommentsPanel } from './CommentsPanel.tsx'
import { ExportPanel, VideoDialog } from './ExportPanel.tsx'
import { HistoryPanel } from './HistoryPanel.tsx'
import { PreviewPanel } from './PreviewPanel.tsx'

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
  const [navigation, setNavigation] = useState(() => typeof matchMedia === 'function' && matchMedia(ROOMY).matches)
  const video = useWorkbenchState(isVideo)
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
      {video && <VideoFileBar />}
      <DocumentNotices />
      <div className="pmw-document__body">
        {navigation && <NavigationPane onClose={() => setNavigation(false)} />}
        <PreviewPanel active={active} />
        {aside && (
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
  const title = useWorkbenchState(state => state.documents?.documents.find(doc => doc.dir === state.document)?.title ?? state.ir?.doc.meta.title ?? '')
  const history = useWorkbenchState(state => state.history)
  const busy = useWorkbenchState(state => state.isHistoryBusy || Boolean(state.editing) || isAgentChanging(state))
  const renderer = useWorkbenchState(state => state.previewRenderer)
  const hasSlides = useWorkbenchState(state => hasSlidesForm(state.ir))
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
  const video = useWorkbenchState(hasVideo)
  // The document, its presentation (the same page, switched at once), with a slides form the slides, and with a lecture
  // the video it makes.
  const views: { id: string, icon: IconName, label: string, hint: string, pressed: boolean, show(): void }[] = [
    { id: 'document', icon: 'document', label: t.renderers.web, hint: t.renderers.web, pressed: renderer === 'web' && webView === 'document', show: () => workbench.setWebView('document') },
    { id: 'present', icon: 'play', label: t.present, hint: t.presentHint, pressed: renderer === 'web' && webView === 'present', show: () => workbench.setWebView('present') },
    ...hasSlides ? [{ id: 'slides', icon: 'slides' as const, label: t.renderers.slides, hint: t.slidesHint, pressed: renderer === 'slides', show: () => workbench.setPreviewRenderer('slides') }] : [],
    ...video ? [{ id: 'video', icon: 'video' as const, label: t.video, hint: t.videoHint, pressed: renderer === 'web' && webView === 'video', show: () => workbench.setWebView('video') }] : [],
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
/**
 * Above the video: its file, made from the content as it is now or before, being made, or not yet; to make, play or
 * download (the same job as in the Export pane).
 */
function VideoFileBar() {
  const t = useMessages()
  const workbench = useWorkbench()
  const job = useWorkbenchState(state => state.jobs?.jobs.find(own => own.target === VIDEO_TARGET && own.state !== 'cancelled'))
  const label = useWorkbenchState(state => {
    const target = state.jobs?.targets.find(own => own.id === VIDEO_TARGET)
    return target?.label[state.locale] ?? t.video
  })
  const revision = useWorkbenchState(state => state.ir?.revision)
  const [playing, setPlaying] = useState(false)
  const making = job?.state === 'queued' || job?.state === 'running'
  const progress = job?.state === 'running' ? job.progress : undefined
  const done = job?.state === 'done' ? job : undefined
  const main = done?.main && `${done.url}${done.main}`
  return (
    <div className="pmw-videobar" role="group" aria-label={t.videoFile}>
      <PmIcon name="video" />
      <span className="pmw-videobar__label">{t.videoFile}</span>
      <span className="pmw-videobar__status">
        {!job && t.noVideoFile}
        {making && (progress?.total ? t.jobProgress(t.jobPhases[progress.phase] ?? progress.phase, progress.done, progress.total) : t.jobStates[job.state])}
        {job?.state === 'failed' && t.outputFailed(job.error?.split('\n')[0] ?? '')}
        {done && (done.revision === revision ? t.currentContent : t.olderContent)}
      </span>
      {making && progress?.total !== undefined && <progress className="pmw-videobar__progress" max={progress.total} value={progress.done ?? 0} aria-label={label} />}
      <span className="pmw-spacer" />
      {main && <PmButton small icon="play" onClick={() => setPlaying(true)}>{t.playVideoFile}</PmButton>}
      {main && <a className="pm-ui-button pm-ui-button--small" href={`${main}?download`}><PmIcon name="download" />{t.downloadOutput}</a>}
      {making
        ? <PmButton small onClick={() => void workbench.cancelJob(job.id)}>{t.cancelOutput}</PmButton>
        : (!done || done.revision !== revision) && <PmButton small variant="accent" icon="export" onClick={() => void workbench.startJob(VIDEO_TARGET)}>{done ? t.remakeVideoFile : t.makeVideoFile}</PmButton>}
      <VideoDialog job={playing ? done : undefined} label={label} onClose={() => setPlaying(false)} />
    </div>
  )
}

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
