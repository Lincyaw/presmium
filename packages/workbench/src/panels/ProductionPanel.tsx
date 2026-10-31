import { useEffect, useRef, useState } from 'react'
import { keyBelongsToTarget, PRODUCTION_PLAYBACK_RATES, sameProductionBinding, watchFocusSource } from '@lincyaw/kernel'
import type { ProductionPlaybackCommand } from '@lincyaw/kernel'
import { PmBadge, PmButton, PmCard, PmDialog, PmEmpty, PmIconButton, PmNotice, PmPanelHeader, PmPopover, PmSearchList, PmSelect, PmSegmented, PmSplitGroup, PmSplitHandle, PmSplitPanel, PmTabs, PmTabPanel, PmToolbar, PmToolbarButton } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchState } from '../context.tsx'
import { DocumentStepNarration } from '../document-editor/DocumentStepNarration.tsx'
import { PRODUCTION_MESSAGES, productionFailure } from '../production-messages.ts'
import { SHORTCUTS } from '../shortcuts.ts'
import { isAgentChanging } from '../workbench.ts'
import type { PlaybackKey } from '../workbench.ts'
import { DocumentVoiceField } from './DocumentVoiceField.tsx'
import { ExportPanel } from './ExportPanel.tsx'
import { PreviewPanel } from './PreviewPanel.tsx'
import { VoiceoverDialog } from './VoiceoverDialog.tsx'
import { ProductionCaptionTiming } from './ProductionCaptionTiming.tsx'
import { ProductionTimeline } from './ProductionTimeline.tsx'
import { ProductionMediaClips } from './ProductionMediaClips.tsx'
import { ProductionRecording } from './ProductionRecording.tsx'
import { ProductionTranscription } from './ProductionTranscription.tsx'

const clockTime = (value?: number) => {
  if (value === undefined || !Number.isFinite(value)) return '--:--.---'
  const ms = Math.max(0, Math.round(value))
  return `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${(ms % 60000 / 1000).toFixed(3).padStart(6, '0')}`
}

const PLAYBACK_KEYS: Record<string, PlaybackKey> = { ' ': 'play-pause', ArrowLeft: 'previous', ArrowRight: 'next' }

/**
 * An explicit production workspace edits the same source; its preview has an independent compilation boundary.
 * While it is `active`, Space plays or pauses and the left and right arrows select the previous or next step, from the
 * workbench and from its preview alike; text entry, menus, dialogs and controls the keyboard moved to keep their keys.
 */
