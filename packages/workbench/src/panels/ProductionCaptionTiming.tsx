import { useEffect, useRef, useState } from 'react'
import { CAPTION_TIMING_MAX_SEGMENTS, captionSourceFingerprint, captionTimingProblem, stepCaptionText } from '@lincyaw/kernel'
import type { CaptionTiming, CaptionTimingSource, DocumentCaptionTimingAction, ProductionPlan } from '@lincyaw/kernel'
import { PmButton, PmCard, PmDialog, PmInput, PmNotice } from '../components.tsx'
import { useWorkbench, useWorkbenchState } from '../context.tsx'
import { CAPTION_TIMING_MESSAGES } from '../caption-timing-messages.ts'

interface Row { id: string, from: number, to: number, start: string, end: string }
interface Draft { version: string, text: string, basis: CaptionTimingSource, rows: Row[] }
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const seconds = (raw: string) => {
  if (!/^\d+(?:\.\d{1,3})?$/.test(raw.trim())) return undefined
  const value = Math.round(Number(raw.trim()) * 1000)
  return Number.isSafeInteger(value) ? value : undefined
}
/** An explicit line-break partition retains every original character, including blank lines. */
function lineRows(text: string): Row[] {
  const cuts = [0, ...Array.from(text.matchAll(/\n+(?=[^\n]*\S)/g), match => match.index + match[0].length), text.length]
  const ranges: { from: number, to: number }[] = []
  for (let i = 0; i + 1 < cuts.length; i++) {
    const from = cuts[i]!, to = cuts[i + 1]!
    if (from === to) continue
    if (!text.slice(from, to).trim() && ranges.length) ranges[ranges.length - 1]!.to = to
    else if (ranges.length && !text.slice(ranges.at(-1)!.from, ranges.at(-1)!.to).trim()) ranges[ranges.length - 1]!.to = to
    else ranges.push({ from, to })
  }
  return ranges.map(range => ({ ...range, id: crypto.randomUUID(), start: '', end: '' }))
}
function valueOf(draft: Draft): CaptionTiming | undefined {
  if (!draft.basis.available || !draft.basis.playbackFingerprint || draft.basis.durationMs === undefined) return
  const rows = draft.rows.map(row => ({ id: row.id, from: row.from, to: row.to, startMs: seconds(row.start), endMs: seconds(row.end) }))
  if (rows.some(row => row.startMs === undefined || row.endMs === undefined)) return
  const value: CaptionTiming = { narrationIds: draft.basis.narrationIds, sourceFingerprint: draft.basis.sourceFingerprint,
    playbackFingerprint: draft.basis.playbackFingerprint, durationMs: draft.basis.durationMs, segments: rows as CaptionTiming['segments'] }
  return captionTimingProblem(value, draft.text) ? undefined : value
}

