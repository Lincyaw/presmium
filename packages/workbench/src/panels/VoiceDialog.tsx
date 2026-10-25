import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { SpeechVoice, VoiceCatalogAnswer, VoicePreviewQuote, VoiceSettingsAnswer, VoiceSettingsChange, VoiceTarget } from '@lincyaw/kernel'
import { speechEngineId } from '@lincyaw/kernel'
import { PmButton, PmCard, PmDialog, PmField, PmInput, PmNotice, PmSearchList, PmSegmented, PmSelect } from '../components.tsx'
import { useWorkbench, useWorkbenchState } from '../context.tsx'
import { Audition } from '../audition.ts'
import type { AuditionState } from '../audition.ts'
import { clearVoiceDraft, keepVoiceDraft, readVoiceDraft } from '../voice-drafts.ts'
import type { VoiceDraft } from '../voice-drafts.ts'
import { VOICE_MESSAGES, voiceFailure } from '../voice-messages.ts'
import { VoiceScopeField } from './VoiceScopeField.tsx'

const IDLE_AUDIO: AuditionState = { status: 'idle' }
const idleAudio = (): AuditionState => IDLE_AUDIO
const noSubscription = () => () => {}
const voiceKey = (voice: SpeechVoice) => JSON.stringify([voice.engine, voice.voice])
const sameVoice = (a: SpeechVoice, b: SpeechVoice) => a.engine === b.engine && a.voice === b.voice && a.rate === b.rate && a.style === b.style