export function ProductionPanel({ onClose, closing, active = true }: { onClose(): void, closing: boolean, active?: boolean }) {
  const workbench = useWorkbench(), t = useMessages(), locale = useWorkbenchState(state => state.locale), p = PRODUCTION_MESSAGES[locale]
  const source = useWorkbenchState(state => state.authoring), position = useWorkbenchState(state => state.position)
  const stamp = useWorkbenchState(state => state.presentationSnapshot), view = useWorkbenchState(state => state.webView)
  const preparing = useWorkbenchState(state => Boolean(state.isPreparingPresentation))
  const plan = useWorkbenchState(state => state.productionPlan), playback = useWorkbenchState(state => state.productionPlayback)
  const playbackFailure = useWorkbenchState(state => state.productionFailure), connection = useWorkbenchState(state => state.previewConnection)
  const previewReload = useWorkbenchState(state => state.previewReload), timingDraft = useWorkbenchState(state => Boolean(state.hasDocumentTimingDrafts || state.documentTimingDraftStorageFailure))
  const captionDraftSteps = useWorkbenchState(state => state.captionTimingDraftSteps), captionStorageFailure = useWorkbenchState(state => state.captionTimingDraftStorageFailure)
  const frameCurrent = useWorkbenchState(state => Boolean(state.presentationSnapshot && state.previewIrRevision === state.presentationSnapshot.revision))
  const blocked = useWorkbenchState(state => Boolean(state.authoring?.loading || state.authoring?.composing) || isAgentChanging(state))
  const [wide, setWide] = useState(() => matchMedia('(min-width: 1100px)').matches), [tab, setTab] = useState('preview')
  const [libraryTab, setLibraryTab] = useState('pages'), [inspectorTab, setInspectorTab] = useState('script'), [outputsOpen, setOutputsOpen] = useState(false)
  const [generateStep, setGenerateStep] = useState<string>(), [failure, setFailure] = useState<string>()
  const [planBusy, setPlanBusy] = useState(false), [planFailure, setPlanFailure] = useState<string>(), [planReload, setPlanReload] = useState(0)
  const [playerBusy, setPlayerBusy] = useState(false), [seeking, setSeeking] = useState(false), controlRequest = useRef<AbortController>()
  const [enabling, setEnabling] = useState(false), [issuesOpen, setIssuesOpen] = useState(false)
  const [mediaRefresh, setMediaRefresh] = useState(false)
  const [transcriptionAsset, setTranscriptionAsset] = useState<{ identity: string, id: string, revision: number }>()
  const transcriptionSelection = useRef(0)
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
  const backgroundBody = !wide && tab === 'timeline', backgroundVisuals = !wide && tab !== 'preview'
  useEffect(() => workbench.observeVoiceoverJobs(), [workbench, source?.identity])
  useEffect(() => {
    const media = matchMedia('(min-width: 1100px)'), update = () => setWide(media.matches)
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
    if (!plan || !playbackConnected || preparing || blocked || timingDraft) { setPlayerBusy(false); return }
    setPlayerBusy(true)
    void workbench.controlProduction({ binding: plan.binding, action: 'load' }, controller.signal).catch(() => {}).finally(() => { if (!controller.signal.aborted) setPlayerBusy(false) })
    return () => controller.abort()
  }, [workbench, plan?.binding.planId, playbackConnected, connection, preparing, blocked, timingDraft])
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
  const playbackKey = useRef<(key: PlaybackKey) => void>(() => {})
  playbackKey.current = key => {
    if (blocked || closing || !document || !sectionId || !stepId) return
    if (key === 'play-pause') {
      if (plan && canPlay && !playerBusy && !planBusy && !preparing && !seeking) void control({ binding: plan.binding, action: live?.position?.playing ? 'pause' : 'play' })
      return
    }
    // Steps run on across pages and stop at the first and the last.
    const steps = document.sectionOrder.flatMap(page => document.sections[page]?.stepOrder.map(step => ({ page, step })) ?? [])
    const at = steps.findIndex(item => item.page === sectionId && item.step === stepId), next = at < 0 ? undefined : steps[at + (key === 'next' ? 1 : -1)]
    if (next) select(next.page, next.step)
  }
  useEffect(() => {
    if (!active) return
    watchFocusSource()
    const press = (event: KeyboardEvent) => {
      const key = PLAYBACK_KEYS[event.key]
      if (!key || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || keyBelongsToTarget(event)) return
      // Taken before the focused control sees it: Space would press the button clicked last, the arrows move in its toolbar.
      event.preventDefault(); event.stopPropagation()
      if (!(event.repeat && key === 'play-pause')) playbackKey.current(key)
    }
    window.addEventListener('keydown', press, true)
    const stop = workbench.observePlaybackKeys(key => playbackKey.current(key))
    return () => { window.removeEventListener('keydown', press, true); stop() }
  }, [workbench, active])
  const enable = async () => {
    if (blocked || closing || enabling) return
    setFailure(undefined); setEnabling(true)
    try { await workbench.enableDocumentProduction(); if (owner.current.active) { workbench.cancelPreviewPreparation(); await compile() } }
    catch (error) { if (owner.current.active) setFailure(productionFailure(error, locale)) }
    finally { if (owner.current.active) setEnabling(false) }
  }
  if (!source?.identity || !document || !section || !sectionId || !stepId) return <PmEmpty icon="video">{t.noSections}</PmEmpty>
  const feedback = [...new Set([
    captionStorageFailure && p.captionStorageFailed,
    captionDraftSteps?.length && p.captionDraft,
    failure, planFailure,
    planCurrent && (playbackFailure || live?.error) && productionFailure(playbackFailure ?? live?.error, locale),
    timingDraft ? p.timingDraft : planCurrent && plan?.timing === 'estimated' ? p.estimatedPlan : planCurrent && plan?.timing === 'unknown' ? p.unknownPlan : planCurrent && !playbackConnected && !preparing ? p.playbackWaiting : undefined,
  ].filter((message): message is string => typeof message === 'string' && Boolean(message)))]
  const diagnostics = planCurrent ? plan?.diagnostics ?? [] : []
  const issueCount = diagnostics.length + feedback.length
  const summary = failure ?? planFailure ?? (diagnostics[0] && ((p.diagnostics as Record<string, string>)[diagnostics[0].code] ?? p.diagnosticFallback)) ?? feedback[0]
  const pageIndex = document.sectionOrder.indexOf(sectionId)
  const mediaEditor = <ProductionMediaClips key={`${source.identity}:${stepId}`} identity={source.identity} version={source.version ?? ''} document={document} sectionId={sectionId} stepId={stepId}
    binding={planCurrent ? plan?.binding : undefined} stepDurationMs={(() => { const step = planCurrent ? plan?.pages.find(page => page.sectionId === sectionId)?.steps.find(step => step.stepId === stepId) : undefined; return step?.timing === 'confirmed' && step.startMs !== undefined && step.endMs !== undefined ? step.endMs - step.startMs : undefined })()}
    disabled={blocked || closing || !declared || !source.version || Boolean(source.dirty || source.saving || source.restored || source.error)} onChanged={() => setMediaRefresh(true)} />
  return <section className="pmw-production" aria-label={p.title}>
    <PmPanelHeader title={p.title} meta={document.metadata.title}
      leading={<PmIconButton small icon="arrow-left" label={p.back} loading={closing} onClick={onClose} />}
      actions={<>
        <PmBadge tone={sourceCurrent && frameCurrent ? 'ok' : preparing || sourceCurrent ? 'accent' : 'warn'}>{sourceCurrent && frameCurrent ? p.current : preparing || sourceCurrent ? p.preparing : p.outdated}</PmBadge>
        {issueCount > 0 && <PmPopover open={issuesOpen} onOpenChange={setIssuesOpen} label={p.issues(issueCount)} trigger={<PmButton small icon="warning" title={summary} aria-label={p.issues(issueCount)}>{p.issueCount(issueCount)}</PmButton>}>
          <div className="pmw-production__feedback">
            {feedback.map(message => <PmNotice key={message} tone="warn">{message}</PmNotice>)}
            {captionDraftSteps?.length ? document.sectionOrder.flatMap(pageId => document.sections[pageId]?.stepOrder.map((id, index) => captionDraftSteps.includes(id) ? <PmButton key={id} small onClick={() => { select(pageId, id); setIssuesOpen(false) }}>{document.sections[pageId]!.title} · {p.stepNumber(index)}</PmButton> : null) ?? []) : null}
            {diagnostics.map((issue, index) => {
              const page = issue.sectionId ? document.sections[issue.sectionId] : undefined, step = page && issue.stepId ? page.stepOrder.indexOf(issue.stepId) : -1
              return <PmCard key={`${issue.code}:${issue.sectionId}:${issue.stepId}:${index}`}>
                <p>{(p.diagnostics as Record<string, string>)[issue.code] ?? p.diagnosticFallback}</p>
                {page && issue.stepId && step >= 0 && <PmButton small disabled={blocked || closing} onClick={() => { select(page.id, issue.stepId!); setIssuesOpen(false) }}>{page.title} · {p.stepNumber(step)}</PmButton>}
              </PmCard>
            })}
          </div>
        </PmPopover>}
        <PmIconButton small icon="refresh" label={p.prepare} loading={preparing} disabled={blocked || closing} onClick={() => void compile()} />
        <PmButton small variant="accent" icon="export" disabled={closing} onClick={() => setOutputsOpen(true)}>{p.outputs}</PmButton>
      </>} />
    {!declared && <PmNotice tone="accent"><span>{p.enableHint}</span><PmButton small loading={enabling} disabled={blocked || closing} onClick={() => void enable()}>{p.enable}</PmButton></PmNotice>}
    {!wide && <PmSegmented label={p.title} value={tab} options={[{ value: 'library', label: p.library }, { value: 'preview', label: p.preview }, { value: 'properties', label: p.properties }, { value: 'timeline', label: p.timeline }]} onChange={setTab} />}
    <PmSplitGroup orientation="vertical" disabled={!wide} className="pmw-production__workarea">
      <PmSplitPanel id="production-main" defaultSize="71%" minSize={wide ? '32%' : 0} className="pmw-production__main" background={backgroundBody}>
        <PmSplitGroup disabled={!wide} className="pmw-production__body">
          <PmSplitPanel id="production-library" defaultSize="18%" minSize={wide ? '12%' : 0} maxSize={wide ? '30%' : '100%'} className="pmw-production__library" hidden={!wide && tab !== 'library'}>
            <PmPanelHeader title={p.library} />
            <PmTabs variant="dock" value={libraryTab} label={p.library} tabs={[{ value: 'pages', label: p.pages, icon: 'slides' }, { value: 'media', label: p.media, icon: 'audio' }]} onValueChange={setLibraryTab}>
              <PmTabPanel value="pages" keepMounted>
                <PmSearchList label={p.pages} searchLabel={p.searchPages} searchPlaceholder={p.searchPages} value={sectionId} disabled={blocked || closing}
                  items={document.sectionOrder.map((id, index) => ({ value: id, label: `${String(index + 1).padStart(2, '0')} · ${document.sections[id]!.title}`, description: p.pageSteps(document.sections[id]!.stepOrder.length), icon: 'slides' }))}
                  onValueChange={id => { const step = document.sections[id]?.stepOrder[0]; if (step) select(id, step) }} resultsLabel={p.pageResults} emptyLabel={p.noPages} loadingLabel={p.planLoading} />
              </PmTabPanel>
              <PmTabPanel value="media" keepMounted>{mediaEditor}</PmTabPanel>
            </PmTabs>
          </PmSplitPanel>
          {wide && <PmSplitHandle label={p.resizeLibrary} />}
          <PmSplitPanel id="production-visuals" defaultSize="56%" minSize={wide ? '30%' : 0} className="pmw-production__visuals" background={backgroundVisuals}>
            <PmPanelHeader title={p.preview} meta={`${pageIndex + 1} · ${section.title}`} />
            <div className="pmw-production__frame" hidden={!previewVisible}><PreviewPanel active={previewVisible} playbackKeys onPresentationAction={action => { if (action === 'refresh') void compile(); else onClose() }} /></div>
            {!previewVisible && <PmEmpty icon="slides" title={p.unavailable} action={<PmButton small loading={preparing} disabled={blocked || closing} onClick={() => void compile()}>{p.prepare}</PmButton>}>{p.previewHint}</PmEmpty>}
            <div className="pmw-production__monitor-tools">
              <PmToolbar scroll label={p.step}>{section.stepOrder.map((id, index) => <PmToolbarButton asChild key={id}><PmButton small aria-label={p.stepNumber(index)} aria-pressed={stepId === id} disabled={blocked || closing} onClick={() => select(sectionId, id)}>{index + 1}</PmButton></PmToolbarButton>)}</PmToolbar>
              <PmToolbar label={p.timeline} className="pmw-production__transport">
                <output aria-label={p.timelineLabels.position}>{clockTime(live?.position?.timeMs)} / {clockTime(planCurrent ? plan?.durationMs : undefined)}</output>
                <PmToolbarButton asChild><PmIconButton small icon={live?.position?.playing ? 'pause' : 'play'} label={live?.position?.playing ? p.pause : p.play} shortcut={SHORTCUTS.playPause} aria-keyshortcuts="Space" loading={playerBusy} disabled={!canPlay || planBusy || preparing || blocked || closing || seeking} onClick={() => { if (plan) void control({ binding: plan.binding, action: live?.position?.playing ? 'pause' : 'play' }) }} /></PmToolbarButton>
                <PmSelect label={p.rate} labelHidden value={live?.position?.rate === undefined ? '' : String(live.position.rate)} disabled={!canPlay || playerBusy || planBusy || preparing || blocked || closing || seeking} onChange={event => { if (plan) void control({ binding: plan.binding, action: 'rate', rate: Number(event.target.value) }) }}>
                  {live?.position?.rate === undefined && <option value="">{p.timelineLabels.unknown}</option>}{PRODUCTION_PLAYBACK_RATES.map(value => <option key={value} value={value}>{value}×</option>)}
                </PmSelect>
                {(planFailure || playbackFailure) && <PmToolbarButton asChild><PmIconButton small icon="refresh" label={p.planRetry} onClick={() => setPlanReload(value => value + 1)} /></PmToolbarButton>}
              </PmToolbar>
            </div>
          </PmSplitPanel>
          {wide && <PmSplitHandle label={p.resizeProperties} />}
          <PmSplitPanel id="production-properties" defaultSize="26%" minSize={wide ? '20%' : 0} maxSize={wide ? '42%' : '100%'} className="pmw-production__properties" hidden={!wide && tab !== 'properties'}>
            <PmPanelHeader title={p.properties} meta={p.stepNumber(section.stepOrder.indexOf(stepId))} />
            <PmTabs variant="dock" value={inspectorTab} label={p.properties} tabs={[{ value: 'script', label: p.narration }, { value: 'voice', label: p.voiceTab }, { value: 'captions', label: p.captionsTab }]} onValueChange={setInspectorTab}>
              <PmTabPanel value="script" keepMounted><div className="pmw-production__fields pm-ui-block-editor">
                <DocumentStepNarration sectionId={sectionId} stepId={stepId} expanded advanced panelId="production-step-fields" onPause={() => select(sectionId, stepId)} />
              </div></PmTabPanel>
              <PmTabPanel value="voice" keepMounted><div className="pmw-production__fields">
                <DocumentVoiceField key={`${source.identity}:${stepId}`} stepId={stepId} disabled={blocked || closing} onGenerate={() => { workbench.stopAuditions(); setGenerateStep(stepId) }} />
                <ProductionRecording key={source.identity} identity={source.identity} sectionId={sectionId} stepId={stepId} active={!outputsOpen && (wide || tab === 'properties') && inspectorTab === 'voice'} disabled={blocked || closing}
                  onImportStarted={() => transcriptionSelection.current}
                  onImported={(assetId, selection) => {
                    setMediaRefresh(true)
                    if (selection === transcriptionSelection.current) setTranscriptionAsset({ identity: source.identity!, id: assetId, revision: ++transcriptionSelection.current })
                  }} onAdopted={() => setMediaRefresh(true)} />
                <ProductionTranscription key={source.identity} identity={source.identity} directory={source.directory} document={document} sectionId={sectionId} stepId={stepId}
                  active={!outputsOpen && (wide || tab === 'properties') && inspectorTab === 'voice'} disabled={blocked || closing}
                  selectedAsset={transcriptionAsset?.identity === source.identity ? transcriptionAsset : undefined}
                  onSelectAsset={() => { transcriptionSelection.current++; setTranscriptionAsset(undefined) }} />
              </div></PmTabPanel>
              <PmTabPanel value="captions" keepMounted><ProductionCaptionTiming key={source.identity} identity={source.identity} stepId={stepId} plan={plan} current={planCurrent} loading={preparing || planBusy} disabled={blocked || closing} onChanged={() => setMediaRefresh(true)} /></PmTabPanel>
            </PmTabs>
          </PmSplitPanel>
        </PmSplitGroup>
      </PmSplitPanel>
      {wide && <PmSplitHandle label={p.resizeTimeline} />}
      <PmSplitPanel id="production-timeline" defaultSize="29%" minSize={wide ? '18%' : 0} maxSize={wide ? '65%' : '100%'} scroll className="pmw-production__timeline" hidden={!wide && tab !== 'timeline'}>
        <ProductionTimeline plan={plan} sectionId={sectionId} stepId={stepId} active={wide || tab === 'timeline'} current={planCurrent} seekEnabled={canPlay && !playerBusy && !preparing && !planBusy}
          loading={planBusy && !planCurrent} seeking={seeking} disabled={blocked || closing} onSelectStep={id => { const step = document.steps[id]; if (step) select(step.sectionId, id) }}
          onSeek={timeMs => { if (plan) void control({ binding: plan.binding, action: 'seek', timeMs }) }} />
      </PmSplitPanel>
    </PmSplitGroup>
    <PmDialog open={outputsOpen} label={p.outputs} closeLabel={t.close} onClose={() => setOutputsOpen(false)}>{outputsOpen && <ExportPanel embedded onClose={() => setOutputsOpen(false)} />}</PmDialog>
    {generateStep && <VoiceoverDialog key={`${source.identity}:${generateStep}`} stepId={generateStep} onClose={() => setGenerateStep(undefined)} />}
  </section>
}
