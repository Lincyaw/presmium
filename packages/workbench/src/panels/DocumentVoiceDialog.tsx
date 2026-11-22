import { useEffect, useRef, useState } from 'react'
import type { SpeechEngineInfo, VoiceCatalogAnswer, VoiceSource } from '@lincyaw/kernel'
import { Audition } from '../audition.ts'
import type { AuditionState } from '../audition.ts'
import { PmButton, PmDialog, PmField, PmInput, PmNotice, PmSearchList, PmSegmented, PmSelect } from '../components.tsx'
import { useWorkbench, useWorkbenchState } from '../context.tsx'
import { documentVoiceStepIds, previewDocumentVoiceChange, resolveDocumentStepVoice } from '../document-voices.ts'
import type { DocumentVoiceScope } from '../document-voices.ts'
import { readVoiceCatalog } from '../voice-catalog.ts'
import { readVoiceDraft, voiceDraftStorageStatus } from '../voice-drafts.ts'
import type { VoiceDraft } from '../voice-drafts.ts'
import { PRODUCTION_MESSAGES } from '../production-messages.ts'
import { VOICE_CLONE_MESSAGES } from '../voice-clone-messages.ts'
import { VOICE_MESSAGES, voiceFailure } from '../voice-messages.ts'
import { voiceDescription } from '../voice-names.ts'
import { prepareVoiceSnapshot, voiceSnapshotCurrent } from '../voice-snapshot.ts'
import { isAgentChanging } from '../workbench-state.ts'
import { VoiceCloneDialog } from './VoiceCloneDialog.tsx'
import { VoiceScopeField } from './VoiceScopeField.tsx'
import { effectiveOf } from '../effective-settings.ts'

const supportsLanguage = (languages: string[], lang: string) => !languages.length || languages.some(value => value.toLowerCase().split('-')[0] === lang.toLowerCase().split('-')[0])

/**
 * Choosing a voice: by default for the whole document, applied by one command, with the steps that have their own
 * voice kept. The scope, silence, a step's own setting, the rate and the style are the further settings.
 */