/** Catalogue reads and scope checks are read-only. Only Apply and confirmed Preview mutate or synthesize. */
export function VoiceDialog({ document, workspace, target, initial, onClose, onApplied }: { document: string, workspace: string, target: VoiceTarget, initial: VoiceSettingsAnswer, onClose(): void, onApplied(): void }) {
  const workbench = useWorkbench()
  const locale = useWorkbenchState(state => state.locale)
  const t = VOICE_MESSAGES[locale]
  const doc = useWorkbenchState(state => state.ir?.doc)
  const revision = useWorkbenchState(state => state.ir?.revision)
  const [settings, setSettings] = useState(initial)
  const draftDocument = JSON.stringify([workspace, document])
  const [restored] = useState(() => readVoiceDraft(workbench.client, draftDocument, target))
  const [draft, setDraft] = useState<VoiceDraft>(() => restored ?? {
    revision: initial.revision, base: initial.source.version,
    scope: initial.selected?.editable ? { kind: 'step', target } : { kind: 'page', section: target.section },
    voice: initial.selected?.voice ?? null, replaceOverrides: false,
  })
  const [edited, setEdited] = useState(Boolean(restored))
  const [filterEngine, setFilterEngine] = useState(draft.voice?.engine ?? '')
  const [language, setLanguage] = useState('')
  const [catalog, setCatalog] = useState<VoiceCatalogAnswer>()
  const [catalogEngine, setCatalogEngine] = useState('')
  const [catalogBusy, setCatalogBusy] = useState(true)
  const [catalogError, setCatalogError] = useState<string>()
  const [counts, setCounts] = useState<VoiceSettingsChange>()
  const [checking, setChecking] = useState(false)
  const [failure, setFailure] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [recoveryFailed, setRecoveryFailed] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [audition, setAudition] = useState<Audition>()
  const audio = useSyncExternalStore(audition?.subscribe ?? noSubscription, audition?.snapshot ?? idleAudio)
  const [quote, setQuote] = useState<VoicePreviewQuote>()
  const [quoteBusy, setQuoteBusy] = useState(false)
  const [quoteFailure, setQuoteFailure] = useState<string>()
  const quoteRequest = useRef<AbortController>()
  const live = useRef(true)
  useEffect(() => { live.current = true; return () => { live.current = false; quoteRequest.current?.abort() } }, [])
  useEffect(() => { const next = new Audition(workbench); setAudition(next); return () => next.dispose() }, [workbench])
  const change = (next: VoiceDraft) => {
    setEdited(true)
    setDraft(next); setCounts(undefined); setFailure(undefined)
    setRecoveryFailed(!keepVoiceDraft(workbench.client, draftDocument, target, next))
  }

  useEffect(() => {
    const request = new AbortController()
    setCatalogBusy(true); setCatalogError(undefined)
    void workbench.client.readVoiceCatalog(document, filterEngine || undefined, undefined, request.signal).then(answer => {
      if (!request.signal.aborted) { setCatalog(answer); setCatalogEngine(answer.engine ?? ''); setCatalogBusy(false) }
    }, error => { if (!request.signal.aborted) { setCatalogError(voiceFailure(error, locale)); setCatalogBusy(false) } })
    return () => request.abort()
  }, [workbench, document, filterEngine, refresh, locale])

  const selectedEngineId = draft.voice?.engine ? speechEngineId(draft.voice.engine) : settings.defaultEngine
  const engine = catalog?.engines.find(engine => engine.id === selectedEngineId)
  const listedEngine = catalog?.engines.find(engine => engine.id === catalogEngine)
  const range = engine?.parameters?.rate
  const rateInput = draft.rateInput ?? (draft.voice?.rate === undefined ? '' : String(draft.voice.rate))
  const validRate = !range || !rateInput.trim() || Number.isFinite(Number(rateInput)) && Number(rateInput) >= range.min && Number(rateInput) <= range.max
  const voice: SpeechVoice | null = draft.voice && { ...draft.voice, ...range ? { rate: rateInput.trim() ? Number(rateInput) : undefined } : {} }
  const stale = draft.revision !== settings.revision || draft.base !== settings.source.version || revision !== draft.revision
  const currentTarget = settings.selected?.target ?? target
  const validScope = draft.scope.kind !== 'steps' || draft.scope.targets.length > 0
  const identity = JSON.stringify([draft, voice])
  useEffect(() => {
    audition?.stop(); quoteRequest.current?.abort(); setQuote(undefined); setQuoteBusy(false); setQuoteFailure(undefined)
  }, [identity, audition, revision, filterEngine])
  useEffect(() => {
    setCounts(undefined)
    setChecking(false)
    if (!edited || stale || !validRate || !validScope || catalogBusy || voice && catalog?.catalog.status !== 'available') return
    const request = new AbortController()
    setChecking(true)
    const timer = setTimeout(() => {
      void workbench.client.updateVoiceSettings(document, { ...draft, voice, apply: false }, request.signal).then(answer => {
        if (!request.signal.aborted) { setCounts(answer); setChecking(false) }
      }, error => { if (!request.signal.aborted) { setFailure(voiceFailure(error, locale)); setChecking(false) } })
    }, 150)
    return () => { clearTimeout(timer); request.abort() }
  }, [identity, edited, stale, validRate, validScope, catalogBusy, catalog?.catalog.status, workbench, document, locale])

  const preview = async (mode: 'sample' | 'step') => {
    if (!voice || !settings.capabilities?.preview || stale || !validRate || busy) return
    audition?.stop(); quoteRequest.current?.abort()
    const request = new AbortController(); quoteRequest.current = request
    setQuote(undefined); setQuoteFailure(undefined); setQuoteBusy(true)
    try {
      const answer = await workbench.client.readVoicePreview(document, { revision: draft.revision, voice, mode, target: currentTarget }, request.signal)
      if (!request.signal.aborted) setQuote(answer)
    } catch (error) { if (!request.signal.aborted) setQuoteFailure(voiceFailure(error, locale)) }
    finally { if (!request.signal.aborted) setQuoteBusy(false) }
  }
  const apply = async () => {
    if (!counts || stale || !validRate || !validScope || busy) return
    setBusy(true); setFailure(undefined); audition?.stop(); quoteRequest.current?.abort()
    try {
      await workbench.saveVoiceSettings({ ...draft, voice, apply: true })
      if (live.current) { clearVoiceDraft(workbench.client, draftDocument, target, draft); onApplied(); onClose() }
    } catch (error) { if (live.current) setFailure(voiceFailure(error, locale)) }
    finally { if (live.current) setBusy(false) }
  }
  const recheck = async () => {
    setBusy(true); setFailure(undefined)
    try {
      const next = await workbench.client.readVoiceSettings(document, target.section, target.step)
      if (!live.current) return
      setSettings(next)
      const selected = next.selected
      if (!selected) throw new Error('voice-context-changed')
      change({ ...draft, revision: next.revision, base: next.source.version, scope: selected.editable ? { kind: 'step', target: selected.target } : { kind: 'page', section: target.section } })
    } catch (error) { if (live.current) setFailure(voiceFailure(error, locale)) }
    finally { if (live.current) setBusy(false) }
  }
  const voices = catalog?.catalog.voices ?? []
  const currentLanguage = doc?.meta.lang ?? locale
  const languages = [...new Set(voices.flatMap(voice => voice.lang))]
  const supportsLanguage = (langs: string[]) => !langs.length || langs.some(lang => lang.toLowerCase().split('-')[0] === currentLanguage.toLowerCase().split('-')[0])
  const items = voices.filter(item => !language || item.lang.includes(language)).map(item => ({
    value: voiceKey({ engine: listedEngine?.id, voice: item.id }), label: item.label,
    description: [item.lang.join(' · '), listedEngine?.provider, !supportsLanguage(item.lang) ? t.languageMismatch : ''].filter(Boolean).join(' · '),
    keywords: [item.id, ...item.lang, listedEngine?.provider ?? ''], disabled: !supportsLanguage(item.lang),
  }))
  const selectedItem = selectedEngineId === listedEngine?.id ? voices.find(item => item.id === voice?.voice) : undefined
  const available = catalog?.catalog.status === 'available'
  if (!doc) return null
  return <PmDialog open label={t.settings} description={t.previewHint} closeLabel={t.close} busy={busy} onClose={onClose}>
    <div className="pmw-operation">
      {restored && <PmNotice>{t.draftRecovered}</PmNotice>}
      {recoveryFailed && <PmNotice tone="warn">{t.recoveryFailed}</PmNotice>}
      {stale && <PmNotice tone="warn">{t.changed}<PmButton small disabled={busy} onClick={() => void recheck()}>{t.recheck}</PmButton></PmNotice>}
      {failure && <PmNotice tone="danger">{failure}</PmNotice>}
      <div className="pmw-voice__filters">
        <PmSelect label={t.provider} value={filterEngine || listedEngine?.id || ''} disabled={busy || !catalog?.engines.length} onChange={event => { audition?.stop(); quoteRequest.current?.abort(); setQuote(undefined); setLanguage(''); setFilterEngine(event.target.value) }}>
          {!catalog?.engines.length && <option value="">{t.noServiceOption}</option>}
          {filterEngine && catalog?.engines.length && !catalog.engines.some(engine => engine.id === filterEngine) ? <option value={filterEngine} disabled>{t.savedEngineUnavailable}</option> : null}
          {catalog?.engines.map(engine => <option key={engine.id} value={engine.id}>{engine.provider}</option>)}
        </PmSelect>
        <PmSelect label={t.language} value={language} disabled={busy || !available} onChange={event => setLanguage(event.target.value)}><option value="">{t.allLanguages}</option>{languages.map(lang => <option key={lang} value={lang}>{lang}</option>)}</PmSelect>
      </div>
      {!catalogBusy && !available && !catalogError && <PmNotice tone="warn">{catalog?.catalog.status === 'unavailable' && catalog.catalog.reason === 'not-configured' ? t.noService : t.catalogUnsupported}</PmNotice>}
      {catalog?.catalog.status === 'available' && catalog.catalog.source === 'bundled' && <PmNotice>{t.bundledCatalog}</PmNotice>}
      <PmSearchList label={t.available} searchLabel={t.search} searchPlaceholder={t.searchPlaceholder} items={items} value={voice ? voiceKey({ ...voice, engine: selectedEngineId }) : undefined} onValueChange={value => {
        const picked = voices.find(item => voiceKey({ engine: listedEngine?.id, voice: item.id }) === value)
        if (picked && listedEngine) change({ ...draft, voice: { engine: listedEngine.id, voice: picked.id }, rateInput: undefined })
      }} resultsLabel={t.results} emptyLabel={t.empty} loadingLabel={t.loadingVoices} loading={catalogBusy} error={catalogError} disabled={busy} />
      {catalogError && <PmButton small disabled={catalogBusy} onClick={() => setRefresh(value => value + 1)}>{t.retry}</PmButton>}
      <PmCard><div className="pmw-operation">
        <h3 className="pmw-pane__title">{t.details}</h3>
        <span>{selectedItem?.label ?? voice?.voice ?? t.unset}</span>
        {engine && <span>{t.source}: {engine.provider}</span>}
        <div className="pmw-operation__actions">
          <PmButton small icon="play" disabled={busy || !voice || !settings.capabilities?.preview || stale || !validRate || quoteBusy} onClick={() => void preview('sample')}>{t.standard}</PmButton>
          <PmButton small icon="play" disabled={busy || !voice || !settings.capabilities?.preview || stale || !validRate || quoteBusy} onClick={() => void preview('step')}>{t.currentScript}</PmButton>
          {(audio.status === 'playing' || audio.status === 'loading') && <PmButton small icon="pause" onClick={() => audition?.stop()}>{t.stop}</PmButton>}
        </div>
        {quoteBusy && <p role="status">{t.auditionLoading}</p>}
        {quoteFailure && <PmNotice tone="danger">{quoteFailure}</PmNotice>}
        {audio.status === 'failed' && !quoteFailure && <PmNotice tone="danger">{voiceFailure(new Error(audio.error), locale)}</PmNotice>}
        {(audio.status === 'loading' || audio.status === 'playing') && <p role="status">{audio.status === 'loading' ? t.auditionLoading : t.auditioning}</p>}
        {quote && <>
          <PmNotice>{quote.cached ? t.cachedPreview : t.disclosure(quote.provider, quote.local)}</PmNotice>
          <p className="pmw-voice__sample">{quote.text}</p>
          <PmButton small icon="play" disabled={!audition || busy || stale || !validRate || audio.status === 'loading'} onClick={() => void audition?.play(async signal => {
            try {
              const answer = await workbench.client.previewVoice(document, { revision: quote.revision, voice: quote.voice, mode: quote.mode, target: quote.target, quote: quote.quote, confirmed: true }, signal)
              if (answer.revision !== quote.revision || !sameVoice(answer.voice, quote.voice)) throw new Error('voice-context-changed')
              return answer
            } catch (error) {
              if (!signal.aborted && live.current) { setQuote(undefined); setQuoteFailure(voiceFailure(error, locale)) }
              throw error
            }
          })}>{t.confirmPreview}</PmButton>
        </>}
        {range && <PmInput label={t.rate} inputMode="decimal" width="number" value={rateInput} placeholder="1" disabled={busy || !voice} error={!validRate ? t.rateInvalid(range.min, range.max) : undefined} onChange={event => change({ ...draft, rateInput: event.target.value })} />}
        {engine?.parameters?.styles?.length && voice ? <PmSelect label={t.style} value={voice.style ?? ''} disabled={busy} onChange={event => change({ ...draft, voice: { ...voice, style: event.target.value || undefined } })}><option value="">{t.styleDefault}</option>{engine.parameters.styles.map(style => <option key={style} value={style}>{style}</option>)}</PmSelect> : null}
      </div></PmCard>
      <VoiceScopeField settings={settings} doc={doc} target={currentTarget} value={draft.scope} disabled={busy} onChange={scope => change({ ...draft, scope })} />
      {settings.selected?.reason && <PmNotice tone="warn">{settings.selected.reason === 'script-file' ? t.scriptFile : settings.selected.reason === 'cue-step' ? t.cueStep : t.changed}</PmNotice>}
      <PmField label={t.replace} group><PmSegmented label={t.replace} value={draft.replaceOverrides ? 'replace' : 'keep'} options={[{ value: 'keep', label: t.preserve }, { value: 'replace', label: t.replaceAll }]} disabled={busy} onChange={value => change({ ...draft, replaceOverrides: value === 'replace' })} /></PmField>
      <PmButton small disabled={busy || !voice} onClick={() => change({ ...draft, voice: null, rateInput: undefined })}>{draft.scope.kind === 'document' ? t.clearDefault : t.inherit}</PmButton>
      {checking && !stale && <p role="status">{t.checking}</p>}
      {counts && <PmNotice>{t.counts(counts.updated, counts.preserved)}</PmNotice>}
      <div className="pmw-operation__actions">
        <PmButton disabled={busy} onClick={() => { clearVoiceDraft(workbench.client, draftDocument, target); onClose() }}>{t.cancel}</PmButton>
        <PmButton variant="primary" loading={busy} disabled={!edited || !counts || stale || !validRate || !validScope || checking} onClick={() => void apply()}>{t.apply}</PmButton>
      </div>
    </div>
  </PmDialog>
}
