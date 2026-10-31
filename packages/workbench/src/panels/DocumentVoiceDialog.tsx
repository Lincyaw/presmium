import { useEffect, useRef, useState } from 'react'
import type { SpeechEngineInfo, VoiceCatalogAnswer, VoicePreviewQuote } from '@lincyaw/kernel'
import { PmButton, PmDialog, PmField, PmInput, PmNotice, PmSearchList, PmSegmented, PmSelect } from '../components.tsx'
import { useWorkbench, useWorkbenchState } from '../context.tsx'
import { documentVoiceStepIds, previewDocumentVoiceChange, resolveDocumentStepVoice } from '../document-voices.ts'
import type { DocumentVoiceImpact } from '../document-voices.ts'
import { clearVoiceDraft, keepVoiceDraft, readVoiceDraft, voiceDraftStorageStatus } from '../voice-drafts.ts'
import type { VoiceDraft } from '../voice-drafts.ts'
import { PRODUCTION_MESSAGES } from '../production-messages.ts'
import { VOICE_CLONE_MESSAGES } from '../voice-clone-messages.ts'
import { VOICE_MESSAGES, voiceFailure } from '../voice-messages.ts'
import { prepareVoiceSnapshot, voiceSnapshotCurrent } from '../voice-snapshot.ts'
import type { VoiceSnapshot } from '../voice-snapshot.ts'
import { isAgentChanging } from '../workbench.ts'
import { VoiceCloneDialog } from './VoiceCloneDialog.tsx'
import { VoicePreviewDialog } from './VoicePreviewDialog.tsx'
import { VoiceScopeField } from './VoiceScopeField.tsx'

interface Review { draft: VoiceDraft, impact: DocumentVoiceImpact, scopeLabel: string, targets: string[], expected: { identity: string, version: string, fingerprint: string } }
const supportsLanguage = (languages: string[], lang: string) => !languages.length || languages.some(value => value.toLowerCase().split('-')[0] === lang.toLowerCase().split('-')[0])

