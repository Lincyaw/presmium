import { useId, useRef, useState } from 'react'
import type { MediaClip, ProductionAssetInspection } from '@lincyaw/kernel'
import { PmButton, PmField, PmInput, PmNotice, PmRange, PmSelect } from './components.tsx'
import type { ControlDensity } from './components.tsx'
import type { Locale } from './messages.ts'
import { MEDIA_MESSAGES } from './media-messages.ts'

/** Unaccepted input. Untouched fields keep their original numeric precision. */
export interface MediaClipDraft {
  version: string
  clip: MediaClip
  baseClip?: MediaClip
  startText?: string
  endText?: string
  offsetText?: string
}
export interface MediaClipAssetChoice { id: string, label: string }
export interface MediaClipEditorProps {
  locale: Locale
  density?: ControlDensity
  assets: readonly MediaClipAssetChoice[]
  clips: readonly MediaClip[]
  selectedClipId?: string
  draft: MediaClipDraft
  inspection?: ProductionAssetInspection
  stepDurationMs?: number
  disabled?: boolean
  canApply?: boolean
  loading?: boolean
  busy?: 'import' | 'apply' | 'remove'
  pending?: boolean
  review?: boolean
  storageFailed?: boolean
  failure?: string
  status?: string
  retryImport?: boolean
  onSelectClip(id: string | undefined): void
  onSelectAsset(id: string): void
  onChange(draft: MediaClipDraft): void
  onImport(file: File): void
  onRetryImport(): void
  onRead(): void
  onReview(): void
  onApply(clip: MediaClip): void
  onRemove(): void
  onEditStart(): void
}

export function mediaTime(value: number): string {
  const ms = Math.max(0, Math.round(value))
  return `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${(ms % 60000 / 1000).toFixed(3).padStart(6, '0')}`
}
function timeValue(raw: string | undefined, original: number): number | undefined {
  if (raw === undefined || raw === mediaTime(original)) return original
  const match = /^(\d+):([0-5]\d)(?:\.(\d{1,6}))?$/.exec(raw.normalize('NFKC').trim())
  if (!match) return undefined
  const value = Number(match[1]) * 60000 + Number(match[2]) * 1000 + Number(`0.${match[3] ?? '0'}`) * 1000
  return Number.isFinite(value) ? value : undefined
}
function offsetValue(raw: string | undefined, original: number): number | undefined {
  if (raw === undefined || raw === (original / 1000).toFixed(3)) return original
  const text = raw.normalize('NFKC').trim(), value = Number(text) * 1000
  return /^\d+(?:\.\d+)?$/.test(text) && Number.isFinite(value) ? value : undefined
}