/** Video-only explicit timing proposals. The shared semantic action and canonical actor own every save. */
export function ProductionCaptionTiming({ identity, stepId, plan, current, disabled, onChanged }: {
  identity: string, stepId: string, plan?: ProductionPlan, current: boolean, disabled: boolean, onChanged(): void,
}) {
  const workbench = useWorkbench(), source = useWorkbenchState(state => state.authoring), locale = useWorkbenchState(state => state.locale), t = CAPTION_TIMING_MESSAGES[locale]
  const document = source?.identity === identity ? source.content : undefined, basis = current ? plan?.pages.flatMap(page => page.steps).find(step => step.stepId === stepId)?.captionTiming : undefined
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [failure, setFailure] = useState<string>(), [saved, setSaved] = useState(false), [, render] = useState(0)
  const drafts = useRef(new Map<string, Draft>()), alive = useRef(true), request = useRef<AbortController>(), needsRefresh = useRef(false), openRef = useRef(false), composing = useRef(false)
  const latest = useRef({ stepId, onChanged }); latest.current = { stepId, onChanged }
  const draft = drafts.current.get(stepId), value = draft && valueOf(draft), canonical = document?.production.captionTimings?.[stepId]
  const changed = draft && source?.version !== draft.version || draft && basis && (!same(draft.basis, basis) || draft.text !== (document && stepCaptionText(document, stepId)))
  const writable = Boolean(source?.version && source.fingerprint && !source.loading && !source.dirty && !source.saving && !source.composing && !source.restored && !source.recovering && !source.error && !disabled)
  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current?.abort() } }, [])
  useEffect(() => { request.current?.abort(); openRef.current = false; setOpen(false); setBusy(false); setFailure(undefined); setSaved(false) }, [stepId])
  const pending = (next: Draft) => { drafts.current.set(stepId, next); setSaved(false); setFailure(undefined); render(n => n + 1) }
  const initialize = () => {
    if (!document || !source?.version || !basis) return
    const text = stepCaptionText(document, stepId), existing = document.production.captionTimings?.[stepId]
    const original = existing?.sourceFingerprint === captionSourceFingerprint(document, stepId)
    pending({ version: source.version, text, basis: original ? { ...structuredClone(basis), sourceFingerprint: existing.sourceFingerprint, playbackFingerprint: existing.playbackFingerprint, durationMs: existing.durationMs, narrationIds: [...existing.narrationIds] } : structuredClone(basis), rows: original ? existing.segments.map(row => ({ id: row.id, from: row.from, to: row.to, start: String(row.startMs / 1000), end: String(row.endMs / 1000) })) : lineRows(text) })
  }
  const close = () => {
    request.current?.abort(); setBusy(false); openRef.current = false; setOpen(false)
    if (needsRefresh.current) { needsRefresh.current = false; latest.current.onChanged() }
  }
  const apply = async (automatic = false) => {
    if (!document || !source?.version || !source.fingerprint || !writable || busy || composing.current || !automatic && (!value || changed || !current)) return
    const sent = draft, target = stepId, expected = { identity, version: source.version, fingerprint: source.fingerprint }, controller = new AbortController()
    const action: DocumentCaptionTimingAction = automatic ? { type: 'caption.timing.reset', stepId } : { type: 'caption.timing.set', stepId, value: value! }
    request.current = controller; setBusy(true); setFailure(undefined)
    try {
      const answer = await workbench.applyDocumentCaptionTiming(action, crypto.randomUUID(), expected, controller.signal)
      needsRefresh.current = true
      if (!alive.current || workbench.getState().authoring?.identity !== identity) return
      const ownsInput = drafts.current.get(target) === sent
      if (ownsInput) {
        if (automatic) drafts.current.delete(target)
        else if (sent) drafts.current.set(target, { ...sent, version: answer.version })
      }
      if (latest.current.stepId === target) { setSaved(ownsInput); render(n => n + 1) }
      if (!openRef.current) { needsRefresh.current = false; latest.current.onChanged() }
    } catch (error) {
      if (alive.current && request.current === controller && !controller.signal.aborted) setFailure(error instanceof Error && /source|version|playback|revision/.test(error.message) ? t.changed : t.failed)
    } finally { if (alive.current && request.current === controller) { request.current = undefined; setBusy(false) } }
  }
  if (!document?.steps[stepId] || !stepCaptionText(document, stepId).trim()) return null
  return <PmCard>
    <PmButton small disabled={disabled} onClick={() => { if (!drafts.current.has(stepId)) initialize(); openRef.current = true; setOpen(true) }}>{t.open}</PmButton>
    <PmDialog open={open} label={t.title} closeLabel={t.cancel} onClose={close} footer={<>
      <PmButton small onClick={close}>{saved ? t.done : t.cancel}</PmButton>
      <PmButton small variant="primary" loading={busy} disabled={!writable || !current || !value || Boolean(changed) || same(value, canonical)} onClick={() => void apply()}>{t.apply}</PmButton>
    </>}>
      <div className="pmw-caption-times" onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }}>
        <span>{t.step}</span>
        {!basis?.available && <PmNotice tone="warn">{t.unavailable}</PmNotice>}
        {changed && <PmNotice tone="warn">{t.changed}<PmButton small disabled={!basis?.available || busy || !writable || draft?.text !== stepCaptionText(document, stepId)} onClick={() => { if (draft && basis && source?.version) pending({ ...draft, version: source.version, basis: structuredClone(basis) }) }}>{t.recheck}</PmButton></PmNotice>}
        {draft?.rows.map((row, index) => <section key={row.id} className="pmw-caption-times" aria-label={t.segment(index + 1)}>
          <p className="pmw-caption-times__text">{draft.text.slice(row.from, row.to)}</p>
          <div className="pmw-caption-times__range">
            {(['start', 'end'] as const).map(key => <PmInput key={key} label={key === 'start' ? t.start : t.end} inputMode="decimal" maxLength={32} value={row[key]}
              aria-invalid={Boolean(row[key] && seconds(row[key]) === undefined) || undefined} readOnly={disabled}
              onChange={event => pending({ ...draft, rows: draft.rows.map(item => item === row ? { ...row, [key]: event.target.value } : item) })} />)}
          </div>
        </section>)}
        {draft && draft.rows.length > CAPTION_TIMING_MAX_SEGMENTS ? <PmNotice tone="warn">{t.limit}</PmNotice> : draft && draft.rows.every(row => row.start && row.end) && !value ? <PmNotice tone="warn">{t.invalid}</PmNotice> : null}
        <div className="pmw-caption-times__actions">
          <PmButton small disabled={!basis?.available || busy || !writable} onClick={() => { if (document && basis && source?.version) pending({ version: source.version, text: stepCaptionText(document, stepId), basis: structuredClone(basis), rows: lineRows(stepCaptionText(document, stepId)) }) }}>{t.split}</PmButton>
          <PmButton small disabled={!canonical || busy || !writable} onClick={() => void apply(true)}>{t.automatic}</PmButton>
        </div>
        {saved && <PmNotice tone="ok">{t.saved}</PmNotice>}
        {failure && <PmNotice tone="danger">{failure}</PmNotice>}
      </div>
    </PmDialog>
  </PmCard>
}
