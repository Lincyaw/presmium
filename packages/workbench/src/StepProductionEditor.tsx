import { useEffect, useRef, useState } from 'react'
import type { TeachingDocument } from '@lincyaw/kernel'
import { PmButton, PmField, PmInput, PmSegmented } from './components.tsx'
import type { Locale } from './messages.ts'
import { stepNarrationStarts, stepTimingValue } from './step-production.ts'
import type { ProductionSource, StepDurationDraft, StepDurationKey, StepTimingPatch } from './step-production.ts'

const MESSAGES = {
  'zh-CN': {
    timing: '播放时机', start: '配音开始', during: '同步动画', after: '动画后', minimum: '最短停留', trailing: '结束停顿', automatic: '自动', unit: '毫秒',
    source: { step: '本步设置', section: '继承本页', document: '继承文稿默认', unset: '未设置，使用讲授默认' },
    restore: '使用继承的时机', restoreHint: '只把本步的开始时机、最短停留与结束停顿改回继承值；为单个讲稿设置的时机保留。',
    legacy: '继承讲稿设置', mixed: '本步讲稿的开始时机不同。',
    unify: '统一本步时机', unifyHint: '只覆盖本步；改回继承后继续使用讲稿原有的时机。',
    invalid: '未采用：请输入不小于 0 的毫秒数。',
    review: '草稿尚未采用。请核对当前来源设置，再修改或使用继承值。', pending: '输入尚未采用。', storageFailure: '无法在本机保留草稿，请保持页面打开。',
    count: (index: number, value: string) => `讲稿 ${index}：${value}`,
    advancedDraft: '有未完成的视频设置，请在视频制作中处理。',
  },
  en: {
    timing: 'Playback timing', start: 'Voiceover starts', during: 'With animation', after: 'After animation', minimum: 'Minimum hold', trailing: 'Trailing pause', automatic: 'Auto', unit: 'ms',
    source: { step: 'This step', section: 'Inherited from page', document: 'Inherited from document', unset: 'Not set; the lecture default applies' },
    restore: 'Use Inherited Timing', restoreHint: 'Returns only this step’s start, minimum hold, and trailing pause to the inherited values. Timing set on individual scripts stays.',
    legacy: 'Inherited from the script', mixed: 'Scripts in this step start at different times.',
    unify: 'Unify Step Timing', unifyHint: 'Applies only to this step. Using inherited timing again returns to each script’s original timing.',
    invalid: 'Not applied: enter a duration of 0 ms or more.',
    review: 'This draft has not been applied. Check the current source setting, then edit it or use the inherited value.', pending: 'Input has not been applied.', storageFailure: 'Couldn’t keep the draft on this device. Keep this page open.',
    count: (index: number, value: string) => `Script ${index}: ${value}`,
    advancedDraft: 'Review the pending settings in Video Production.',
  },
}

interface DurationFieldProps {
  label: string
  value?: number
  source: ProductionSource
  locale: Locale
  readOnly?: boolean
  draft?: StepDurationDraft
  onDraft?(draft: StepDurationDraft | undefined): void
  onChange(value: number | null): void
  onComposition?(composing: boolean): void
}

/** Short author intent, never an estimated timestamp or a second playback clock. */
function DurationField({ label, value, source, locale, readOnly, draft, onDraft, onChange, onComposition }: DurationFieldProps) {
  const t = MESSAGES[locale], current = useRef({ onComposition, onChange, onDraft, value })
  current.current = { onComposition, onChange, onDraft, value }
  const [text, setText] = useState(draft?.text ?? (value === undefined ? '' : String(value))), [error, setError] = useState(draft?.error ?? false)
  const focused = useRef(false), composing = useRef(false)
  useEffect(() => { if (!focused.current) { setText(draft?.text ?? (value === undefined ? '' : String(value))); setError(draft?.error ?? false) } }, [value, source, draft?.text, draft?.error, draft?.review])
  useEffect(() => () => { if (composing.current) current.current.onComposition?.(false) }, [])
  const commit = (input: string): boolean => {
    const normalized = input.normalize('NFKC').trim()
    if (!normalized) { setError(false); current.current.onDraft?.(undefined); current.current.onChange(null); return true }
    const number = Number(normalized)
    if (!/^\d+(?:\.\d+)?$/.test(normalized) || !Number.isFinite(number)) { setError(true); current.current.onDraft?.({ text: input, error: true }); return false }
    setError(false); current.current.onDraft?.(undefined); current.current.onChange(number); return true
  }
  return <PmInput label={locale === 'zh-CN' ? `${label}（${t.unit}）` : `${label} (${t.unit})`} width="number" inputMode="decimal" maxLength={256} value={text} placeholder={t.automatic}
    hint={draft && !error && !draft.review ? `${t.source[source]} · ${t.pending}` : t.source[source]} error={draft?.review ? t.review : error ? t.invalid : undefined} readOnly={readOnly}
    onFocus={() => { focused.current = true }}
    onChange={event => {
      setText(event.target.value)
      if (readOnly) return
      if (composing.current) { setError(false); current.current.onDraft?.({ text: event.target.value, error: false }) }
      else commit(event.target.value)
    }}
    onBlur={() => {
      focused.current = false
      if (readOnly || composing.current || error || draft) return
      setText(current.current.value === undefined ? '' : String(current.current.value))
    }}
    onCompositionStart={() => { composing.current = true; onComposition?.(true) }}
    onCompositionEnd={event => {
      composing.current = false
      if (!readOnly) commit(event.currentTarget.value)
      queueMicrotask(() => current.current.onComposition?.(false))
    }} />
}

