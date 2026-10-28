import { useEffect, useId, useRef, useState } from 'react'
import { recordingSourceRange } from '@lincyaw/kernel'
import type { DocumentRecordingAdoption, ProductionAssetInspection, TimeRange, VoiceSource } from '@lincyaw/kernel'
import { PmButton, PmInput, PmNotice } from '../components.tsx'
import { useWorkbench, useWorkbenchState } from '../context.tsx'
import { AUDIO_RECORDING_MESSAGES } from '../audio-recording-messages.ts'
import { MEDIA_MESSAGES, mediaFailure } from '../media-messages.ts'
import { mediaTime, mediaTimeValue } from '../media-time.ts'
import { PRODUCTION_MESSAGES } from '../production-messages.ts'

type RecordingSource = Extract<VoiceSource, { type: 'recording' }>
interface RangeDraft { version: string, voice: RecordingSource, range?: TimeRange, startText?: string, endText?: string }
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Video-only pending input; the existing recording transaction and source actor own every write. */
export function ProductionRecordingRange({ identity, sectionId, stepId, active, disabled, onChanged }: {
  identity: string, sectionId: string, stepId: string, active: boolean, disabled: boolean, onChanged(): void,
}) {
  const workbench = useWorkbench(), locale = useWorkbenchState(state => state.locale), source = useWorkbenchState(state => state.authoring)
  const t = MEDIA_MESSAGES[locale], r = AUDIO_RECORDING_MESSAGES[locale]
  const document = source?.identity === identity ? source.content : undefined
  const effective = document?.production.stepOverrides[stepId]?.voiceSource ?? document?.production.sectionOverrides?.[sectionId]?.voiceSource ?? document?.production.defaults.voiceSource
  const voice = effective?.type === 'recording' ? effective : undefined, key = JSON.stringify([stepId, voice?.assetId])
  const drafts = useRef(new Map<string, RangeDraft>()), mounted = useRef(true), request = useRef<AbortController>()
  const [inspection, setInspection] = useState<{ version: string, value: ProductionAssetInspection }>(), [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState<string>(), [reload, setReload] = useState(0), [, render] = useState(0)
  const rangeErrorId = useId()
  const failureText = (error: unknown) => {
    const code = error instanceof Error ? error.message : String(error)
    return code === 'recording-cue-unsupported' || code === 'recording-start-conflict' ? (PRODUCTION_MESSAGES[locale].diagnostics as Record<string, string>)[`production.${code}`]!
      : code === 'recording-source-changed' || code === 'production-source-changed' || code === 'document-version-changed' ? r.adoptionSourceChanged : mediaFailure(error, locale)
  }
  const sent = useRef<{ key: string, draft: RangeDraft, request: DocumentRecordingAdoption }>(), reported = useRef<string>()
  const latest = useRef({ key, active, disabled, onChanged }); latest.current = { key, active, disabled, onChanged }
  const current = () => mounted.current && workbench.getState().authoring?.identity === identity
  const inspected = inspection && inspection.version === source?.version && inspection.value.assetId === voice?.assetId ? inspection.value : undefined
  const draft = drafts.current.get(key) ?? (voice ? { version: source?.version ?? '', voice } : undefined)
  const range = draft?.range ?? (draft && inspected ? recordingSourceRange(draft.voice, inspected.durationMs) : undefined)
  const start = draft ? mediaTimeValue(draft.startText, range?.startMs ?? draft.voice.sourceRange?.startMs ?? 0) : undefined
  const end = draft ? mediaTimeValue(draft.endText, range?.endMs ?? draft.voice.sourceRange?.endMs ?? 0) : undefined
  const valid = Boolean(inspected && start !== undefined && end !== undefined && start >= 0 && end > start && end <= inspected.durationMs)
  const canonicalRange = voice && inspected ? recordingSourceRange(voice, inspected.durationMs) : undefined
  const changed = Boolean(valid && !same(canonicalRange, { startMs: start, endMs: end }))
  const composing = useRef(false)
  const clean = () => { const value = workbench.getState().authoring; return value?.identity === identity && !value.loading && !value.dirty && !value.saving && !value.composing && !value.restored && !value.recovering && !value.error ? value : undefined }
  const settle = () => {
    const value = sent.current, actual = clean(), step = value && actual?.content?.steps[value.request.stepId]
    const saved = step && (actual!.content!.production.stepOverrides[step.id]?.voiceSource ?? actual!.content!.production.sectionOverrides?.[step.sectionId]?.voiceSource ?? actual!.content!.production.defaults.voiceSource)
    if (!value || !actual?.version || saved?.type !== 'recording' || saved.assetId !== value.request.assetId || !same(saved.sourceRange, value.request.sourceRange)
      || actual.content?.assets[saved.assetId]?.fingerprint !== `sha256:${value.request.sha256}`) return false
    const pending = drafts.current.get(value.key)
    if (pending === value.draft) drafts.current.delete(value.key)
    else if (pending?.version === value.draft.version && same(pending.voice, value.draft.voice)) drafts.current.set(value.key, { ...pending, version: actual.version, voice: structuredClone(saved) })
    if (current()) { setFailure(undefined); render(value => value + 1) }
    if (latest.current.key === value.key && latest.current.active && !latest.current.disabled && reported.current !== value.request.id) {
      reported.current = value.request.id; latest.current.onChanged()
    }
    return true
  }
  useEffect(() => () => { mounted.current = false; request.current?.abort() }, [])
  useEffect(() => { request.current?.abort(); request.current = undefined; setBusy(false); setFailure(undefined) }, [key, active])
  useEffect(() => {
    const version = source?.version, assetId = voice?.assetId, controller = new AbortController()
    if (!active || !version || !assetId || disabled) { setLoading(false); return }
    setLoading(true)
    void workbench.inspectDocumentAudio(assetId, { identity, version }, controller.signal).then(answer => {
      if (!controller.signal.aborted && current() && latest.current.key === key) setInspection({ version: answer.version, value: answer.inspection })
    }, error => { if (!controller.signal.aborted && current() && latest.current.key === key) setFailure(failureText(error)) })
      .finally(() => { if (!controller.signal.aborted && current() && latest.current.key === key) setLoading(false) })
    return () => controller.abort()
  }, [workbench, identity, source?.version, voice?.assetId, key, active, disabled, reload])
  useEffect(() => { settle() }, [source?.version, source?.content, source?.loading, source?.dirty, source?.saving, source?.composing, source?.restored, source?.error, active, disabled, key])
  const edit = (patch: Partial<RangeDraft>) => {
    if (!draft) return
    drafts.current.set(key, { ...draft, ...range ? { range: { ...range } } : {}, ...patch }); setFailure(undefined); render(value => value + 1)
  }
  const apply = async () => {
    if (!voice || !draft || !inspected || !valid || !changed || busy || disabled || !active || composing.current || !current()) return
    const source = clean()
    if (!source?.version || !source.fingerprint || source.version !== draft.version || !source.content) return
    const controller = new AbortController(), proposed = { startMs: start!, endMs: end! }
    const previous = sent.current?.request
    const change: DocumentRecordingAdoption = previous && previous.source.version === source.version && previous.stepId === stepId && previous.assetId === voice.assetId && previous.sha256 === inspected.sha256 && same(previous.sourceRange, proposed)
      ? previous : { id: crypto.randomUUID(), source: { documentId: source.content.id, version: source.version, fingerprint: source.fingerprint }, stepId, assetId: voice.assetId, sha256: inspected.sha256, sourceRange: proposed }
    const stored = drafts.current.get(key) ?? draft
    drafts.current.set(key, stored); sent.current = { key, draft: stored, request: change }; request.current = controller
    setBusy(true); setFailure(undefined)
    try { await workbench.adoptDocumentRecording(change, { identity, version: source.version }, controller.signal); if (current()) settle() }
    catch (error) { if (current() && request.current === controller && !settle() && !controller.signal.aborted) setFailure(failureText(error)) }
    finally { if (request.current === controller) { request.current = undefined; if (current()) setBusy(false) } }
  }
  if (!voice || !draft) return null
  const review = draft.version !== source?.version
  const rangeError = start === undefined || end === undefined ? t.invalidTime : inspected && !valid ? t.invalidRange : undefined
  const trimmed = Boolean(canonicalRange && inspected && (canonicalRange.startMs > 0 || canonicalRange.endMs < inspected.durationMs))
  const hasCaptions = document?.steps[stepId]?.narrationIds.some(id => document.narrations[id]?.content.some(node => node.type !== 'cue' && (node.type === 'text' ? node.text : node.display).trim()))
  return <section className="pm-ui-media-clip-editor" aria-label={r.trim} onFocusCapture={() => { if (!disabled) void workbench.pausePlayback() }}
    onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }}
    onKeyDown={event => { event.stopPropagation(); if (event.key === 'Enter' && event.target instanceof HTMLInputElement && !event.nativeEvent.isComposing && !composing.current) { event.preventDefault(); void apply() } }}>
    <strong>{r.trim}</strong>
    <span>{document?.assets[voice.assetId]?.title || r.title}</span>
    {loading ? <span role="status">{t.loading}</span> : inspected && <output className="pm-ui-field__hint">{t.original(mediaTime(inspected.durationMs), valid ? mediaTime(end! - start!) : undefined)}</output>}
    <div className="pm-ui-media-clip-editor__times">
      <PmInput label={t.in} density="compact" width="time" maxLength={32} value={draft.startText ?? mediaTime(range?.startMs ?? draft.voice.sourceRange?.startMs ?? 0)} aria-describedby={rangeError ? rangeErrorId : undefined} aria-invalid={Boolean(rangeError) || undefined} readOnly={disabled || !inspected} onChange={event => edit({ startText: event.target.value })} />
      <PmInput label={t.out} density="compact" width="time" maxLength={32} value={draft.endText ?? mediaTime(range?.endMs ?? draft.voice.sourceRange?.endMs ?? 0)} aria-describedby={rangeError ? rangeErrorId : undefined} aria-invalid={Boolean(rangeError) || undefined} readOnly={disabled || !inspected} onChange={event => edit({ endText: event.target.value })} />
    </div>
    {rangeError && <PmNotice tone="warn"><span id={rangeErrorId}>{rangeError}</span></PmNotice>}
    <div className="pm-ui-media-clip-editor__actions">
      <PmButton small variant="primary" loading={busy} disabled={disabled || !active || !valid || !changed || review} onClick={() => void apply()}>{t.apply}</PmButton>
      <PmButton small disabled={disabled || !inspected} onClick={() => edit({ range: { startMs: 0, endMs: inspected!.durationMs }, startText: undefined, endText: undefined })}>{t.restore}</PmButton>
      {busy && <PmButton small onClick={() => { request.current?.abort(); request.current = undefined; setBusy(false) }}>{AUDIO_RECORDING_MESSAGES[locale].cancelAdoption}</PmButton>}
    </div>
    {review && <PmNotice tone="warn">{t.review}<PmButton small disabled={disabled || !inspected || busy} onClick={() => edit({ version: source!.version!, voice: structuredClone(voice) })}>{t.check}</PmButton></PmNotice>}
    {trimmed && hasCaptions && <PmNotice tone="warn">{r.captionReview}</PmNotice>}
    {failure && <PmNotice tone="danger">{failure}<PmButton small disabled={disabled || busy} onClick={() => { setInspection(undefined); setFailure(undefined); setReload(value => value + 1) }}>{t.retry}</PmButton></PmNotice>}
    {drafts.current.has(key) && <span className="pm-ui-field__hint" role="status">{t.pending}</span>}
  </section>
}
