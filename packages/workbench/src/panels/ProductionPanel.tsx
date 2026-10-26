import { useEffect, useRef, useState } from 'react'
import { PmBadge, PmButton, PmCard, PmEmpty, PmField, PmIconButton, PmNotice, PmSelect, PmSegmented, PmToolbar, PmToolbarButton } from '../components.tsx'
import { useMessages, useWorkbench, useWorkbenchState } from '../context.tsx'
import { DocumentStepNarration } from '../document-editor/DocumentStepNarration.tsx'
import { resolveDocumentStepVoice } from '../document-voices.ts'
import { PRODUCTION_MESSAGES } from '../production-messages.ts'
import { isAgentChanging } from '../workbench.ts'
import { DocumentVoiceDialog } from './DocumentVoiceDialog.tsx'
import { ExportPanel } from './ExportPanel.tsx'
import { PreviewPanel } from './PreviewPanel.tsx'
import { VoiceoverDialog } from './VoiceoverDialog.tsx'

/** An explicit production workspace edits the same source; its preview has an independent compilation boundary. */
export function ProductionPanel({ onClose, closing }: { onClose(): void, closing: boolean }) {
  const workbench = useWorkbench(), t = useMessages(), locale = useWorkbenchState(state => state.locale), p = PRODUCTION_MESSAGES[locale]
  const source = useWorkbenchState(state => state.authoring), position = useWorkbenchState(state => state.position)
  const stamp = useWorkbenchState(state => state.presentationSnapshot), view = useWorkbenchState(state => state.webView)
  const preparing = useWorkbenchState(state => Boolean(state.isPreparingPresentation))
  const frameCurrent = useWorkbenchState(state => Boolean(state.presentationSnapshot && state.previewIrRevision === state.presentationSnapshot.revision))
  const blocked = useWorkbenchState(state => Boolean(state.authoring?.loading || state.authoring?.composing) || isAgentChanging(state))
  const [wide, setWide] = useState(() => matchMedia('(min-width: 1280px)').matches), [tab, setTab] = useState('script')
  const [voiceStep, setVoiceStep] = useState<string>(), [generateStep, setGenerateStep] = useState<string>(), [failure, setFailure] = useState<string>()
  const owner = useRef({ active: true, generation: 0 }), initial = useRef(false)
  const document = source?.content, sectionId = position && document?.sections[position.section] ? position.section : document?.sectionOrder[0]
  const section = sectionId ? document?.sections[sectionId] : undefined
  const stepId = section?.stepOrder[position && position.section === sectionId ? position.step : 0] ?? section?.stepOrder[0]
  const sourceCurrent = Boolean(source && stamp && source.version === stamp.version && source.fingerprint === stamp.fingerprint && (source.projectRevision ?? 0) === stamp.project && !source.dirty && !source.saving && !source.error)
  const previewVisible = sourceCurrent && view === 'present'
  useEffect(() => {
    const media = matchMedia('(min-width: 1280px)'), update = () => setWide(media.matches)
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  useEffect(() => () => { owner.current.active = false; owner.current.generation++; workbench.cancelPreviewPreparation() }, [workbench])
  const compile = async () => {
    if (workbench.getState().isPreparingPresentation || !source?.identity) return
    const identity = source.identity, generation = ++owner.current.generation
    const current = () => owner.current.active && generation === owner.current.generation && workbench.getState().authoring?.identity === identity
    setFailure(undefined)
    try {
      await workbench.flushPendingEdits()
      if (!current()) return
      const prepared = await workbench.preparePresentation()
      if (!current()) return
      if (!prepared) { setFailure(workbench.getState().presentationFailure); return }
      workbench.setWebView('present')
    } catch { if (current()) setFailure(t.presentationCompileFailed) }
  }
  useEffect(() => { if (!initial.current) { initial.current = true; void compile() } }, [])
  const select = (page: string, step: string) => { workbench.stopAuditions(); workbench.selectDocumentStep(page, step) }
  if (!source?.identity || !document || !section || !sectionId || !stepId) return <PmEmpty icon="video">{t.noSections}</PmEmpty>
  const voice = resolveDocumentStepVoice(document, stepId)
  const voiceLabel = voice.value?.type === 'tts' ? voice.value.voice.voice : voice.value?.type === 'none' ? p.none : voice.value?.type === 'recording' ? document.assets[voice.value.assetId]?.location ?? voice.value.assetId : p.unset
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
    <div className="pmw-production__selection">
      <PmSelect label={p.page} value={sectionId} disabled={blocked || closing} onChange={event => { const page = document.sections[event.target.value]; if (page?.stepOrder[0]) select(page.id, page.stepOrder[0]) }}>{document.sectionOrder.map((id, index) => <option key={id} value={id}>{index + 1} · {document.sections[id]!.title}</option>)}</PmSelect>
      <PmField label={p.step} group><PmToolbar className="pmw-step-timeline__steps" label={p.step}>{section.stepOrder.map((id, index) => <PmToolbarButton asChild key={id}><PmButton small aria-pressed={stepId === id} disabled={blocked || closing} onClick={() => select(sectionId, id)}>{index + 1}</PmButton></PmToolbarButton>)}</PmToolbar></PmField>
    </div>
    {!wide && <PmSegmented label={p.title} value={tab} options={[{ value: 'preview', label: p.preview }, { value: 'script', label: p.script }, { value: 'outputs', label: p.outputs }]} onChange={setTab} />}
    <div className="pmw-production__body" data-wide={wide || undefined}>
      <div className="pmw-production__visuals" hidden={!wide && tab !== 'preview' || tab === 'outputs'}>
        <div className="pmw-production__frame" hidden={!previewVisible}><PreviewPanel active={previewVisible} /></div>
        {!previewVisible && <PmEmpty icon="slides" title={p.unavailable} action={<PmButton small loading={preparing} disabled={blocked || closing} onClick={() => void compile()}>{p.prepare}</PmButton>}>{p.previewHint}</PmEmpty>}
        <p className="pmw-pane__footer">{p.playbackHint}</p>
      </div>
      <div className="pmw-production__properties pm-ui-block-editor" hidden={!wide && tab !== 'script' || tab === 'outputs'}>
        <DocumentStepNarration sectionId={sectionId} stepId={stepId} expanded panelId="production-step-fields" onPause={() => select(sectionId, stepId)} />
        <PmCard><h2 className="pm-ui-card__title">{p.voice}</h2><PmField label={p.choose} hint={p.inherited[voice.inheritedFrom]}><span>{voiceLabel}</span></PmField>
          {voice.value?.type === 'recording' && <PmNotice tone="warn">{p.recordingLimit}</PmNotice>}
          <div className="pmw-voice__actions"><PmButton small icon="audio" disabled={blocked || closing} onClick={() => { workbench.stopAuditions(); setVoiceStep(stepId) }}>{p.choose}</PmButton><PmButton small icon="refresh" disabled={blocked || closing} onClick={() => { workbench.stopAuditions(); setGenerateStep(stepId) }}>{p.generate}</PmButton></div>
        </PmCard>
      </div>
      {tab === 'outputs' && <div className="pmw-production__outputs"><ExportPanel onClose={() => setTab('script')} /></div>}
    </div>
    {voiceStep && <DocumentVoiceDialog key={`${source.identity}:${voiceStep}`} stepId={voiceStep} onClose={() => setVoiceStep(undefined)} />}
    {generateStep && <VoiceoverDialog key={`${source.identity}:${generateStep}`} stepId={generateStep} onClose={() => setGenerateStep(undefined)} />}
  </section>
}