/** Compose native public fields; only the caller can adopt a clip into the source. */
export function MediaClipEditor(props: MediaClipEditorProps) {
  const { locale, density = 'compact', assets, clips, selectedClipId, draft, inspection, stepDurationMs, disabled, busy, loading, review } = props
  const t = MEDIA_MESSAGES[locale], file = useRef<HTMLInputElement>(null), composing = useRef(new Set<string>()), [volumePreview, setVolumePreview] = useState<number>()
  const formatId = useId(), rangeErrorId = useId(), clip = draft.clip
  const startMs = timeValue(draft.startText, clip.sourceRange.startMs), endMs = timeValue(draft.endText, clip.sourceRange.endMs), offsetMs = offsetValue(draft.offsetText, clip.attachment.offsetMs)
  const inspected = inspection?.assetId === clip.assetId ? inspection : undefined
  const rangeInvalid = startMs !== undefined && endMs !== undefined && (startMs < 0 || endMs <= startMs || inspected !== undefined && endMs > inspected.durationMs)
  const exceedsStep = stepDurationMs !== undefined && startMs !== undefined && endMs !== undefined && offsetMs !== undefined && offsetMs + endMs - startMs > stepDurationMs
  const rangeError = rangeInvalid ? t.invalidRange : exceedsStep ? t.exceedsStep : undefined
  const rangeDescription = `${formatId}${rangeError ? ` ${rangeErrorId}` : ''}`
  const originalRemoved = Boolean(selectedClipId && !clips.some(clip => clip.id === selectedClipId))
  const valid = Boolean(inspected && startMs !== undefined && endMs !== undefined && offsetMs !== undefined && !rangeInvalid && !exceedsStep && !originalRemoved)
  const submit = () => {
    if (disabled || busy || !props.canApply || review || !valid || composing.current.size) return
    props.onApply({ ...clip, sourceRange: { startMs: startMs!, endMs: endMs! }, attachment: { ...clip.attachment, offsetMs: offsetMs! } })
  }
  const change = (patch: Partial<MediaClipDraft>) => props.onChange({ ...draft, ...patch })
  const composition = (field: string) => ({ onCompositionStart: () => composing.current.add(field), onCompositionEnd: () => { composing.current.delete(field) } })
  return <section className="pm-ui-media-clip-editor" aria-label={t.title} data-density={density} onFocusCapture={props.onEditStart} onPointerDownCapture={props.onEditStart}
    onKeyDown={event => {
      event.stopPropagation()
      if (event.key === 'Enter' && event.target instanceof HTMLInputElement && event.target.type !== 'range' && !event.nativeEvent.isComposing && !composing.current.size) { event.preventDefault(); submit() }
    }}>
    <div className="pm-ui-media-clip-editor__heading"><h2>{t.title}</h2><PmButton density={density} loading={busy === 'import'} disabled={disabled || Boolean(busy)} onClick={() => file.current?.click()}>{t.import}</PmButton>
      <input ref={file} type="file" hidden accept="audio/*,.wav,.ogg,.mp3,.m4a,.webm" onChange={event => { const selected = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (selected && !disabled && !busy) props.onImport(selected) }} />
    </div>
    <PmSelect label={t.asset} density={density} value={clip.assetId} disabled={disabled || Boolean(busy)} onChange={event => props.onSelectAsset(event.target.value)}>
      <option value="">{t.chooseAsset}</option>{assets.map(asset => <option key={asset.id} value={asset.id}>{asset.label}</option>)}
      {clip.assetId && !assets.some(asset => asset.id === clip.assetId) && <option value={clip.assetId}>{clip.assetId}</option>}
    </PmSelect>
    {clips.length > 0 || selectedClipId ? <PmSelect label={t.clip} density={density} value={selectedClipId ?? ''} disabled={disabled || Boolean(busy)} onChange={event => props.onSelectClip(event.target.value || undefined)}>
      <option value="">{t.newClip}</option>{clips.map((clip, index) => <option key={clip.id} value={clip.id}>{t.clipLabel(index, assets.find(asset => asset.id === clip.assetId)?.label ?? clip.assetId)}</option>)}
      {originalRemoved && <option value={selectedClipId}>{t.removed}</option>}
    </PmSelect> : null}
    {clip.assetId && <>
      {loading ? <span className="pm-ui-field__hint" role="status">{t.loading}</span> : inspected && <output className="pm-ui-field__hint">{t.original(mediaTime(inspected.durationMs), valid ? mediaTime(endMs! - startMs!) : undefined)}</output>}
      <div className="pm-ui-media-clip-editor__times">
        <PmInput label={t.in} density={density} width="time" maxLength={32} value={draft.startText ?? mediaTime(clip.sourceRange.startMs)} aria-describedby={rangeDescription} aria-invalid={rangeInvalid || undefined}
          readOnly={disabled || !inspected} error={startMs === undefined ? t.invalidTime : undefined} onChange={event => change({ startText: event.target.value })} {...composition('in')} />
        <PmInput label={t.out} density={density} width="time" maxLength={32} value={draft.endText ?? mediaTime(clip.sourceRange.endMs)} aria-describedby={rangeDescription} aria-invalid={Boolean(rangeError) || undefined}
          readOnly={disabled || !inspected} error={endMs === undefined ? t.invalidTime : undefined} onChange={event => change({ endText: event.target.value })} {...composition('out')} />
      </div>
      <span className="pm-ui-field__hint" id={formatId}>{t.timeFormat}</span>
      {rangeError && <span id={rangeErrorId} className="pm-ui-field__error" role="alert">{rangeError}</span>}
      <PmInput label={t.offset} density={density} width="number" inputMode="decimal" maxLength={32} value={draft.offsetText ?? (clip.attachment.offsetMs / 1000).toFixed(3)}
        readOnly={disabled || !inspected} error={offsetMs === undefined ? t.invalidOffset : undefined} onChange={event => change({ offsetText: event.target.value })} {...composition('offset')} />
      <PmField label={t.volume} density={density} group><div className="pm-ui-media-clip-editor__volume">
        <PmRange label={t.volume} density={density} value={clip.volume * 100} max={100} disabled={disabled || !inspected} valueText={value => `${Math.round(value)}%`} onPreviewChange={setVolumePreview}
          onValueCommit={value => change({ clip: { ...clip, volume: value / 100 } })} />
        <output>{Math.round(volumePreview ?? clip.volume * 100)}%</output><PmButton density={density} aria-pressed={Boolean(clip.muted)} disabled={disabled || !inspected} onClick={() => change({ clip: { ...clip, muted: !clip.muted } })}>{clip.muted ? t.unmute : t.mute}</PmButton>
      </div></PmField>
      <div className="pm-ui-media-clip-editor__actions">
        <PmButton density={density} variant="primary" loading={busy === 'apply'} disabled={disabled || Boolean(busy) || !props.canApply || review || !valid} onClick={submit}>{selectedClipId ? t.apply : t.add}</PmButton>
        <PmButton density={density} disabled={disabled || !inspected} onClick={() => change({ clip: { ...clip, sourceRange: { startMs: 0, endMs: inspected!.durationMs } }, startText: undefined, endText: undefined })}>{t.restore}</PmButton>
        {selectedClipId && <PmButton density={density} variant="danger" loading={busy === 'remove'} disabled={disabled || Boolean(busy) || originalRemoved} onClick={props.onRemove}>{t.remove}</PmButton>}
      </div>
    </>}
    {originalRemoved ? <PmNotice tone="warn">{t.removed}</PmNotice> : review ? <PmNotice tone="warn"><span>{t.review}</span><PmButton density={density} disabled={disabled || Boolean(busy) || !props.canApply || !inspected} onClick={props.onReview}>{t.check}</PmButton></PmNotice>
      : clip.assetId && !props.canApply && !busy && <span className="pm-ui-field__hint">{t.unavailable}</span>}
    {props.failure && <PmNotice tone="danger"><span>{props.failure}</span><PmButton density={density} disabled={disabled || Boolean(busy)} onClick={props.retryImport ? props.onRetryImport : props.onRead}>{props.retryImport ? t.retryImport : t.retry}</PmButton></PmNotice>}
    {props.storageFailed && <PmNotice tone="warn">{t.storageFailed}</PmNotice>}
    {props.pending && !props.failure && <span className="pm-ui-field__hint" role="status">{t.pending}</span>}
    {props.status && <span className="pm-ui-field__hint" role="status">{props.status}</span>}
  </section>
}