export function DocumentVoiceDialog({ stepId, mode = 'document', onClose, onApplied }: { stepId: string, mode?: 'document' | 'step', onClose(): void, onApplied?(): void }) {
  const workbench = useWorkbench(), actor = useWorkbenchState(state => state.authoring), locale = useWorkbenchState(state => state.locale)
  const blocked = useWorkbenchState(state => Boolean(state.authoring?.loading || state.authoring?.composing) || isAgentChanging(state))
  const t = VOICE_MESSAGES[locale], p = PRODUCTION_MESSAGES[locale], c = VOICE_CLONE_MESSAGES[locale]
  const serviceVersion = useWorkbenchState(state => state.voiceServiceVersion)
  const identity = useRef(actor!.identity!).current, directory = useRef(actor!.directory).current
  const initial = (): VoiceDraft => {
    const effective = effectiveOf(actor!.content!, actor!.inherited)!
    if (mode === 'document') {
      const value = effective.production.defaults.voiceSource
      return { version: actor!.version!, scope: { kind: 'document' }, source: value?.type === 'tts' ? value : { type: 'tts', voice: { voice: '' } }, replaceOverrides: false }
    }
    const source: VoiceSource | null = resolveDocumentStepVoice(effective, stepId).value ?? null
    return { version: actor!.version!, scope: { kind: 'step', stepId }, source, replaceOverrides: false }
  }
  const [restored, setRestored] = useState(() => readVoiceDraft(workbench.client, identity, stepId))
  const [draft, setDraft] = useState<VoiceDraft>(() => restored ?? initial())
  const [more, setMore] = useState(mode === 'step' || Boolean(restored && restored.scope.kind !== 'document'))
  const [storageFailed, setStorageFailed] = useState(() => voiceDraftStorageStatus(workbench.client, identity, stepId) !== 'available')
  const [engineFilter, setEngineFilter] = useState(draft.source?.type === 'tts' ? draft.source.voice.engine : undefined)
  const [query, setQuery] = useState(''), [catalog, setCatalog] = useState<VoiceCatalogAnswer>()
  const [catalogBusy, setCatalogBusy] = useState(true), [catalogFailure, setCatalogFailure] = useState<string>(), [reload, setReload] = useState(0)
  const pending = useRef(false), composing = useRef(false)
  const [busy, renderBusy] = useState(false), [failure, setFailure] = useState<string>(), [cloning, setCloning] = useState(false)
  const [listening, setListening] = useState<AuditionState>({ status: 'idle' })
  const owner = useRef({ active: true, generation: 0 }), request = useRef<AbortController>(), player = useRef<Audition>()
  useEffect(() => {
    const audition = player.current = new Audition(workbench)
    const stop = audition.subscribe(() => { if (owner.current.active) setListening(audition.snapshot()) })
    return () => { owner.current.active = false; owner.current.generation++; request.current?.abort(); stop(); audition.dispose() }
  }, [])
  const lang = effectiveOf(actor?.content, actor?.inherited)?.metadata.lang ?? 'zh-CN'
  useEffect(() => {
    const controller = new AbortController()
    setCatalogBusy(true); setCatalogFailure(undefined)
    void readVoiceCatalog(workbench.client, directory, engineFilter, lang, serviceVersion).then(value => {
      if (!controller.signal.aborted) setCatalog(value)
    }, error => { if (!controller.signal.aborted) setCatalogFailure(voiceFailure(error, locale)) }).finally(() => { if (!controller.signal.aborted) setCatalogBusy(false) })
    return () => controller.abort()
  }, [workbench, directory, engineFilter, reload, lang, locale, serviceVersion])
  const document = actor?.content, validTarget = actor?.identity === identity && Boolean(document?.steps[stepId])
  const engineId = engineFilter ?? catalog?.engine
  const engines = catalog?.engines.filter(engine => engine.tts) ?? []
  const engine: SpeechEngineInfo | undefined = engines.find(engine => engine.id === (draft.source?.type === 'tts' ? draft.source.voice.engine ?? engineId : engineId))
  const voices = catalog?.catalog.status === 'available' ? catalog.catalog.voices : []
  const spoken = voices.filter(voice => supportsLanguage(voice.lang, lang))
  // The document's own language and region first: 普通话 before 粤语 for a zh-CN document.
  const listed = (spoken.length ? spoken : voices).map((voice, index) => ({ voice, rank: voice.lang.some(tag => tag.toLowerCase() === lang.toLowerCase()) ? 0 : 1, index }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index).map(entry => entry.voice)
  const rateRange = engine?.parameters?.rate, styles = engine?.parameters?.styles
  const normalizedRate = draft.rateInput?.normalize('NFKC').trim()
  const rate = normalizedRate ? Number(normalizedRate) : undefined
  const rateInvalid = draft.rateInput !== undefined && normalizedRate !== undefined && normalizedRate.length > 0 && (!rateRange || !/^\d+(?:\.\d+)?$/.test(normalizedRate) || !Number.isFinite(rate) || rate! < rateRange.min || rate! > rateRange.max)
  const sourceType = draft.source === null ? 'inherit' : draft.source.type
  const current = () => owner.current.active && workbench.getState().authoring?.identity === identity
  const unavailable = useRef(false)
  unavailable.current = blocked || cloning
  const setBusy = (value: boolean) => { pending.current = value; renderBusy(value); workbench.refreshAuthoringClientControls() }
  useEffect(() => workbench.production.registerDraftView({ identity, kind: 'voice', has: key => current() && key === stepId,
    blocked: () => composing.current || pending.current || unavailable.current,
    clear: () => {
      const actual = workbench.getState().authoring, content = workbench.getDocument(identity)
      if (!actual?.version || !content) return
      owner.current.generation++; request.current?.abort(); request.current = undefined
      const value: VoiceDraft = { version: actual.version, scope: { kind: 'step', stepId }, source: resolveDocumentStepVoice(effectiveOf(content, actual.inherited), stepId).value ?? null, replaceOverrides: false }
      setDraft(value); setRestored(undefined); setStorageFailed(false); setFailure(undefined)
      setEngineFilter(value.source?.type === 'tts' ? value.source.voice.engine : undefined); setQuery('')
    } }), [workbench, identity, stepId])
  useEffect(() => workbench.registerNavigationGuard(() => current() && (composing.current || pending.current || unavailable.current)), [workbench, identity])
  useEffect(() => { workbench.refreshAuthoringClientControls() }, [workbench, blocked, busy, cloning])
  // Nothing chosen yet: the first voice for the document's language is suggested, so one command applies it.
  const suggested = draft.source?.type === 'tts' && !draft.source.voice.voice && catalog?.catalog.status === 'available' ? listed.find(voice => supportsLanguage(voice.lang, lang)) : undefined
  useEffect(() => {
    if (suggested && draft.source?.type === 'tts' && !draft.source.voice.voice) setDraft({ ...draft, source: { type: 'tts', voice: { ...engineId ? { engine: engineId } : {}, voice: suggested.id } } })
  }, [suggested?.id])
  const edit = (value: VoiceDraft) => {
    request.current?.abort(); owner.current.generation++
    setBusy(false); setFailure(undefined); player.current?.stop()
    setDraft(value); setStorageFailed(!workbench.production.keepVoiceDraft(identity, stepId, value))
  }
  const impact = (() => {
    if (!document || !validTarget) return undefined
    try {
      return { steps: documentVoiceStepIds(document, draft.scope).length, ...previewDocumentVoiceChange(document, draft.scope, draft.source, { replaceOverrides: draft.replaceOverrides }) }
    } catch { return undefined }
  })()
  const apply = async () => {
    if (!current() || !validTarget || blocked || draft.source?.type === 'tts' && (rateInvalid || !draft.source.voice.voice.trim())) return
    const generation = ++owner.current.generation, controller = new AbortController()
    request.current?.abort(); request.current = controller; setBusy(true); setFailure(undefined); player.current?.stop()
    try {
      await workbench.flushPendingEdits(controller.signal)
      if (!current() || generation !== owner.current.generation) return
      const source = workbench.getState().authoring
      if (!source?.version || !source.fingerprint || source.dirty || source.saving || source.error || source.restored || source.composing) throw new Error('voice-context-changed')
      const proposal: VoiceDraft = { ...draft, version: source.version }
      const saved = await workbench.production.applyVoice(proposal.scope, proposal.source, { replaceOverrides: proposal.replaceOverrides }, { identity, version: source.version, fingerprint: source.fingerprint })
      if (!current() || generation !== owner.current.generation) return
      if (!saved) throw new Error('voice-context-changed')
      workbench.production.clearVoiceDraft(identity, stepId, draft)
      onApplied?.()
      onClose()
    } catch (error) { if (current() && generation === owner.current.generation) setFailure(voiceFailure(error, locale)) }
    finally { if (current() && generation === owner.current.generation) setBusy(false) }
  }
  // A sample is played at once: the dialog says beforehand where the text goes.
  const listen = async (sample: 'sample' | 'step') => {
    const audition = player.current
    if (!audition || draft.source?.type !== 'tts' || rateInvalid || !validTarget || blocked) return
    if (listening.status === 'playing' || listening.status === 'loading') { audition.stop(); return }
    const voice = draft.source.voice
    setFailure(undefined)
    void audition.play(async signal => {
      const snapshot = await prepareVoiceSnapshot(workbench, stepId, signal)
      const quote = await workbench.client.readVoicePreview(directory, { revision: snapshot.revision, voice, mode: sample, ...sample === 'step' ? { target: snapshot.target } : {} }, signal)
      if (!voiceSnapshotCurrent(workbench, snapshot) || quote.source.version !== snapshot.source.version || quote.source.fingerprint !== snapshot.source.fingerprint || quote.source.documentId !== snapshot.source.documentId) throw new Error('voice-context-changed')
      const answer = await workbench.client.previewVoice(directory, { revision: quote.revision, source: quote.source, voice: quote.voice, mode: quote.mode, ...quote.target ? { target: quote.target } : {}, quote: quote.quote, confirmed: true }, signal)
      return { audio: answer.audio }
    })
  }
  const playing = listening.status === 'playing' || listening.status === 'loading'
  if (!document || !validTarget) return <PmDialog open label={t.settings} closeLabel={t.close} onClose={onClose}><PmNotice tone="warn">{p.draftChanged}</PmNotice></PmDialog>
  const ready = !blocked && !rateInvalid && !(draft.source?.type === 'tts' && !draft.source.voice.voice.trim()) && !(draft.scope.kind === 'steps' && !draft.scope.stepIds.length)
  return <>
    <PmDialog open label={mode === 'step' ? t.stepSettings : t.settings} closeLabel={t.close} onClose={onClose} footer={<><PmButton onClick={onClose}>{t.cancel}</PmButton><PmButton loading={busy} disabled={!ready} variant="primary" onClick={() => void apply()}>{draft.source?.type === 'tts' ? t.useVoice : t.apply}</PmButton></>}>
      <div className="pmw-voice__form" onCompositionStartCapture={() => { composing.current = true; workbench.refreshAuthoringClientControls() }} onCompositionEndCapture={() => { composing.current = false; workbench.refreshAuthoringClientControls() }}>
        {restored && <PmNotice tone="accent">{t.draftRecovered}</PmNotice>}
        {storageFailed && <PmNotice tone="warn">{t.recoveryFailed}</PmNotice>}
        {failure && <PmNotice tone="danger">{failure}</PmNotice>}
        {more && <>
          <VoiceScopeField document={document} stepId={stepId} value={draft.scope} disabled={busy || blocked} onChange={scope => edit({ ...draft, scope, replaceOverrides: scope.kind === 'steps' && draft.source === null ? true : scope.kind === 'step' ? false : draft.replaceOverrides })} />
          <PmField label={t.source} group><PmSegmented label={t.source} value={sourceType} disabled={busy || blocked} options={[
            { value: 'tts', label: t.voice }, { value: 'none', label: p.none }, ...draft.scope.kind !== 'document' ? [{ value: 'inherit', label: t.inherit }] : [],
            ...sourceType === 'recording' ? [{ value: 'recording', label: p.recording }] : [],
          ]} onChange={value => {
            if (value === 'none') edit({ ...draft, source: { type: 'none' }, rateInput: undefined })
            else if (value === 'inherit') edit({ ...draft, source: null, rateInput: undefined, replaceOverrides: draft.scope.kind === 'steps' ? true : draft.replaceOverrides })
            else if (value === 'tts') edit({ ...draft, source: { type: 'tts', voice: { ...engineId ? { engine: engineId } : {}, voice: '' } }, rateInput: undefined })
          }} /></PmField>
        </>}
        {draft.source?.type === 'recording' && <span>{document.assets[draft.source.assetId]?.title || p.recording}</span>}
        {draft.source?.type === 'tts' && <>
          {(engines.length > 1 || engineId && !engines.some(engine => engine.id === engineId)) && <PmSelect label={t.provider} value={engineId ?? ''} disabled={!engines.length || busy || blocked} onChange={event => { setEngineFilter(event.target.value); setQuery('') }}>
            {engines.map(engine => <option key={engine.id} value={engine.id}>{engine.provider}</option>)}
            {engineId && !engines.some(engine => engine.id === engineId) && <option value={engineId}>{t.savedEngineUnavailable}</option>}
          </PmSelect>}
          {catalogFailure && <PmButton small onClick={() => setReload(value => value + 1)}>{t.retry}</PmButton>}
          {catalog?.catalog.status === 'unavailable' && <PmNotice tone="warn">{catalog.catalog.reason === 'not-configured' ? t.noService : t.catalogUnsupported}</PmNotice>}
          {(catalogBusy || catalogFailure || catalog?.catalog.status === 'available') && <PmSearchList label={t.available} searchLabel={t.search} searchPlaceholder={t.searchPlaceholder} emptyLabel={t.empty} loadingLabel={t.loadingVoices} loading={catalogBusy} error={catalogFailure} disabled={busy || blocked || catalog?.catalog.status !== 'available'} query={query} onQueryChange={setQuery}
            value={draft.source.voice.engine === engineId || !draft.source.voice.engine ? draft.source.voice.voice : undefined}
            items={listed.map(voice => ({ value: voice.id, label: voice.label, description: [voiceDescription(voice, locale), voice.cloned ? c.cloned : '', supportsLanguage(voice.lang, lang) ? '' : t.languageMismatch].filter(Boolean).join(' · '), keywords: [voice.id, ...voice.lang, voiceDescription(voice, locale)], disabled: !supportsLanguage(voice.lang, lang) }))}
            resultsLabel={t.results} onValueChange={voice => edit({ ...draft, source: { type: 'tts', voice: { ...engineId ? { engine: engineId } : {}, voice } }, rateInput: undefined })} />}
          {engine?.clone && <div className="pmw-voice__actions"><PmButton small disabled={busy || blocked} onClick={() => setCloning(true)}>{c.open}</PmButton></div>}
          <div className="pmw-voice__actions">
            <PmButton small icon={playing ? 'pause' : 'audio'} loading={listening.status === 'loading'} disabled={busy || blocked || !draft.source.voice.voice || rateInvalid} onClick={() => void listen('sample')}>{playing ? t.stop : t.sample}</PmButton>
            {!playing && <PmButton small variant="text" disabled={busy || blocked || !draft.source.voice.voice || rateInvalid} onClick={() => void listen('step')}>{t.stepSample}</PmButton>}
          </div>
          {listening.status === 'failed' && <PmNotice tone="danger">{voiceFailure(new Error(listening.error), locale)}</PmNotice>}
          {engine && <span className="pm-ui-hint">{t.sendsText(engine.provider, engine.local)}</span>}
          {more && rateRange && <PmInput label={t.rate} width="number" inputMode="decimal" maxLength={32} value={draft.rateInput ?? (draft.source.voice.rate === undefined ? '' : String(draft.source.voice.rate))} error={rateInvalid ? t.rateInvalid(rateRange.min, rateRange.max) : undefined} disabled={busy || blocked} onChange={event => {
            if (draft.source?.type !== 'tts') return
            const raw = event.target.value, normalized = raw.normalize('NFKC').trim(), value = Number(normalized)
            const valid = /^\d+(?:\.\d+)?$/.test(normalized) && Number.isFinite(value) && value >= rateRange.min && value <= rateRange.max
            const voice = { ...draft.source.voice }
            if (!normalized) delete voice.rate
            else if (valid) voice.rate = value
            edit({ ...draft, rateInput: raw, source: { type: 'tts', voice } })
          }} />}
          {more && styles?.length ? <PmSelect label={t.style} value={draft.source.voice.style ?? ''} disabled={busy || blocked} onChange={event => {
            if (draft.source?.type !== 'tts') return
            const voice = { ...draft.source.voice }
            if (event.target.value) voice.style = event.target.value; else delete voice.style
            edit({ ...draft, source: { type: 'tts', voice } })
          }}><option value="">{t.styleDefault}</option>{styles.map(style => <option key={style} value={style}>{style}</option>)}</PmSelect> : null}
        </>}
        {more && draft.scope.kind !== 'step' && !(draft.scope.kind === 'steps' && draft.source === null) && impact && impact.overrides.pages + impact.overrides.steps > 0 && <PmField label={t.replace} group><PmSegmented label={t.replace} value={draft.replaceOverrides ? 'replace' : 'preserve'} disabled={busy || blocked} options={[{ value: 'preserve', label: t.preserve }, { value: 'replace', label: t.replaceAll }]} onChange={value => edit({ ...draft, replaceOverrides: value === 'replace' })} /></PmField>}
        {impact && <span className="pm-ui-hint">{t.appliesTo(impact.steps - impact.preserved)}{impact.preserved > 0 ? ` ${t.keptSteps(impact.preserved)}` : ''}</span>}
        <div className="pmw-voice__actions"><PmButton small variant="text" aria-expanded={more} onClick={() => setMore(value => !value)}>{more ? t.fewer : t.more}</PmButton></div>
      </div>
    </PmDialog>
    {cloning && engine && <VoiceCloneDialog directory={directory} engine={engine} lang={lang} onClose={() => setCloning(false)} onUse={(voice) => {
      setCloning(false); setReload(value => value + 1)
      edit({ ...draft, source: { type: 'tts', voice: { engine: engine.id, voice } }, rateInput: undefined })
    }} />}
  </>
}
