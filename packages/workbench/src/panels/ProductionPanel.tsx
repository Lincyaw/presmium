import { useEffect, useRef, useState } from 'react'
import { sameProductionBinding } from '@lincyaw/kernel'
import type { ProductionPlaybackCommand } from '@lincyaw/kernel'
import { PmBadge, PmButton, PmCard, PmEmpty, PmField, PmIconButton, PmNotice, PmSelect, PmSegmented, PmToolbar, PmToolbarButton } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchState } from '../context.tsx'
import { DocumentStepNarration } from '../document-editor/DocumentStepNarration.tsx'
import { PRODUCTION_MESSAGES, productionFailure } from '../production-messages.ts'
import { isAgentChanging } from '../workbench.ts'
import { DocumentVoiceField } from './DocumentVoiceField.tsx'
import { ExportPanel } from './ExportPanel.tsx'
import { PreviewPanel } from './PreviewPanel.tsx'
import { VoiceoverDialog } from './VoiceoverDialog.tsx'
import { ProductionTimeline } from './ProductionTimeline.tsx'
import { ProductionMediaClips } from './ProductionMediaClips.tsx'
import { ProductionRecording } from './ProductionRecording.tsx'
import { ProductionTranscription } from './ProductionTranscription.tsx'

const clockTime = (value?: number) => {
  if (value === undefined || !Number.isFinite(value)) return '--:--.---'
  const ms = Math.max(0, Math.round(value))
  return `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${(ms % 60000 / 1000).toFixed(3).padStart(6, '0')}`
}