/** Catalogue choices are drafts; one explicit, reviewed action changes the canonical source actor. */
export function DocumentVoiceDialog({ stepId, onClose }: { stepId: string, onClose(): void }) {
  const workbench = useWorkbench(), actor = useWorkbenchState(state => state.authoring), locale = useWorkbenchState(state => state.locale)
  const blocked = useWorkbenchState(state => Boolean(state.authoring?.loading || state.authoring?.composing) || isAgentChanging(state))
  const t = VOICE_MESSAGES[locale], p = PRODUCTION_MESSAGES[locale], c = VOICE_CLONE_MESSAGES[locale]
  const serviceVersion = useWorkbenchState(state => state.voiceServiceVersion)
  const identity = useRef(actor!.identity!).current, directory = useRef(actor!.directory).current
  const [restored] = useState(() => readVoiceDraft(workbench.client, identity, stepId))
  const [draft, setDraft] = useState<VoiceDraft>(() => restored ?? { version: actor!.version!, scope: { kind: 'step', stepId }, source: resolveDocumentStepVoice(actor!.content!, stepId).value ?? null, replaceOverrides: false })
  const [storageFailed, setStorageFailed] = useState(() => voiceDraftStorageStatus(workbench.client, identity, stepId) !== 'available')
  const [engineFilter, setEngineFilter] = useState(draft.source?.type === 'tts' ? draft.source.voice.engine : undefined)
  const [language, setLanguage] = useState(''), [query, setQuery] = useState(''), [catalog, setCatalog] = useState<VoiceCatalogAnswer>()
  const [catalogBusy, setCatalogBusy] = useState(true), [catalogFailure, setCatalogFailure] = useState<string>(), [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState<string>(), [review, setReview] = useState<Review>()
  const [preview, setPreview] = useState<{ quote: VoicePreviewQuote, snapshot: VoiceSnapshot }>(), [cloning, setCloning] = useState(false)
  const owner = useRef({ active: true, generation: 0 }), request = useRef<AbortController>()
  useEffect(() => () => { owner.current.active = false; owner.current.generation++; request.current?.abort() }, [])
  useEffect(() => {
    const controller = new AbortController()
    setCatalogBusy(true); setCatalogFailure(undefined)
    void workbench.client.readVoiceCatalog(directory, engineFilter, undefined, controller.signal).then(value => {
      if (!controller.signal.aborted) setCatalog(value)
    }, error => { if (!controller.signal.aborted) setCatalogFailure(voiceFailure(error, locale)) }).finally(() => { if (!controller.signal.aborted) setCatalogBusy(false) })
    return () => controller.abort()
  }, [workbench, directory, engineFilter, reload, actor?.reset, locale, serviceVersion])
  const document = actor?.content, validTarget = actor?.identity === identity && Boolean(document?.steps[stepId])
  const engineId = engineFilter ?? catalog?.engine
  const engines = catalog?.engines.filter(engine => engine.tts) ?? []
  const engine: SpeechEngineInfo | undefined = engines.find(engine => engine.id === (draft.source?.type === 'tts' ? draft.source.voice.engine ?? engineId : engineId))
  const voices = catalog?.catalog.status === 'available' ? catalog.catalog.voices : []
  const lang = document?.metadata.lang ?? 'zh-CN'
  const languages = [...new Set(voices.flatMap(voice => voice.lang))].sort()
  const rateRange = engine?.parameters?.rate, styles = engine?.parameters?.styles
  const normalizedRate = draft.rateInput?.normalize('NFKC').trim()
  const rate = normalizedRate ? Number(normalizedRate) : undefined
  const rateInvalid = draft.rateInput !== undefined && normalizedRate !== undefined && normalizedRate.length > 0 && (!rateRange || !/^\d+(?:\.\d+)?$/.test(normalizedRate) || !Number.isFinite(rate) || rate! < rateRange.min || rate! > rateRange.max)
  const sourceType = draft.source === null ? 'inherit' : draft.source.type
  const current = () => owner.current.active && workbench.getState().authoring?.identity === identity
  const edit = (value: VoiceDraft) => {
    request.current?.abort(); owner.current.generation++
    setBusy(false); setFailure(undefined); setReview(undefined); setPreview(undefined); workbench.stopAuditions()
    setDraft(value); setStorageFailed(!keepVoiceDraft(workbench.client, identity, stepId, value))
  }
  const checkedDraft = (value: VoiceDraft): VoiceDraft => ({ ...value, version: workbench.getState().authoring!.version! })
  const checkScope = async (value = draft) => {
    if (!current() || !validTarget || blocked || value.source?.type === 'tts' && (rateInvalid || !value.source.voice.voice.trim())) return
    const generation = ++owner.current.generation, controller = new AbortController()
    request.current?.abort(); request.current = controller; setBusy(true); setFailure(undefined)
    try {
      await workbench.flushPendingEdits(controller.signal)
      if (!current() || generation !== owner.current.generation) return
      const source = workbench.getState().authoring, latest = workbench.getDocument(identity)
      if (!source?.version || !source.fingerprint || !latest || source.dirty || source.saving || source.error || source.restored || source.composing) throw new Error('voice-context-changed')
      const proposal = checkedDraft(value), impact = previewDocumentVoiceChange(latest, proposal.scope, proposal.source, { replaceOverrides: proposal.replaceOverrides })
      setDraft(proposal); setStorageFailed(!keepVoiceDraft(workbench.client, identity, stepId, proposal))
      const targets = documentVoiceStepIds(latest, proposal.scope).map(id => { const step = latest.steps[id]!, page = latest.sections[step.sectionId]!; return `${page.title} · ${t.step(latest.sectionOrder.indexOf(page.id) + 1, page.stepOrder.indexOf(id) + 1)}` })
      setReview({ draft: proposal, impact, scopeLabel: t.scopes[proposal.scope.kind], targets, expected: { identity, version: source.version, fingerprint: source.fingerprint } })
    } catch (error) { if (current() && generation === owner.current.generation) setFailure(voiceFailure(error, locale)) }
    finally { if (current() && generation === owner.current.generation) setBusy(false) }
  }
  const apply = async () => {
    if (!review || !current()) return
    const confirmation = review, generation = ++owner.current.generation
    setBusy(true); setFailure(undefined)
    try {
      const saved = await workbench.applyDocumentVoice(confirmation.draft.scope, confirmation.draft.source, { replaceOverrides: confirmation.draft.replaceOverrides }, confirmation.expected)
      if (!current() || generation !== owner.current.generation) return
      if (!saved) throw new Error('voice-context-changed')
      if (!clearVoiceDraft(workbench.client, identity, stepId, confirmation.draft)) { setStorageFailed(true); setReview(undefined); return }
      onClose()
    } catch (error) { if (current() && generation === owner.current.generation) { setReview(undefined); setFailure(voiceFailure(error, locale)) } }
    finally { if (current() && generation === owner.current.generation) setBusy(false) }
  }
  const audition = async (mode: 'sample' | 'step') => {
    if (draft.source?.type !== 'tts' || rateInvalid || !validTarget || blocked) return
    const generation = ++owner.current.generation, controller = new AbortController(), voice = draft.source.voice
    request.current?.abort(); request.current = controller; setBusy(true); setFailure(undefined)
    try {
      const snapshot = await prepareVoiceSnapshot(workbench, stepId, controller.signal)
      const quote = await workbench.client.readVoicePreview(directory, { revision: snapshot.revision, voice, mode, ...mode === 'step' ? { target: snapshot.target } : {} }, controller.signal)
      if (!current() || generation !== owner.current.generation) return
      if (!voiceSnapshotCurrent(workbench, snapshot) || quote.source.version !== snapshot.source.version || quote.source.fingerprint !== snapshot.source.fingerprint || quote.source.documentId !== snapshot.source.documentId) throw new Error('voice-context-changed')
      setPreview({ quote, snapshot })
    } catch (error) { if (current() && generation === owner.current.generation) setFailure(voiceFailure(error, locale)) }
    finally { if (current() && generation === owner.current.generation) setBusy(false) }
  }
  const reviewCurrent = Boolean(review && actor?.version === review.expected.version && actor.fingerprint === review.expected.fingerprint && !actor.dirty && !actor.saving && !actor.error && !blocked)
  if (!document || !validTarget) return <PmDialog open label={t.settings} closeLabel={t.close} onClose={onClose}><PmNotice tone="warn">{p.draftChanged}</PmNotice></PmDialog>
  return <>
    <PmDialog open label={t.settings} closeLabel={t.close} onClose={onClose} footer={<><PmButton onClick={onClose}>{t.close}</PmButton><PmButton loading={busy} disabled={blocked || rateInvalid || draft.source?.type === 'tts' && !draft.source.voice.voice.trim() || draft.scope.kind === 'steps' && !draft.scope.stepIds.length} variant="primary" onClick={() => void checkScope()}>{t.check}</PmButton></>}>
      <div className="pmw-voice__form">
        {restored && <PmNotice tone="accent">{t.draftRecovered}</PmNotice>}
        {storageFailed && <PmNotice tone="warn">{t.recoveryFailed}</PmNotice>}
        {failure && <PmNotice tone="danger">{failure}</PmNotice>}
        <VoiceScopeField document={document} stepId={stepId} value={draft.scope} disabled={busy || blocked} onChange={scope => edit({ ...draft, scope, replaceOverrides: scope.kind === 'steps' && draft.source === null ? true : scope.kind === 'step' ? false : draft.replaceOverrides })} />
        <PmField label={t.source} group><PmSegmented label={t.source} value={sourceType} disabled={busy || blocked} options={[
          { value: 'tts', label: t.voice }, { value: 'none', label: p.none }, { value: 'inherit', label: t.inherit },
          ...sourceType === 'recording' ? [{ value: 'recording', label: p.recording }] : [],
        ]} onChange={value => {
          if (value === 'none') edit({ ...draft, source: { type: 'none' }, rateInput: undefined })
          else if (value === 'inherit') edit({ ...draft, source: null, rateInput: undefined, replaceOverrides: draft.scope.kind === 'steps' ? true : draft.replaceOverrides })
          else if (value === 'tts') edit({ ...draft, source: { type: 'tts', voice: { ...engineId ? { engine: engineId } : {}, voice: '' } }, rateInput: undefined })
        }} /></PmField>
        {draft.source?.type === 'recording' && <span>{document.assets[draft.source.assetId]?.title || p.recording}</span>}
        {draft.source?.type === 'tts' && <>
          <PmSelect label={t.provider} value={engineId ?? ''} disabled={!engines.length || busy || blocked} onChange={event => { setEngineFilter(event.target.value); setLanguage(''); setQuery('') }}>
            {!engines.length && <option value={engineId ?? ''}>{engineId ? `${engineId} · ${t.savedEngineUnavailable}` : t.noServiceOption}</option>}
            {engines.map(engine => <option key={engine.id} value={engine.id}>{engine.id} · {engine.provider}</option>)}
            {engineId && engines.length > 0 && !engines.some(engine => engine.id === engineId) && <option value={engineId}>{engineId} · {t.savedEngineUnavailable}</option>}
          </PmSelect>
          {catalogFailure && <PmButton small onClick={() => setReload(value => value + 1)}>{t.retry}</PmButton>}
          {catalog?.catalog.status === 'unavailable' && <PmNotice tone="warn">{catalog.catalog.reason === 'not-configured' ? t.noService : t.catalogUnsupported}</PmNotice>}
          {voices.length > 0 && <PmSelect label={t.language} value={language} disabled={busy || blocked} onChange={event => setLanguage(event.target.value)}><option value="">{t.allLanguages}</option>{languages.map(lang => <option key={lang} value={lang}>{lang}</option>)}</PmSelect>}
          {(catalogBusy || catalogFailure || catalog?.catalog.status === 'available') && <PmSearchList label={t.available} searchLabel={t.search} searchPlaceholder={t.searchPlaceholder} emptyLabel={t.empty} loadingLabel={t.loadingVoices} loading={catalogBusy} error={catalogFailure} disabled={busy || blocked || catalog?.catalog.status !== 'available'} query={query} onQueryChange={setQuery}
            value={draft.source.voice.engine === engineId || !draft.source.voice.engine ? draft.source.voice.voice : undefined}
            items={voices.filter(voice => !language || voice.lang.includes(language)).map(voice => ({ value: voice.id, label: voice.label, description: [voice.lang.join(', '), voice.cloned ? c.cloned : '', supportsLanguage(voice.lang, lang) ? '' : t.languageMismatch].filter(Boolean).join(' · '), keywords: [voice.id, ...voice.lang, engineId ?? ''], disabled: !supportsLanguage(voice.lang, lang) }))}
            resultsLabel={t.results} onValueChange={voice => edit({ ...draft, source: { type: 'tts', voice: { ...engineId ? { engine: engineId } : {}, voice } }, rateInput: undefined })} />}
          {engine?.clone && <div className="pmw-voice__actions"><PmButton small disabled={busy || blocked} onClick={() => setCloning(true)}>{c.open}</PmButton></div>}
          <PmField label={p.selectedVoice}><span>{draft.source.voice.voice || t.unset}</span></PmField>
          {rateRange && <PmInput label={t.rate} width="number" inputMode="decimal" maxLength={32} value={draft.rateInput ?? (draft.source.voice.rate === undefined ? '' : String(draft.source.voice.rate))} error={rateInvalid ? t.rateInvalid(rateRange.min, rateRange.max) : undefined} disabled={busy || blocked} onChange={event => {
            if (draft.source?.type !== 'tts') return
            const raw = event.target.value, normalized = raw.normalize('NFKC').trim(), value = Number(normalized)
            const valid = /^\d+(?:\.\d+)?$/.test(normalized) && Number.isFinite(value) && value >= rateRange.min && value <= rateRange.max
            const voice = { ...draft.source.voice }
            if (!normalized) delete voice.rate
            else if (valid) voice.rate = value
            edit({ ...draft, rateInput: raw, source: { type: 'tts', voice } })
          }} />}
          {styles?.length ? <PmSelect label={t.style} value={draft.source.voice.style ?? ''} disabled={busy || blocked} onChange={event => {
            if (draft.source?.type !== 'tts') return
            const voice = { ...draft.source.voice }
            if (event.target.value) voice.style = event.target.value; else delete voice.style
            edit({ ...draft, source: { type: 'tts', voice } })
          }}><option value="">{t.styleDefault}</option>{styles.map(style => <option key={style} value={style}>{style}</option>)}</PmSelect> : null}
          {draft.rateInput !== undefined && !rateRange && <PmNotice tone="warn">{p.draftChanged} <PmButton small onClick={() => edit({ ...draft, rateInput: undefined })}>{t.recheck}</PmButton></PmNotice>}
          <div className="pmw-voice__actions"><PmButton small icon="audio" disabled={busy || blocked || !draft.source.voice.voice || rateInvalid} onClick={() => void audition('sample')}>{t.standard}</PmButton><PmButton small icon="audio" disabled={busy || blocked || !draft.source.voice.voice || rateInvalid} onClick={() => void audition('step')}>{p.currentScript}</PmButton></div>
          <p className="pmw-pane__footer">{t.previewHint}</p>
        </>}
        {draft.scope.kind !== 'step' && !(draft.scope.kind === 'steps' && draft.source === null) && <PmField label={t.replace} group><PmSegmented label={t.replace} value={draft.replaceOverrides ? 'replace' : 'preserve'} disabled={busy || blocked} options={[{ value: 'preserve', label: t.preserve }, { value: 'replace', label: t.replaceAll }]} onChange={value => edit({ ...draft, replaceOverrides: value === 'replace' })} /></PmField>}
      </div>
    </PmDialog>
    <PmDialog open={Boolean(review)} label={review?.draft.source === null ? p.restoreTitle : p.applyTitle} closeLabel={t.close} onClose={() => setReview(undefined)} busy={busy} description={review?.draft.source === null ? p.restoreHint : p.applyHint} footer={<><PmButton disabled={busy} onClick={() => setReview(undefined)}>{t.cancel}</PmButton><PmButton loading={busy} disabled={!reviewCurrent} variant={review?.draft.replaceOverrides && review.impact.overrides.pages + review.impact.overrides.steps > 0 ? 'danger' : 'primary'} onClick={() => void apply()}>{review?.draft.replaceOverrides && review.impact.overrides.pages + review.impact.overrides.steps > 0 ? p.replaceCount(review.impact.overrides.pages + review.impact.overrides.steps) : t.apply}</PmButton></>}>
      {review && <div className="pmw-voice__form">
        <PmField label={t.source}><span>{review.draft.source === null ? t.inherit : review.draft.source.type === 'none' ? p.none : review.draft.source.type === 'recording' ? document.assets[review.draft.source.assetId]?.title || p.recording : `${review.draft.source.voice.voice}${review.draft.source.voice.engine ? ` · ${review.draft.source.voice.engine}` : ''}`}</span></PmField>
        {review.draft.source?.type === 'tts' && <>
          {review.draft.source.voice.rate !== undefined && <PmField label={t.rate}><span>{review.draft.source.voice.rate}</span></PmField>}
          {review.draft.source.voice.style && <PmField label={t.style}><span>{review.draft.source.voice.style}</span></PmField>}
        </>}
        <PmField label={t.scope}><span>{review.scopeLabel}</span></PmField><details><summary>{t.selected(review.targets.length)}</summary><ul>{review.targets.map(target => <li key={target}>{target}</li>)}</ul></details><p>{p.counts(review.impact.updated, review.impact.preserved, review.impact.unchanged)}</p><p>{p.overridden(review.impact.overrides.none, review.impact.overrides.recording)}</p>{review.draft.replaceOverrides && <PmNotice tone="warn">{t.replaceAll} {p.keepAssets}</PmNotice>}{!reviewCurrent && <PmNotice tone="warn">{p.draftChanged}</PmNotice>}
      </div>}
    </PmDialog>
    {cloning && engine && <VoiceCloneDialog directory={directory} engine={engine} lang={lang} onClose={() => setCloning(false)} onUse={(voice) => {
      setCloning(false); setReload(value => value + 1)
      edit({ ...draft, source: { type: 'tts', voice: { engine: engine.id, voice } }, rateInput: undefined })
    }} />}
    {preview && <VoicePreviewDialog quote={preview.quote} snapshot={preview.snapshot} onClose={() => setPreview(undefined)} onRecheck={() => { const mode = preview.quote.mode; setPreview(undefined); void audition(mode) }} />}
  </>
}
