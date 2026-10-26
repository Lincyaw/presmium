import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import type { BlockPreviewCommand } from '@lincyaw/kernel'
import { toBlockPreviewPlaybackCancelled, toBlockPreviewPlaybackRequest, toBlockPreviewPosition } from '@lincyaw/kernel'
import { PmIconButton, PmIcon } from '../components.tsx'
import { useWorkbench, useWorkbenchState } from '../context.tsx'
import { prepareDocumentPreview } from '../document-preview.ts'
import { DOCUMENT_EDITOR_MESSAGES } from './messages.ts'
import { documentBlockSection, DocumentStepNarration } from './DocumentStepNarration.tsx'
import { DocumentBlockPlayback } from './block-playback.ts'

interface Snapshot { address: string, revision: string }
interface PreviewState { snapshot?: Snapshot, status: 'idle' | 'loading' | 'ready' | 'failed' }
/** A read-only runtime is a custom native block, independent from the document's editable JSON and selection. */
export function DocumentBlockPreview({ blockId, fallback }: { blockId: string, fallback?: ReactNode }) {
  const workbench = useWorkbench()
  const source = useWorkbenchState(state => state.authoring)
  const directory = useWorkbenchState(state => state.document)
  const documentView = useWorkbenchState(state => state.webView === 'document')
  const dark = useWorkbenchState(state => state.isDark)
  const locale = useWorkbenchState(state => state.locale), t = DOCUMENT_EDITOR_MESSAGES[locale]
  const position = useWorkbenchState(state => state.position)
  const navigation = useWorkbenchState(state => state.documentPositionToken)
  const navigationIntent = useWorkbenchState(state => state.documentPositionIntent)
  const sectionId = source?.content && documentBlockSection(source.content, blockId)
  const section = sectionId ? source?.content?.sections[sectionId] : undefined
  const stepId = section?.stepOrder[position && position.section === sectionId ? position.step : 0] ?? section?.stepOrder[0]
  const [narrationOpen, setNarrationOpen] = useState(() => Boolean(workbench.pendingDocumentField(blockId, source?.identity)
    || source?.identity && stepId && (workbench.documentTimingDraft(stepId, 'minimumHoldMs', source.identity, source.reset) || workbench.documentTimingDraft(stepId, 'trailingPauseMs', source.identity, source.reset)))), narrationPanel = useId()
  const root = useRef<HTMLElement>(null), frame = useRef<HTMLIFrameElement | null>(null)
  const mountFrame = useCallback((element: HTMLIFrameElement | null) => {
    frame.current = element
    element?.toggleAttribute('inert', true)
  }, [])
  const [visible, setVisible] = useState(false), [attempt, setAttempt] = useState(0), [height, setHeight] = useState<number>()
  const [state, setState] = useState<PreviewState>({ status: 'idle' })
  const currentState = useRef(state)
  currentState.current = state
  const runtimeGeneration = useRef(0), pauseRuntime = useRef<() => void>(() => {})
  const mismatches = useRef(0)
  const frameReady = useRef(false), [readiness, setReadiness] = useState(0)
  const reportedStep = useRef<string>()
  const reportedNavigation = useRef<string>()
  const editingStep = useRef<string>()
  const playback = useRef<DocumentBlockPlayback>()
  const fail = useCallback(() => {
    // Retire this child before React removes it. A queued ready/position message
    // cannot restore a failed runtime or adopt its position in the document.
    pauseRuntime.current()
    runtimeGeneration.current++
    frameReady.current = false
    playback.current?.dispose()
    playback.current = undefined
    setState({ status: 'failed' })
  }, [])
  const [loadedVersion, setLoadedVersion] = useState<string>()
  const [loadedProject, setLoadedProject] = useState(0), [loadedAttempt, setLoadedAttempt] = useState(0)
  const enabled = visible && documentView
  useEffect(() => {
    const element = root.current
    if (!element) return
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return }
    const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)), { rootMargin: '200px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!enabled || directory === undefined || !source?.version) return
    if (!source.fingerprint) { fail(); return }
    let current = true
    const version = source.version
    setState(before => ({ ...before, status: 'loading' }))
    void prepareDocumentPreview(workbench.client, { directory, version, fingerprint: source.fingerprint, project: source.projectRevision ?? 0 }, attempt > 0).then(snapshot => {
      if (!current) return
      setState({ snapshot, status: 'loading' }); setLoadedVersion(version); setLoadedProject(source.projectRevision ?? 0); setLoadedAttempt(attempt)
    }, () => { if (current) fail() })
    return () => { current = false }
  }, [enabled, directory, source?.version, source?.fingerprint, source?.projectRevision, attempt, workbench, fail])
  const address = state.snapshot ? new URL(state.snapshot.address) : undefined
  address?.searchParams.set('presmium-block', blockId)
  address?.searchParams.set('presmium-appearance', dark ? 'dark' : 'light')
  // A saved version changes only the runtime frame; it never resets the native editor.
  address?.searchParams.set('presmium-block-version', loadedVersion ?? '')
  address?.searchParams.set('presmium-block-refresh', `${loadedProject}:${loadedAttempt}`)
  const src = address?.href, origin = address?.origin
  const command = useCallback((action: 'seek' | 'pause', at?: 'start' | 'end', token = navigation) => {
    if (!origin || !state.snapshot || !sectionId || !stepId) return
    const value: BlockPreviewCommand = { type: 'presmium:block-preview-command', action, document: directory ?? '', blockId, revision: state.snapshot.revision, sectionId, stepId, navigation: token, ...at ? { at } : {} }
    frame.current?.contentWindow?.postMessage(value, origin)
  }, [origin, state.snapshot, directory, blockId, sectionId, stepId, navigation])
  pauseRuntime.current = () => command('pause')
  const pause = useCallback(() => {
    if (sectionId && stepId) {
      editingStep.current = JSON.stringify([sectionId, stepId])
      workbench.pauseDocumentStep(sectionId, stepId)
      reportedStep.current = editingStep.current
      reportedNavigation.current = workbench.getState().documentPositionToken
    }
    command('pause', undefined, reportedNavigation.current); workbench.stopAuditions()
  }, [command, workbench, sectionId, stepId])
  useEffect(() => {
    if (!src || !origin || !enabled || !state.snapshot) return
    const group = new DocumentBlockPlayback({
      activate: stop => workbench.startDocumentPlayback(stop), failure: t.previewFailure,
      current: request => {
        const current = workbench.getState(), document = current.authoring?.content
        return Boolean(current.document === directory && current.authoring?.version === loadedVersion && (current.authoring?.projectRevision ?? 0) === loadedProject && document
          && request.navigation === current.documentPositionToken
          && documentBlockSection(document, blockId) === request.sectionId && document.sections[request.sectionId]?.stepOrder.includes(request.stepId))
      },
      adopt: request => {
        editingStep.current = undefined
        reportedStep.current = JSON.stringify([request.sectionId, request.stepId])
        workbench.observeDocumentStep(request.sectionId, request.stepId)
        return reportedNavigation.current = workbench.getState().documentPositionToken
      },
      post: value => frame.current?.contentWindow?.postMessage(value, origin),
    })
    playback.current = group
    return () => { group.dispose(); if (playback.current === group) playback.current = undefined }
  }, [src, origin, enabled, loadedVersion, loadedProject, state.snapshot?.revision, directory, blockId, workbench, t.previewFailure])
  useEffect(() => {
    if (editingStep.current && sectionId && stepId) editingStep.current = JSON.stringify([sectionId, stepId])
  }, [sectionId, stepId])
  useEffect(() => { reportedStep.current = undefined; reportedNavigation.current = undefined; frameReady.current = false }, [src, enabled])
  useEffect(() => {
    if (!enabled || !frameReady.current || state.status !== 'ready' || !sectionId || !stepId || reportedStep.current === JSON.stringify([sectionId, stepId]) && reportedNavigation.current === navigation) return
    const initial = reportedNavigation.current === undefined
    reportedStep.current = JSON.stringify([sectionId, stepId])
    reportedNavigation.current = navigation
    command(!initial && navigationIntent === 'pause' ? 'pause' : 'seek', 'end')
  }, [state.status, sectionId, stepId, navigation, navigationIntent, command, enabled, src, readiness])
  useEffect(() => { frame.current?.toggleAttribute('inert', !frameReady.current || state.status !== 'ready') }, [readiness, state.status, enabled, src])
  useEffect(() => {
    if (!src || !origin || !enabled || !state.snapshot) return
    const expected = state.snapshot.revision
    const generation = runtimeGeneration.current
    const listener = (event: MessageEvent) => {
      if (generation !== runtimeGeneration.current || event.source !== frame.current?.contentWindow || event.origin !== origin) return
      const value = event.data
      if (!value || !['presmium:block-preview', 'presmium:block-preview-position', 'presmium:block-preview-playback-request', 'presmium:block-preview-playback-cancelled'].includes(value.type) || value.blockId !== blockId || value.document !== directory) return
      if (value.revision !== expected) {
        if (mismatches.current++ < 3) setAttempt(value => value + 1)
        else fail()
        return
      }
      const cancelled = toBlockPreviewPlaybackCancelled(value)
      if (cancelled) {
        playback.current?.cancelled(cancelled.request)
        return
      }
      const request = toBlockPreviewPlaybackRequest(value)
      if (request) {
        playback.current?.request(request)
        return
      }
      if (value.type !== 'presmium:block-preview' && value.type !== 'presmium:block-preview-position') return
      if (value.type === 'presmium:block-preview-position') {
        const current = workbench.getState()
        if (current.document !== directory || current.authoring?.version !== loadedVersion || (current.authoring?.projectRevision ?? 0) !== loadedProject) return
        const position = toBlockPreviewPosition(value), document = current.authoring?.content
        if (position && position.navigation === current.documentPositionToken && document
          && documentBlockSection(document, blockId) === position.sectionId && document.sections[position.sectionId]?.stepOrder.includes(position.stepId)) {
          // A position posted just before pause must not replace an active field's target.
          if (frame.current && frame.current.ownerDocument.activeElement === frame.current) editingStep.current = undefined
          if (editingStep.current && editingStep.current !== JSON.stringify([position.sectionId, position.stepId])) return
          reportedStep.current = JSON.stringify([position.sectionId, position.stepId])
          workbench.observeDocumentStep(position.sectionId, position.stepId)
          reportedNavigation.current = workbench.getState().documentPositionToken
          const accepted: BlockPreviewCommand = { type: 'presmium:block-preview-command', action: 'sync', document: directory ?? '', blockId, revision: expected, sectionId: position.sectionId, stepId: position.stepId, navigation: reportedNavigation.current }
          frame.current?.contentWindow?.postMessage(accepted, origin)
        }
        return
      }
      if (typeof value.height === 'number' && Number.isFinite(value.height)) setHeight(Math.max(1, Math.min(value.height, 4096)))
      if (value.status === 'failed') fail()
      else if (value.status === 'ready') {
        if (!frameReady.current) { frameReady.current = true; setReadiness(value => value + 1) }
        mismatches.current = 0; setState(before => ({ ...before, status: 'ready' }))
      }
    }
    window.addEventListener('message', listener)
    const timeout = setTimeout(() => { if (generation === runtimeGeneration.current && currentState.current.status === 'loading') fail() }, 30_000)
    return () => { clearTimeout(timeout); window.removeEventListener('message', listener) }
  }, [src, origin, enabled, state.snapshot?.revision, blockId, directory, loadedVersion, loadedProject, workbench, fail])
  const old = source?.dirty || source?.saving || source?.error || source?.restored || loadedVersion !== source?.version || loadedProject !== (source?.projectRevision ?? 0)
  return <section ref={root} className="pm-ui-block-preview" data-block-preview={blockId} data-status={state.status} contentEditable={false}>
    <header className="pm-ui-block-preview__header"><span className="pm-ui-block-preview__label" role={state.status === 'failed' ? 'status' : undefined}><PmIcon name="slides" />{state.status === 'failed' ? t.previewFailure : old && state.snapshot ? t.previewPrevious : state.status === 'loading' ? t.previewLoading : t.previewSnapshot}</span>
      <span className="pm-ui-block-preview__actions">
        <PmIconButton small icon="captions" label={t.stepCaptions} aria-expanded={narrationOpen} aria-controls={narrationOpen ? narrationPanel : undefined} aria-pressed={narrationOpen} disabled={!stepId} onClick={() => {
          pause()
          if (sectionId && stepId) workbench.observeDocumentStep(sectionId, stepId)
          setNarrationOpen(value => !value)
        }} />
        <PmIconButton small icon="refresh" label={state.status === 'failed' ? t.previewRetry : t.previewRefresh} hint={state.status === 'loading' ? t.previewLoading : state.status === 'failed' ? t.previewRetry : t.previewRefresh} loading={state.status === 'loading'} onClick={() => { pause(); if (!source?.fingerprint) void workbench.retryDocument(); setAttempt(value => value + 1) }} disabled={!enabled} />
      </span></header>
    <div className="pm-ui-block-preview__viewport" role="region" aria-label={t.previewTitle} tabIndex={enabled && src ? -1 : 0}
      style={height === undefined ? undefined : { '--pm-block-content-height': `${height}px` } as CSSProperties}
      onKeyDownCapture={event => { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) event.stopPropagation() }}>
      {enabled && src ? <iframe key={src} ref={mountFrame} className="pm-ui-block-preview__frame" src={src} title={t.previewTitle} sandbox="allow-scripts allow-same-origin" onFocus={() => { editingStep.current = undefined }} /> : fallback}
      {enabled && !src && state.status === 'loading' && <p className="pm-ui-block-preview__pending" role="status">{t.previewLoading}</p>}
    </div>
    {sectionId && stepId && <DocumentStepNarration blockId={blockId} sectionId={sectionId} stepId={stepId} expanded={narrationOpen} panelId={narrationPanel} onPause={pause} />}
  </section>
}