/** An explicit production workspace edits the same source; its preview has an independent compilation boundary. */
export function ProductionPanel({ onClose, closing }: { onClose(): void, closing: boolean }) {
  const workbench = useWorkbench(), t = useMessages(), locale = useWorkbenchState(state => state.locale), p = PRODUCTION_MESSAGES[locale]
  const source = useWorkbenchState(state => state.authoring), position = useWorkbenchState(state => state.position)
  const stamp = useWorkbenchState(state => state.presentationSnapshot), view = useWorkbenchState(state => state.webView)
  const preparing = useWorkbenchState(state => Boolean(state.isPreparingPresentation))
  const plan = useWorkbenchState(state => state.productionPlan), playback = useWorkbenchState(state => state.productionPlayback)
  const playbackFailure = useWorkbenchState(state => state.productionFailure), connection = useWorkbenchState(state => state.previewConnection)
  const previewReload = useWorkbenchState(state => state.previewReload), timingDraft = useWorkbenchState(state => Boolean(state.hasDocumentTimingDrafts || state.documentTimingDraftStorageFailure))
  const frameCurrent = useWorkbenchState(state => Boolean(state.presentationSnapshot && state.previewIrRevision === state.presentationSnapshot.revision))
  const blocked = useWorkbenchState(state => Boolean(state.authoring?.loading || state.authoring?.composing) || isAgentChanging(state))
  const [wide, setWide] = useState(() => matchMedia('(min-width: 1280px)').matches), [tab, setTab] = useState('script')
  const [generateStep, setGenerateStep] = useState<string>(), [failure, setFailure] = useState<string>()
  const [planBusy, setPlanBusy] = useState(false), [planFailure, setPlanFailure] = useState<string>(), [planReload, setPlanReload] = useState(0)
  const [playerBusy, setPlayerBusy] = useState(false), [seeking, setSeeking] = useState(false), controlRequest = useRef<AbortController>()
  const [enabling, setEnabling] = useState(false)
  const [mediaRefresh, setMediaRefresh] = useState(false)
  const [transcriptionAsset, setTranscriptionAsset] = useState<{ identity: string, id: string }>()
  const owner = useRef({ active: true, generation: 0 }), initial = useRef(false)
  const document = source?.content, sectionId = position && document?.sections[position.section] ? position.section : document?.sectionOrder[0]
  const declared = Boolean(document?.metadata.plugins?.includes('@lincyaw/addon-lecture'))
  const section = sectionId ? document?.sections[sectionId] : undefined
  const stepId = section?.stepOrder[position && position.section === sectionId ? position.step : 0] ?? section?.stepOrder[0]
  const sourceCurrent = Boolean(source && stamp && source.version === stamp.version && source.fingerprint === stamp.fingerprint && (source.projectRevision ?? 0) === stamp.project && !source.dirty && !source.saving && !source.error)
  const previewVisible = sourceCurrent && view === 'present'
  const planCurrent = Boolean(plan && source?.content?.id === plan.binding.source.documentId && source.version === plan.binding.source.version && source.fingerprint === plan.binding.source.fingerprint
    && !source.loading && !source.dirty && !source.saving && !source.composing && !source.restored && !source.error)
  const playbackConnected = Boolean(planCurrent && plan && previewVisible && frameCurrent && stamp?.revision === plan.binding.irRevision)
  const live = plan && playback && sameProductionBinding(plan.binding, playback.binding) ? playback : undefined
  const canPlay = Boolean(playbackConnected && plan?.canPreview && live?.status === 'ready' && !timingDraft)
  const backgroundBody = !wide && tab === 'timeline', backgroundVisuals = !wide && tab !== 'preview' || tab === 'outputs'
  useEffect(() => workbench.observeVoiceoverJobs(), [workbench, source?.identity])
  useEffect(() => {
    const media = matchMedia('(min-width: 1280px)'), update = () => setWide(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => () => { owner.current.active = false; owner.current.generation++; controlRequest.current?.abort(); workbench.closeProduction(); workbench.cancelPreviewPreparation() }, [workbench])
  useEffect(() => {
    const controller = new AbortController()
    if (!declared || !source?.identity || source.loading || source.dirty || source.saving || source.composing || source.restored || source.error || blocked) { setPlanBusy(false); return }
    setPlanBusy(true); setPlanFailure(undefined)
    void workbench.prepareProductionPlan(controller.signal).catch(error => {
      if (!controller.signal.aborted) setPlanFailure(error instanceof Error && error.message.startsWith('production-') ? productionFailure(error, locale) : p.planFailed)
    }).finally(() => { if (!controller.signal.aborted) setPlanBusy(false) })
    return () => controller.abort()
  }, [workbench, source?.identity, source?.version, source?.fingerprint, source?.projectRevision, source?.loading, source?.dirty, source?.saving, source?.composing, source?.restored, source?.error, blocked, declared, planReload, previewReload])
  useEffect(() => {
    const controller = new AbortController()
    // Reading an unchanged cache plan must not cancel an in-flight load of the same immutable binding.
    if (!plan || !playbackConnected || blocked || timingDraft) { setPlayerBusy(false); return }
    setPlayerBusy(true)
    void workbench.controlProduction({ binding: plan.binding, action: 'load' }, controller.signal).catch(() => {}).finally(() => { if (!controller.signal.aborted) setPlayerBusy(false) })
    return () => controller.abort()
  }, [workbench, plan?.binding.planId, playbackConnected, connection, blocked, timingDraft])
  const control = async (command: ProductionPlaybackCommand) => {
    if (!owner.current.active || !playbackConnected || blocked || closing || timingDraft) return
    controlRequest.current?.abort()
    const controller = new AbortController(); controlRequest.current = controller
    setSeeking(command.action === 'seek')
    try { await workbench.controlProduction(command, controller.signal) } catch {}
    finally { if (controlRequest.current === controller) { controlRequest.current = undefined; if (owner.current.active) setSeeking(false) } }
  }
  const compile = async (refreshPlan = true) => {
    if (workbench.getState().isPreparingPresentation || !source?.identity) return
    const identity = source.identity, generation = ++owner.current.generation
    const current = () => owner.current.active && generation === owner.current.generation && workbench.getState().authoring?.identity === identity
    setFailure(undefined)
    try {
      await workbench.flushPendingEdits()
      if (!current()) return
      const prepared = await workbench.preparePresentation()
      if (!current()) return
      if (!prepared) {
        const message = workbench.getState().presentationFailure
        setFailure(message === t.timingDraftPending ? undefined : message)
        return
      }
      workbench.setWebView('present')
      if (refreshPlan) setPlanReload(value => value + 1)
    } catch { if (current()) setFailure(t.presentationCompileFailed) }
  }
  useEffect(() => {
    if (!mediaRefresh || preparing || workbench.getState().isPreparingPresentation || blocked || closing || !source?.identity
      || source.loading || source.dirty || source.saving || source.composing || source.restored || source.error) return
    // Consume one merged intent; a later accepted media change can queue the next saved version.
    setMediaRefresh(false)
    if (!sourceCurrent || !frameCurrent) void compile()
  }, [mediaRefresh, preparing, blocked, closing, source?.identity, source?.version, source?.fingerprint, source?.loading, source?.dirty, source?.saving, source?.composing, source?.restored, source?.error, sourceCurrent, frameCurrent])
  useEffect(() => { if (!initial.current) { initial.current = true; void compile(false) } }, [])
  const select = (page: string, step: string) => { workbench.stopAuditions(); workbench.selectDocumentStep(page, step) }
  const enable = async () => {
    if (blocked || closing || enabling) return
    setFailure(undefined); setEnabling(true)
    try { await workbench.enableDocumentProduction(); if (owner.current.active) { workbench.cancelPreviewPreparation(); await compile() } }
    catch (error) { if (owner.current.active) setFailure(productionFailure(error, locale)) }
    finally { if (owner.current.active) setEnabling(false) }
  }
  if (!source?.identity || !document || !section || !sectionId || !stepId) return <PmEmpty icon="video">{t.noSections}</PmEmpty>
  return <section className="pmw-production" aria-label={p.title}>
    <PmToolbar label={p.title} className="pmw-toolbar">
      <PmToolbarButton asChild>{wide ? <PmButton small icon="document" loading={closing} onClick={onClose}>{p.back}</PmButton> : <PmIconButton small icon="document" label={p.back} loading={closing} onClick={onClose} />}</PmToolbarButton>
      <strong className="pmw-toolbar__title">{p.title}</strong>
      {wide && <PmBadge tone={sourceCurrent && frameCurrent ? 'ok' : preparing || sourceCurrent ? 'accent' : 'warn'}>{sourceCurrent && frameCurrent ? p.current : preparing || sourceCurrent ? p.preparing : p.outdated}</PmBadge>}
      <span className="pmw-spacer" />
      <PmToolbarButton asChild><PmIconButton small icon="refresh" label={p.prepare} loading={preparing} disabled={blocked || closing} onClick={() => void compile()} /></PmToolbarButton>
      <PmToolbarButton asChild><PmIconButton small icon="export" label={p.outputs} aria-pressed={tab === 'outputs'} onClick={() => setTab(current => current === 'outputs' ? 'script' : 'outputs')} /></PmToolbarButton>
    </PmToolbar>
    {!wide && <div className="pmw-production__status"><PmBadge tone={sourceCurrent && frameCurrent ? 'ok' : preparing || sourceCurrent ? 'accent' : 'warn'}>{sourceCurrent && frameCurrent ? p.current : preparing || sourceCurrent ? p.preparing : p.outdated}</PmBadge></div>}
    {failure && <PmNotice tone="danger">{failure}</PmNotice>}
    {!declared && <PmNotice tone="accent"><span>{p.enableHint}</span><PmButton small loading={enabling} disabled={blocked || closing} onClick={() => void enable()}>{p.enable}</PmButton></PmNotice>}
    <div className="pmw-production__selection">
      <PmSelect label={p.page} density="compact" value={sectionId} disabled={blocked || closing} onChange={event => { const page = document.sections[event.target.value]; if (page?.stepOrder[0]) select(page.id, page.stepOrder[0]) }}>{document.sectionOrder.map((id, index) => <option key={id} value={id}>{index + 1} · {document.sections[id]!.title}</option>)}</PmSelect>
      <PmField label={p.step} group><PmToolbar className="pmw-step-timeline__steps" label={p.step}>{section.stepOrder.map((id, index) => <PmToolbarButton asChild key={id}><PmButton small aria-pressed={stepId === id} disabled={blocked || closing} onClick={() => select(sectionId, id)}>{index + 1}</PmButton></PmToolbarButton>)}</PmToolbar></PmField>
    </div>
    <PmToolbar label={p.timeline} className="pmw-production__transport">
      <PmToolbarButton asChild><PmButton small icon={live?.position?.playing ? 'pause' : 'play'} loading={playerBusy} disabled={!canPlay || planBusy || preparing || blocked || closing || seeking} onClick={() => { if (plan) void control({ binding: plan.binding, action: live?.position?.playing ? 'pause' : 'play' }) }}>{live?.position?.playing ? p.pause : p.play}</PmButton></PmToolbarButton>
      <output aria-label={p.timelineLabels.position}>{clockTime(live?.position?.timeMs)} / {clockTime(planCurrent ? plan?.durationMs : undefined)}</output>
      <PmSelect label={p.rate} value={live?.position?.rate === undefined ? '' : String(live.position.rate)} disabled={!canPlay || playerBusy || planBusy || preparing || blocked || closing || seeking} onChange={event => { if (plan) void control({ binding: plan.binding, action: 'rate', rate: Number(event.target.value) }) }}>
        {live?.position?.rate === undefined && <option value="">{p.timelineLabels.unknown}</option>}{[0.5, 0.75, 1, 1.25, 1.5, 2].map(value => <option key={value} value={value}>{value}×</option>)}
      </PmSelect>
      {(planFailure || playbackFailure) && <PmToolbarButton asChild><PmButton small icon="refresh" onClick={() => setPlanReload(value => value + 1)}>{p.planRetry}</PmButton></PmToolbarButton>}
    </PmToolbar>
    {planFailure && <PmNotice tone="warn">{planFailure}</PmNotice>}
    {planCurrent && (playbackFailure || live?.error) && <PmNotice tone="warn">{productionFailure(playbackFailure ?? live?.error, locale)}</PmNotice>}
    {timingDraft ? <PmNotice tone="warn">{p.timingDraft}</PmNotice> : planCurrent && plan?.timing === 'estimated' ? <PmNotice tone="warn">{p.estimatedPlan}</PmNotice> : planCurrent && plan?.timing === 'unknown' ? <PmNotice tone="warn">{p.unknownPlan}</PmNotice> : planCurrent && !playbackConnected && !preparing ? <PmNotice>{p.playbackWaiting}</PmNotice> : null}
    {planCurrent && plan?.diagnostics.length ? <details className="pmw-production__issues"><summary>{p.issues(plan.diagnostics.length)}</summary><ul>{plan.diagnostics.map((issue, index) => {
      const page = issue.sectionId ? document.sections[issue.sectionId] : undefined, step = page && issue.stepId ? page.stepOrder.indexOf(issue.stepId) : -1
      return <li key={`${issue.code}:${issue.sectionId}:${issue.stepId}:${index}`}>{(p.diagnostics as Record<string, string>)[issue.code] ?? p.diagnosticFallback}{page && issue.stepId && step >= 0 && <PmButton small disabled={blocked || closing} onClick={() => select(page.id, issue.stepId!)}>{page.title} · {p.stepNumber(step)}</PmButton>}</li>
    })}</ul></details> : null}
    {!wide && <PmSegmented label={p.title} value={tab} options={[{ value: 'preview', label: p.preview }, { value: 'script', label: p.script }, { value: 'timeline', label: p.timeline }, { value: 'outputs', label: p.outputs }]} onChange={setTab} />}
    <div className="pmw-production__body" data-wide={wide || undefined} data-background={backgroundBody || undefined} aria-hidden={backgroundBody || undefined} {...backgroundBody ? { inert: '' } : {}}>
      {/* Hidden tabs retain a laid-out frame so its native animation clock can acknowledge preparation. */}
      <div className="pmw-production__visuals" data-background={backgroundVisuals || undefined} aria-hidden={backgroundVisuals || undefined} {...backgroundVisuals ? { inert: '' } : {}}>
        <div className="pmw-production__frame" hidden={!previewVisible}><PreviewPanel active={previewVisible} onPresentationAction={action => { if (action === 'refresh') void compile(); else onClose() }} /></div>
        {!previewVisible && <PmEmpty icon="slides" title={p.unavailable} action={<PmButton small loading={preparing} disabled={blocked || closing} onClick={() => void compile()}>{p.prepare}</PmButton>}>{p.previewHint}</PmEmpty>}
      </div>
      <div className="pmw-production__properties pm-ui-block-editor" hidden={!wide && tab !== 'script' || tab === 'outputs'}>
        <DocumentStepNarration sectionId={sectionId} stepId={stepId} expanded advanced panelId="production-step-fields" onPause={() => select(sectionId, stepId)} />
        <PmCard><DocumentVoiceField key={`${source.identity}:${stepId}`} stepId={stepId} disabled={blocked || closing}
          onGenerate={() => { workbench.stopAuditions(); setGenerateStep(stepId) }} /></PmCard>
        <ProductionRecording key={source.identity} identity={source.identity} sectionId={sectionId} stepId={stepId} active={tab !== 'outputs' && (wide || tab === 'script')} disabled={blocked || closing}
          onImported={assetId => { setMediaRefresh(true); setTranscriptionAsset({ identity: source.identity!, id: assetId }) }} onAdopted={() => setMediaRefresh(true)} />
        <ProductionTranscription key={source.identity} identity={source.identity} directory={source.directory} document={document} sectionId={sectionId} stepId={stepId}
          active={tab !== 'outputs' && (wide || tab === 'script')} disabled={blocked || closing} selectedAssetId={transcriptionAsset?.identity === source.identity ? transcriptionAsset.id : undefined} />
        <ProductionMediaClips key={`${source.identity}:${stepId}`} identity={source.identity} version={source.version ?? ''} document={document} sectionId={sectionId} stepId={stepId}
          binding={planCurrent ? plan?.binding : undefined} stepDurationMs={(() => { const step = planCurrent ? plan?.pages.find(page => page.sectionId === sectionId)?.steps.find(step => step.stepId === stepId) : undefined; return step?.timing === 'confirmed' && step.startMs !== undefined && step.endMs !== undefined ? step.endMs - step.startMs : undefined })()}
          disabled={blocked || closing || !declared || !source.version || Boolean(source.dirty || source.saving || source.restored || source.error)} onChanged={() => setMediaRefresh(true)} />
      </div>
      {tab === 'outputs' && <div className="pmw-production__outputs"><ExportPanel onClose={() => setTab('script')} /></div>}
    </div>
    <div className="pmw-production__timeline" data-wide={wide || undefined} hidden={tab === 'outputs' || !wide && tab !== 'timeline'}>
      <ProductionTimeline plan={plan} sectionId={sectionId} stepId={stepId} active={tab !== 'outputs' && (wide || tab === 'timeline')} current={planCurrent} seekEnabled={canPlay && !playerBusy && !preparing && !planBusy}
        loading={planBusy && !planCurrent} seeking={seeking} disabled={blocked || closing} onSelectStep={id => { const step = document.steps[id]; if (step) select(step.sectionId, id) }}
        onSeek={timeMs => { if (plan) void control({ binding: plan.binding, action: 'seek', timeMs }) }} />
    </div>
    {generateStep && <VoiceoverDialog key={`${source.identity}:${generateStep}`} stepId={generateStep} onClose={() => setGenerateStep(undefined)} />}
  </section>
}