export interface StepProductionEditorProps {
  document: TeachingDocument
  stepId: string
  locale: Locale
  readOnly?: boolean
  advanced?: boolean
  onPause(): void
  onInteraction?(): void
  onChange(patch: StepTimingPatch): void
  drafts?: Partial<Record<StepDurationKey, StepDurationDraft>>
  draftStorageFailure?: boolean
  onDraft?(key: StepDurationKey, draft: StepDurationDraft | undefined): void
  onComposition?(key: StepDurationKey, composing: boolean): void
}

/** A reusable view of the canonical step production, including inherited and migrated settings. */
export function StepProductionEditor({ document, stepId, locale, readOnly, advanced = true, onPause, onInteraction, onChange, drafts, onDraft, draftStorageFailure, onComposition }: StepProductionEditorProps) {
  const t = MESSAGES[locale], [unifying, setUnifying] = useState(false)
  const start = stepTimingValue(document, stepId, 'narrationStart'), minimum = stepTimingValue(document, stepId, 'minimumHoldMs'), trailing = stepTimingValue(document, stepId, 'trailingPauseMs')
  const narrations = stepNarrationStarts(document, stepId), hasOverrides = narrations.some(value => value.overridden)
  const mixed = new Set(narrations.map(value => value.value ?? 'with-animation')).size > 1
  const hasStepTiming = [start, minimum, trailing].some(value => value.source === 'step')
  const apply = (patch: StepTimingPatch) => { if (!readOnly) { onPause(); onChange(patch) } }
  const options = [{ value: 'with-animation', label: t.during, icon: 'timing-during' as const }, { value: 'after-animation', label: t.after, icon: 'timing-after' as const }]
  return <section className="pm-ui-step-production" contentEditable={false} data-step-production={stepId} aria-label={t.timing}
    onFocus={() => { onInteraction?.(); onPause() }} onKeyDown={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}>
    {advanced && <div className="pm-ui-step-production__heading"><span className="pm-ui-field__label">{t.timing}</span>
      <PmButton small variant="ghost" disabled={readOnly || !hasStepTiming && !drafts?.minimumHoldMs && !drafts?.trailingPauseMs} title={t.restoreHint} onClick={() => { onDraft?.('minimumHoldMs', undefined); onDraft?.('trailingPauseMs', undefined); apply({ narrationStart: null, minimumHoldMs: null, trailingPauseMs: null }) }}>{t.restore}</PmButton>
    </div>}
    {!advanced ? <PmField group label={t.start} density="compact" hint={mixed ? t.mixed : undefined}>
      <div className="pm-ui-step-production__actions"><PmSegmented label={t.start} value={mixed ? '' : narrations[0]?.value ?? start.value ?? 'with-animation'} options={options} disabled={readOnly} onChange={value => apply({ narrationStart: value as 'with-animation' | 'after-animation' })} /></div>
    </PmField> : <><PmField group label={t.start} density="compact" hint={hasOverrides ? (mixed ? t.mixed : t.legacy) : t.source[start.source]}>
      {!hasOverrides && <div className="pm-ui-step-production__actions"><PmSegmented label={t.start} value={start.value ?? ''} options={options} disabled={readOnly} onChange={value => apply({ narrationStart: value as 'with-animation' | 'after-animation' })} /></div>}
      {hasOverrides && <>
        <div className="pm-ui-step-production__narration-settings">{narrations.map((entry, index) => <span key={entry.id} className="pm-ui-field__hint">{t.count(index + 1, entry.value === 'after-animation' ? t.after : t.during)}{entry.overridden ? ` · ${t.legacy}` : ` · ${t.source[start.source]}`}</span>)}</div>
        <div className="pm-ui-step-production__actions"><PmButton small disabled={readOnly} onClick={() => setUnifying(value => !value)} aria-expanded={unifying}>{t.unify}</PmButton></div>
        {unifying && <><span className="pm-ui-field__hint">{t.unifyHint}</span><div className="pm-ui-step-production__actions"><PmSegmented label={t.unify} value="" options={options} disabled={readOnly} onChange={value => { apply({ narrationStart: value as 'with-animation' | 'after-animation' }); setUnifying(false) }} /></div></>}
      </>}
    </PmField>
    <div className="pm-ui-step-production__durations">
      <DurationField label={t.minimum} value={minimum.value} source={minimum.source} locale={locale} readOnly={readOnly} draft={drafts?.minimumHoldMs} onDraft={draft => onDraft?.('minimumHoldMs', draft)}
        onChange={value => apply({ minimumHoldMs: value })} onComposition={composing => onComposition?.('minimumHoldMs', composing)} />
      <DurationField label={t.trailing} value={trailing.value} source={trailing.source} locale={locale} readOnly={readOnly} draft={drafts?.trailingPauseMs} onDraft={draft => onDraft?.('trailingPauseMs', draft)}
        onChange={value => apply({ trailingPauseMs: value })} onComposition={composing => onComposition?.('trailingPauseMs', composing)} />
    </div></>}
    {!advanced && (drafts?.minimumHoldMs || drafts?.trailingPauseMs || draftStorageFailure) ? <span className="pm-ui-field__error" role="alert">{t.advancedDraft}</span>
      : draftStorageFailure && <span className="pm-ui-field__error" role="alert">{t.storageFailure}</span>}
  </section>
}
