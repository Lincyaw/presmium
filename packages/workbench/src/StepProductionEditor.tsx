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
    restore: '恢复本步继承', restoreHint: '仅恢复本步的开始时机、最短停留与结束停顿；讲稿单独设置保留。',
    legacy: '继承讲稿设置', mixed: '本步讲稿的开始时机不同。',
    unify: '统一本步时机', unifyHint: '仅覆盖本步；恢复继承后继续使用讲稿原有时机。',
    invalid: '未采用：请输入不小于 0 的毫秒数。', intent: '此处设置讲授时序；文档内预览只播放动画，不生成配音。',
    review: '暂存输入尚未采用。请核对当前来源设置，再修改或恢复继承。', storageFailure: '临时输入暂存失败，请保持页面打开并保留输入。',
    count: (index: number, value: string) => `讲稿 ${index}：${value}`,
  },
  en: {
    timing: 'Playback timing', start: 'Narration starts', during: 'With animation', after: 'After animation', minimum: 'Minimum hold', trailing: 'Trailing pause', automatic: 'Auto', unit: 'ms',
    source: { step: 'This step', section: 'Inherited from page', document: 'Inherited from document', unset: 'Unset; lecture default applies' },
    restore: 'Restore step inheritance', restoreHint: 'Restores only this step’s start, hold and trailing pause. Narration overrides stay.',
    legacy: 'Inherited from narration', mixed: 'Narrations in this step start at different times.',
    unify: 'Unify this step’s timing', unifyHint: 'Applies only to this step. Restoring inheritance returns to the original narration settings.',
    invalid: 'Not applied: enter a duration of 0 ms or more.', intent: 'These settings control the lecture. The document preview plays animation without generating speech.',
    review: 'This draft has not been applied. Check the current source setting, then edit it or restore inheritance.', storageFailure: 'The pending input could not be stored. Keep this page open and retain the input.',
    count: (index: number, value: string) => `Narration ${index}: ${value}`,
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
  const commit = (input: string, reportError = true): boolean => {
    const normalized = input.normalize('NFKC').trim()
    if (!normalized) { setError(false); current.current.onDraft?.(undefined); current.current.onChange(null); return true }
    const number = Number(normalized)
    if (!/^\d+(?:\.\d+)?$/.test(normalized) || !Number.isFinite(number)) { if (reportError) setError(true); current.current.onDraft?.({ text: input, error: reportError }); return false }
    setError(false); current.current.onDraft?.(undefined); current.current.onChange(number); return true
  }
  return <PmInput label={locale === 'zh-CN' ? `${label}（${t.unit}）` : `${label} (${t.unit})`} width="number" inputMode="decimal" maxLength={256} value={text} placeholder={t.automatic}
    hint={t.source[source]} error={draft?.review ? t.review : error ? t.invalid : undefined} readOnly={readOnly}
    onFocus={() => { focused.current = true }}
    onChange={event => { setText(event.target.value); if (!readOnly) commit(event.target.value, !composing.current) }}
    onBlur={event => {
      focused.current = false
      if (composing.current || !readOnly && !commit(event.target.value)) return
      current.current.onDraft?.(undefined)
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
  onPause(): void
  onInteraction?(): void
  onChange(patch: StepTimingPatch): void
  drafts?: Partial<Record<StepDurationKey, StepDurationDraft>>
  draftStorageFailure?: boolean
  onDraft?(key: StepDurationKey, draft: StepDurationDraft | undefined): void
  onComposition?(key: StepDurationKey, composing: boolean): void
}

/** A reusable view of the canonical step production, including inherited and migrated settings. */
export function StepProductionEditor({ document, stepId, locale, readOnly, onPause, onInteraction, onChange, drafts, onDraft, draftStorageFailure, onComposition }: StepProductionEditorProps) {
  const t = MESSAGES[locale], [unifying, setUnifying] = useState(false)
  const start = stepTimingValue(document, stepId, 'narrationStart'), minimum = stepTimingValue(document, stepId, 'minimumHoldMs'), trailing = stepTimingValue(document, stepId, 'trailingPauseMs')
  const narrations = stepNarrationStarts(document, stepId), hasOverrides = narrations.some(value => value.overridden)
  const mixed = new Set(narrations.map(value => value.value ?? 'with-animation')).size > 1
  const hasStepTiming = [start, minimum, trailing].some(value => value.source === 'step')
  const apply = (patch: StepTimingPatch) => { if (!readOnly) { onPause(); onChange(patch) } }
  const options = [{ value: 'with-animation', label: t.during, icon: 'timing-during' as const }, { value: 'after-animation', label: t.after, icon: 'timing-after' as const }]
  return <section className="pm-ui-step-production" contentEditable={false} data-step-production={stepId} aria-label={t.timing}
    onFocus={() => { onInteraction?.(); onPause() }} onKeyDown={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}>
    <div className="pm-ui-step-production__heading"><span className="pm-ui-field__label">{t.timing}</span>
      <PmButton small variant="ghost" disabled={readOnly || !hasStepTiming && !drafts?.minimumHoldMs && !drafts?.trailingPauseMs} title={t.restoreHint} onClick={() => { onDraft?.('minimumHoldMs', undefined); onDraft?.('trailingPauseMs', undefined); apply({ narrationStart: null, minimumHoldMs: null, trailingPauseMs: null }) }}>{t.restore}</PmButton>
    </div>
    <PmField group label={t.start} density="compact" hint={hasOverrides ? (mixed ? t.mixed : t.legacy) : t.source[start.source]}>
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
    </div>
    <span className="pm-ui-field__hint">{t.intent}</span>
    {draftStorageFailure && <span className="pm-ui-field__error" role="alert">{t.storageFailure}</span>}
  </section>
}
