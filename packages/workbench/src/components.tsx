import type { IconName } from '@lincyaw/design'
import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Popover from '@radix-ui/react-popover'
import * as Tabs from '@radix-ui/react-tabs'
import * as Toolbar from '@radix-ui/react-toolbar'
import * as RadioGroup from '@radix-ui/react-radio-group'
import { forwardRef, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { CSSProperties, InputHTMLAttributes, ReactNode, Ref, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { PmButton, PmIcon, PmIconButton, PmTooltip } from './base-controls.tsx'
import type { ControlDensity } from './base-controls.tsx'
export { PmButton, PmIcon, PmIconButton, PmTooltip } from './base-controls.tsx'
export type { ButtonVariant, ControlDensity } from './base-controls.tsx'
export { PmSortableList } from './sortable-list.tsx'
export type { SortableListItem, SortableListLabels, SortableListProps } from './sortable-list.tsx'

const cls = (...names: (string | false | undefined | null)[]) => names.filter(Boolean).join(' ')

/** One tab stop, with arrow/Home/End navigation supplied by Radix. */
export function PmToolbar({ label, children, className }: { label: string, children: ReactNode, className?: string }) {
  return <Toolbar.Root className={className} aria-label={label} loop>{children}</Toolbar.Root>
}
export const PmToolbarButton = Toolbar.Button

export interface Choice { value: string, label: string, icon?: IconName, disabled?: boolean }
export function PmTabs({ value, tabs, label, iconOnly, density = 'compact', idPrefix, onValueChange, children }: { value: string, tabs: Choice[], label: string, iconOnly?: boolean, density?: ControlDensity, idPrefix?: string, onValueChange(value: string): void, children?: ReactNode }) {
  return <Tabs.Root value={value} onValueChange={onValueChange} activationMode="manual" className="pm-ui-tabs-root" data-density={density}>
    <Tabs.List className="pm-ui-tabs" aria-label={label}>{tabs.map(tab => {
      const trigger = <Tabs.Trigger className="pm-ui-tab" value={tab.value} id={idPrefix ? `${idPrefix}-${tab.value}-tab` : undefined} aria-controls={idPrefix ? `${idPrefix}-${tab.value}-panel` : undefined} disabled={tab.disabled} aria-label={tab.label} data-icon-only={iconOnly || undefined}>{tab.icon && <PmIcon name={tab.icon} />}{!iconOnly && tab.label}</Tabs.Trigger>
      return iconOnly ? <PmTooltip key={tab.value} label={tab.label}>{trigger}</PmTooltip> : <span key={tab.value} className="pm-ui-tab-slot">{trigger}</span>
    })}</Tabs.List>{children}
  </Tabs.Root>
}
export function PmTabPanel({ value, children }: { value: string, children: ReactNode }) {
  return <Tabs.Content value={value} className="pm-ui-tab-panel">{children}</Tabs.Content>
}
export function PmSegmented({ label, value, options, density = 'compact', disabled, onChange }: { label: string, value: string, options: Choice[], density?: ControlDensity, disabled?: boolean, onChange(value: string): void }) {
  return <RadioGroup.Root className="pm-ui-segmented" aria-label={label} value={value} onValueChange={onChange} orientation="horizontal" data-density={density} disabled={disabled}>
    {options.map(option => <RadioGroup.Item key={option.value} className="pm-ui-segmented__option" value={option.value} disabled={option.disabled}>{option.icon && <PmIcon name={option.icon} />}{option.label}</RadioGroup.Item>)}
  </RadioGroup.Root>
}

export interface SearchListItem {
  value: string
  label: string
  /** Non-interactive supporting text; actions belong outside the choice. */
  description?: ReactNode
  keywords?: readonly string[]
  icon?: IconName
  disabled?: boolean
}
export interface SearchListProps {
  label: string
  searchLabel: string
  searchPlaceholder?: string
  items: readonly SearchListItem[]
  value?: string
  onValueChange(value: string): void
  query?: string
  onQueryChange?(query: string): void
  resultsLabel(count: number): string
  emptyLabel: string
  loadingLabel: string
  loading?: boolean
  error?: ReactNode
  disabled?: boolean
  density?: ControlDensity
  autoFocus?: boolean
  'aria-describedby'?: string
}

/** Search and a single choice compose with Dialog; Radix owns radio navigation and selection. */
export function PmSearchList({ label, searchLabel, searchPlaceholder, items, value, onValueChange, query, onQueryChange, resultsLabel, emptyLabel, loadingLabel, loading, error, disabled, density = 'compact', autoFocus, 'aria-describedby': describedBy }: SearchListProps) {
  const id = useId()
  const [localQuery, setLocalQuery] = useState('')
  const list = useRef<HTMLDivElement>(null)
  const search = query ?? localQuery
  const matches = useMemo(() => {
    const terms = search.normalize('NFKC').toLowerCase().trim().split(/\s+/).filter(Boolean)
    return items.filter(item => {
      const text = [item.label, ...item.keywords ?? []].join(' ').normalize('NFKC').toLowerCase()
      return terms.every(term => text.includes(term))
    })
  }, [items, search])
  const blocked = Boolean(disabled || loading || error)
  const errorId = error ? `${id}-error` : undefined
  return <div className="pm-ui-search-list" data-density={density}>
    <PmInput label={searchLabel} value={search} placeholder={searchPlaceholder} prefixIcon="search" density={density} disabled={disabled} autoFocus={autoFocus} aria-controls={`${id}-results`} onChange={event => {
      if (query === undefined) setLocalQuery(event.target.value)
      onQueryChange?.(event.target.value)
    }} onKeyDown={event => {
      if (event.key !== 'ArrowDown' || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
      const selected = list.current?.querySelector<HTMLElement>('[role="radio"][data-state="checked"]:not(:disabled)')
      const first = selected ?? list.current?.querySelector<HTMLElement>('[role="radio"]:not(:disabled)')
      if (first) { event.preventDefault(); first.focus() }
    }} />
    <div className="pm-ui-search-list__heading"><span id={`${id}-label`}>{label}</span><span className="pm-ui-search-list__count" role="status" aria-live="polite" aria-atomic="true">{loading && <span className="pm-ui-loading" aria-hidden="true"><PmIcon name="loading" /></span>}{loading ? loadingLabel : resultsLabel(matches.length)}</span></div>
    {error && <p id={errorId} className="pm-ui-field__error" role="alert">{error}</p>}
    <RadioGroup.Root ref={list} id={`${id}-results`} className="pm-ui-search-list__results" aria-labelledby={`${id}-label`} aria-describedby={[describedBy, errorId].filter(Boolean).join(' ') || undefined} aria-invalid={error ? true : undefined} aria-busy={loading || undefined} value={value ?? ''} disabled={blocked} orientation="vertical" loop onValueChange={next => { if (!blocked) onValueChange(next) }}>
      {matches.map((item, index) => <RadioGroup.Item key={item.value} value={item.value} disabled={item.disabled} className="pm-ui-search-list__option" aria-labelledby={`${id}-option-${index}`} aria-describedby={item.description ? `${id}-description-${index}` : undefined}>
        {item.icon && <PmIcon name={item.icon} />}
        <span className="pm-ui-search-list__text"><span id={`${id}-option-${index}`}>{item.label}</span>{item.description && <span id={`${id}-description-${index}`} className="pm-ui-search-list__description">{item.description}</span>}</span>
        <span className="pm-ui-search-list__check" aria-hidden="true">{item.value === value && <PmIcon name="check" />}</span>
      </RadioGroup.Item>)}
      {!matches.length && !loading && !error && <p className="pm-ui-search-list__empty">{emptyLabel}</p>}
    </RadioGroup.Root>
  </div>
}

export type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger' | 'outline'

export function PmBadge({ tone = 'neutral', pill, children }: { tone?: Tone, pill?: boolean, children?: ReactNode }) {
  return <span className={cls('pm-ui-badge', tone !== 'neutral' && `pm-ui-badge--${tone}`, pill && 'pm-ui-badge--pill')}>{children}</span>
}

export function PmCard({ variant = 'default', className, children, ...rest }: { variant?: 'default' | 'interactive' | 'dashed', className?: string, children?: ReactNode, [attribute: `data-${string}`]: string | undefined }) {
  return <div className={cls('pm-ui-card', variant !== 'default' && `pm-ui-card--${variant}`, className)} {...rest}>{children}</div>
}

export function PmField({ label, inline, group, hint, error, htmlFor, hintId, errorId, density, children }: { label: string, inline?: boolean, group?: boolean, hint?: ReactNode, error?: ReactNode, htmlFor?: string, hintId?: string, errorId?: string, density?: ControlDensity, children?: ReactNode }) {
  const feedback = <>{hint && <span id={hintId} className="pm-ui-field__hint">{hint}</span>}{error && <span id={errorId} className="pm-ui-field__error" role="alert">{error}</span>}</>
  if (group) return <div className="pm-ui-field" data-density={density} role="group" aria-label={label}><span className="pm-ui-field__label">{label}</span>{children}{feedback}</div>
  return (
    <label className={cls('pm-ui-field', inline && 'pm-ui-field--inline')} data-density={density} htmlFor={htmlFor}>
      {inline ? <>{children}<span id={htmlFor ? `${htmlFor}-label` : undefined} className="pm-ui-field__label">{label}</span></> : <><span id={htmlFor ? `${htmlFor}-label` : undefined} className="pm-ui-field__label">{label}</span>{children}</>}
      {feedback}
    </label>
  )
}

type FieldProps = { label: string, hint?: ReactNode, error?: ReactNode, density?: ControlDensity }
function useField({ id, hint, error, 'aria-describedby': describedBy }: { id?: string, hint?: ReactNode, error?: ReactNode, 'aria-describedby'?: string }) {
  const generated = useId()
  const controlId = id ?? generated
  return { id: controlId, hintId: hint ? `${controlId}-hint` : undefined, errorId: error ? `${controlId}-error` : undefined,
    describedBy: [describedBy, hint && `${controlId}-hint`, error && `${controlId}-error`].filter(Boolean).join(' ') || undefined }
}
export const PmInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldProps & { prefixIcon?: IconName, suffix?: ReactNode, width?: 'number' | 'time' }>(function PmInput({ label, hint, error, density = 'compact', prefixIcon, suffix, width, className, ...rest }, ref) {
  const field = useField({ ...rest, hint, error })
  const input = <input {...rest} ref={ref} id={field.id} data-density={density} data-width={width} aria-labelledby={rest['aria-labelledby'] ?? (rest['aria-label'] ? undefined : `${field.id}-label`)} aria-invalid={error ? true : rest['aria-invalid']} aria-describedby={field.describedBy} className={cls('pm-ui-input', className)} />
  return <PmField label={label} hint={hint} error={error} htmlFor={field.id} hintId={field.hintId} errorId={field.errorId} density={density}>
    {prefixIcon || suffix ? <span className="pm-ui-control" data-width={width} data-density={density}>{prefixIcon && <span className="pm-ui-control__prefix"><PmIcon name={prefixIcon} /></span>}{input}{suffix && <span className="pm-ui-control__suffix">{suffix}</span>}</span> : input}
  </PmField>
})
export const PmTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps & { autoGrow?: boolean }>(function PmTextarea({ label, hint, error, density = 'compact', autoGrow, className, ...rest }, ref) {
  const field = useField({ ...rest, hint, error })
  const node = useRef<HTMLTextAreaElement | null>(null)
  useEffect(() => {
    if (!autoGrow || !node.current) return
    node.current.style.height = 'auto'
    node.current.style.height = `${node.current.scrollHeight}px`
  }, [autoGrow, rest.value])
  return <PmField label={label} hint={hint} error={error} htmlFor={field.id} hintId={field.hintId} errorId={field.errorId} density={density}>
    <textarea {...rest} ref={element => { node.current = element; if (typeof ref === 'function') ref(element); else if (ref) ref.current = element }} id={field.id} data-density={density} aria-labelledby={rest['aria-labelledby'] ?? (rest['aria-label'] ? undefined : `${field.id}-label`)} aria-invalid={error ? true : rest['aria-invalid']} aria-describedby={field.describedBy} className={cls('pm-ui-textarea', className)} />
  </PmField>
})
export const PmSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & FieldProps>(function PmSelect({ label, hint, error, density = 'compact', className, children, ...rest }, ref) {
  const field = useField({ ...rest, hint, error })
  return <PmField label={label} hint={hint} error={error} htmlFor={field.id} hintId={field.hintId} errorId={field.errorId} density={density}>
    <select {...rest} ref={ref} id={field.id} data-density={density} aria-labelledby={rest['aria-labelledby'] ?? (rest['aria-label'] ? undefined : `${field.id}-label`)} aria-invalid={error ? true : rest['aria-invalid']} aria-describedby={field.describedBy} className={cls('pm-ui-select', className)}>{children}</select>
  </PmField>
})

export type PopoverPlacement = 'below-end' | 'below-start' | 'above-end' | 'above-start'
const placementOf = (placement: PopoverPlacement) => ({ side: placement.startsWith('above') ? 'top' as const : 'bottom' as const, align: placement.endsWith('start') ? 'start' as const : 'end' as const })

export function PmDialog({ open, label, closeLabel, name, actions, description, footer, busy, onClose, onOpenAutoFocus, onCloseAutoFocus, children }: { open: boolean, label: string, closeLabel: string, name?: string, actions?: ReactNode, description?: string, footer?: ReactNode, busy?: boolean, onClose(): void, onOpenAutoFocus?(event: Event): void, onCloseAutoFocus?(event: Event): void, children?: ReactNode }) {
  const id = useId()
  // A descendant's React autoFocus runs before Radix's open-focus event.
  const trigger = useRef<HTMLElement | null>(typeof document === 'undefined' ? null : document.activeElement as HTMLElement)
  useEffect(() => {
    if (open) return
    const remember = (event: FocusEvent) => {
      const element = event.target
      if (element instanceof HTMLElement && element !== document.body && element.closest('[data-pm-dialog]')?.getAttribute('data-pm-dialog') !== id) trigger.current = element
    }
    document.addEventListener('focusin', remember, true)
    return () => document.removeEventListener('focusin', remember, true)
  }, [id, open])
  return (
    <Dialog.Root open={open} modal onOpenChange={next => { if (!next && !busy) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="pm-ui-dialog-overlay" />
        <Dialog.Content className={cls('pm-ui-dialog', 'pm-ui', name && `${name}__panel`)} data-pm-dialog={id} data-density="regular" aria-modal="true" aria-busy={busy || undefined} {...description ? {} : { 'aria-describedby': undefined }} onInteractOutside={event => event.preventDefault()} onEscapeKeyDown={event => { event.stopPropagation(); if (busy) event.preventDefault() }} onOpenAutoFocus={event => {
          onOpenAutoFocus?.(event)
          if (event.defaultPrevented || !(event.target instanceof HTMLElement)) return
          const panel = event.target
          if (panel.contains(document.activeElement)) { event.preventDefault(); return }
          const target = [...panel.querySelectorAll<HTMLElement>('.pm-ui-dialog__body :is(button, input, textarea, select, a[href], [tabindex]), .pm-ui-dialog__footer :is(button, input, textarea, select, a[href], [tabindex])')].find(element => element.tabIndex >= 0 && !element.closest('[inert], [hidden]') && !element.matches(':disabled, [aria-disabled="true"]') && element.getClientRects().length && getComputedStyle(element).visibility === 'visible')
          if (target) { event.preventDefault(); target.focus() }
        }} onCloseAutoFocus={event => {
          onCloseAutoFocus?.(event)
          if (event.defaultPrevented) return
          event.preventDefault()
          const available = (element: HTMLElement | null): element is HTMLElement => Boolean(element?.isConnected && element !== document.body && !element.closest(`[data-pm-dialog="${id}"], [inert], [hidden]`) && !element.matches(':disabled, [aria-disabled="true"]') && element.getClientRects().length && getComputedStyle(element).visibility === 'visible')
          const target = available(trigger.current) ? trigger.current : [...document.querySelectorAll<HTMLElement>('[role="toolbar"] button, main button')].find(available)
          target?.focus()
        }}>
          <div className="pm-ui-dialog__header">
            <Dialog.Title className="pm-ui-dialog__title">{label}</Dialog.Title>
            {actions}
            <Dialog.Close asChild><PmIconButton icon="close" label={closeLabel} small disabled={busy} /></Dialog.Close>
          </div>
          {description && <Dialog.Description className="pm-ui-dialog__description">{description}</Dialog.Description>}
          <div className="pm-ui-dialog__body">{children}</div>
          {footer && <div className="pm-ui-dialog__footer">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

/** A non-modal floating panel on its trigger, with the shared `pm-ui-popover` surface (host's PmPopover for React pages). */
export function PmPopover({ open, label, name, placement = 'below-end', trigger, onOpenChange, children }: { open: boolean, label: string, name?: string, placement?: PopoverPlacement, trigger: ReactNode, onOpenChange(open: boolean): void, children?: ReactNode }) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger asChild>{trigger}</Popover.Trigger>
      <Popover.Portal>
        <Popover.Content className={cls('pm-ui-popover', 'pm-ui-floating', 'pm-ui', name)} aria-label={label} {...placementOf(placement)} sideOffset={6} collisionPadding={16} onEscapeKeyDown={event => event.stopPropagation()}>
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}

export interface MenuItem {
  id: string
  label: string
  icon?: IconName
  danger?: boolean
  disabled?: boolean
  shortcut?: string
  checked?: boolean
  separator?: boolean
}

/** `toolbarItem`: the trigger joins the surrounding `PmToolbar`'s arrow-key navigation, e.g. as its overflow ("More") menu. */
export function PmMenu({ label, description, items, icon = 'more', placement = 'below-end', triggerRef, toolbarItem, onSelect }: { label: string, description?: string, items: MenuItem[], icon?: IconName, placement?: PopoverPlacement, triggerRef?: Ref<HTMLButtonElement>, toolbarItem?: boolean, onSelect(id: string): void }) {
  const descriptionId = useId()
  const trigger = <PmIconButton ref={triggerRef} icon={icon} label={label} small />
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{toolbarItem ? <Toolbar.Button asChild>{trigger}</Toolbar.Button> : trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="pm-ui-menu pm-ui-floating pm-ui" data-density="compact" data-description={description ? '' : undefined} aria-label={label} aria-describedby={description ? descriptionId : undefined} {...placementOf(placement)} sideOffset={6} collisionPadding={16} onEscapeKeyDown={event => event.stopPropagation()}>
          {description && <p className="pm-ui-menu__description" id={descriptionId}>{description}</p>}
          {items.map(item => (
            <DropdownMenu.Group key={item.id}>{item.separator && <DropdownMenu.Separator className="pm-ui-menu__separator" />}{item.checked === undefined ? <DropdownMenu.Item textValue={item.label} className={cls('pm-ui-menu__item', item.danger && 'pm-ui-menu__item--danger')} disabled={item.disabled} onSelect={() => onSelect(item.id)}>
              {item.icon && <PmIcon name={item.icon} />}{item.label}{item.shortcut && <kbd className="pm-ui-shortcut">{item.shortcut}</kbd>}
            </DropdownMenu.Item> : <DropdownMenu.CheckboxItem className="pm-ui-menu__item" checked={item.checked} disabled={item.disabled} textValue={item.label} onSelect={() => onSelect(item.id)}><DropdownMenu.ItemIndicator><PmIcon name="check" /></DropdownMenu.ItemIndicator>{item.label}</DropdownMenu.CheckboxItem>}</DropdownMenu.Group>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

export function PmEmpty({ title, icon, action, children }: { title?: string, icon?: IconName, action?: ReactNode, children?: ReactNode }) {
  return (
    <div className="pm-ui-empty">
      {icon && <PmIcon name={icon} size={28} />}
      {title && <p className="pm-ui-empty__title">{title}</p>}
      {children && <p className="pm-ui-empty__body">{children}</p>}
      {action}
    </div>
  )
}

/** Loading in the shape of the content: `document` is a page of headings and paragraphs, `list` a column of rows and
 * `preview` a slide-shaped area. The label is the status read to assistive technology. */
export function PmSkeleton({ label, shape = 'document' }: { label: string, shape?: 'document' | 'list' | 'preview' }) {
  const bar = (kind?: 'heading' | 'row' | 'media', key?: number) => <span key={key} className="pm-ui-skeleton__bar" data-kind={kind} />
  const paragraph = (lines: number, key: number) => <span key={key} className="pm-ui-skeleton__group">{Array.from({ length: lines }, (_, index) => bar(undefined, index))}</span>
  return (
    <div className="pm-ui-skeleton" data-shape={shape} role="status" aria-busy="true">
      <span className="pm-ui-sr-only">{label}</span>
      <span className="pm-ui-skeleton" aria-hidden="true">
        {shape === 'list' ? Array.from({ length: 5 }, (_, index) => bar('row', index))
          : shape === 'preview' ? <>{bar('media')}{paragraph(2, 0)}</>
            : <>{bar('heading')}{paragraph(4, 0)}{paragraph(3, 1)}{bar('heading')}{paragraph(4, 2)}</>}
      </span>
    </div>
  )
}

export function PmNotice({ tone = 'neutral', children }: { tone?: 'neutral' | 'accent' | 'ok' | 'warn' | 'danger', children?: ReactNode }) {
  return <div className={cls('pm-ui-notice', tone !== 'neutral' && `pm-ui-notice--${tone}`)} role={tone === 'danger' ? 'alert' : 'status'}>{children}</div>
}

export interface RangeProps {
  label: string
  value: number
  min?: number
  max: number
  step?: number
  disabled?: boolean
  density?: ControlDensity
  valueText?(value: number): string
  onValueCommit(value: number): void
  onPreviewChange?(value: number | undefined): void
}

/** Native range owns pointer/keyboard mechanics; only a committed gesture requests adoption. */
export function PmRange({ label, value, min = 0, max, step = 1, disabled, density = 'compact', valueText, onValueCommit, onPreviewChange }: RangeProps) {
  const [draft, setDraft] = useState<number>()
  const pointer = useRef<'active' | 'cancelled'>(), latest = useRef<number>(), preview = useRef(onPreviewChange)
  preview.current = onPreviewChange
  const blocked = Boolean(disabled || !Number.isFinite(min) || !Number.isFinite(max) || max <= min)
  const minimum = Number.isFinite(min) ? min : 0, maximum = Number.isFinite(max) ? Math.max(minimum, max) : minimum
  const bounded = (next: number) => Math.max(minimum, Math.min(maximum, Number.isFinite(next) ? next : minimum))
  const current = bounded(draft ?? value), progress = max > min ? (current - min) / (max - min) * 100 : 0
  const cancel = () => { if (pointer.current) pointer.current = 'cancelled'; latest.current = undefined; setDraft(undefined); preview.current?.(undefined) }
  useEffect(() => { cancel() }, [blocked, min, max])
  useEffect(() => () => { pointer.current = undefined; latest.current = undefined; preview.current?.(undefined) }, [])
  return <input type="range" className="pm-ui-range" data-density={density} aria-label={label} aria-valuetext={valueText?.(current)} min={minimum} max={maximum} step={step} value={current} disabled={blocked}
    style={{ '--pm-range-progress': `${progress}%` } as CSSProperties}
    onPointerDown={() => { if (!blocked) pointer.current = 'active' }}
    onPointerCancel={() => { cancel(); pointer.current = undefined }} onBlur={cancel}
    onPointerUp={() => { const active = pointer.current === 'active', next = latest.current; cancel(); pointer.current = undefined; if (active && !blocked && next !== undefined) onValueCommit(next) }}
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); cancel() } }}
    onChange={event => {
      if (blocked || pointer.current === 'cancelled') return
      const next = bounded(event.currentTarget.valueAsNumber)
      if (pointer.current === 'active') { latest.current = next; setDraft(next); preview.current?.(next) }
      else onValueCommit(next)
    }} />
}

export type TimelineTiming = 'confirmed' | 'estimated' | 'unknown'
export interface TimelineSegment {
  id: string
  stepId?: string
  label: string
  startMs?: number
  endMs?: number
  timing: TimelineTiming
  statusLabel?: string
  disabled?: boolean
  /** Real normalized peak amplitudes; absence never produces a decorative waveform. */
  waveform?: readonly number[]
}
export interface TimelineTrack { id: 'visual' | 'voice' | 'caption', label: string, segments: readonly TimelineSegment[] }
export interface TimelineLabels {
  position: string
  seconds: string
  seek: string
  zoomIn: string
  zoomOut: string
  fit: string
  estimated: string
  unknown: string
  loading: string
  empty: string
  seekHint: string
  invalidPosition: string
}
export interface TimelineProps {
  label: string
  tracks: readonly TimelineTrack[]
  labels: TimelineLabels
  durationMs?: number
  durationStatus?: TimelineTiming
  currentTimeMs?: number
  selectedStepId?: string
  zoom?: number
  onZoomChange?(zoom: number): void
  onSelectStep(stepId: string): void
  /** Optional segment activation; the caller owns whether its confirmed time may be sought. */
  onSelectSegment?(track: TimelineTrack['id'], segment: TimelineSegment): void
  /** Full-size narrow/coarse alternative to short proportional segments; no timing is inferred here. */
  segmentPicker?: { track: TimelineTrack['id'], ids: readonly string[], label: string, placeholder: string }
  /** Caller pauses and confirms its source/clock before updating controlled currentTimeMs. */
  onSeek(timeMs: number): void
  seekDisabled?: boolean
  disabled?: boolean
  loading?: boolean
  seeking?: boolean
  density?: ControlDensity
}

const timelineTime = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${(ms % 60000 / 1000).toFixed(3).padStart(6, '0')}`
function waveformPath(samples: readonly number[] | undefined): string | undefined {
  if (!samples?.length || !samples.every(value => Number.isFinite(value) && value >= 0 && value <= 1)) return undefined
  const length = Math.min(160, samples.length)
  return Array.from({ length }, (_, index) => {
    let peak = 0
    for (let at = Math.floor(index * samples.length / length); at < Math.floor((index + 1) * samples.length / length); at++) peak = Math.max(peak, samples[at]!)
    return `M${(index + 0.5) / length * 160},${10 - peak * 10}V${10 + peak * 10}`
  }).join(' ')
}

/** Data-only timeline; source, playback, seeking authority and all labels remain with its caller. */
export function PmTimeline({ label, tracks, labels, durationMs, durationStatus, currentTimeMs, selectedStepId, zoom, onZoomChange, onSelectStep, onSelectSegment, segmentPicker, onSeek, seekDisabled, disabled, loading, seeking, density = 'compact' }: TimelineProps) {
  const hintId = useId()
  const viewport = useRef<HTMLDivElement>(null), tick = useRef<HTMLSpanElement>(null), composing = useRef(false)
  const [width, setWidth] = useState(0), [tickWidth, setTickWidth] = useState(1), [localZoom, setLocalZoom] = useState(1), [raw, setRaw] = useState<string>(), [previewTime, setPreviewTime] = useState<number>()
  const span = Number.isFinite(durationMs) && durationMs! >= 0 ? durationMs : undefined
  const timing = durationStatus ?? (span === undefined ? 'unknown' : 'confirmed')
  const timed = span !== undefined && span > 0 && timing !== 'unknown'
  const blocked = Boolean(disabled || loading), cannotSeek = Boolean(blocked || seeking || seekDisabled || !timed || timing !== 'confirmed')
  const scale = Math.max(1, Math.min(16, Number.isFinite(zoom ?? localZoom) ? zoom ?? localZoom : 1))
  const position = Number.isFinite(currentTimeMs) && currentTimeMs! >= 0 ? currentTimeMs : undefined
  const shownPosition = previewTime ?? position
  const zoomTo = (value: number) => { const next = Math.max(1, Math.min(16, value)); if (zoom === undefined) setLocalZoom(next); onZoomChange?.(next) }
  useEffect(() => {
    const element = viewport.current
    if (!element) return
    const update = () => {
      const style = getComputedStyle(element)
      setWidth(Math.max(0, element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)))
      if (tick.current) setTickWidth(tick.current.getBoundingClientRect().width)
    }
    const observer = new ResizeObserver(update); observer.observe(element); update()
    return () => observer.disconnect()
  }, [timed])
  useEffect(() => { if (cannotSeek) { setPreviewTime(undefined); setRaw(undefined) } }, [cannotSeek, span])
  const requestSeek = (next: number) => { if (!cannotSeek && span !== undefined && Number.isFinite(next)) onSeek(Math.max(0, Math.min(span, Math.round(next)))) }
  const number = raw?.normalize('NFKC').trim(), milliseconds = number !== undefined && /^\d+(?:\.\d+)?$/.test(number) ? Number(number) * 1000 : NaN
  const invalid = raw !== undefined && (!Number.isFinite(milliseconds) || milliseconds < 0 || span === undefined || milliseconds > span)
  const commitPosition = () => { if (composing.current || raw === undefined || invalid || cannotSeek) return; setRaw(undefined); requestSeek(milliseconds) }
  const rows = useMemo(() => tracks.map(track => ({ ...track, segments: track.segments.map(segment => ({ ...segment, wave: waveformPath(segment.waveform), positioned: timed && segment.timing !== 'unknown' && Number.isFinite(segment.startMs) && Number.isFinite(segment.endMs) && segment.startMs! >= 0 && segment.endMs! >= segment.startMs! && segment.endMs! <= span! })) })), [tracks, timed, span])
  const pickerSegments = useMemo(() => {
    const ids = new Set(segmentPicker?.ids)
    return rows.find(track => track.id === segmentPicker?.track)?.segments.filter(segment => ids.has(segment.id) && segment.positioned && segment.timing === 'confirmed') ?? []
  }, [rows, segmentPicker])
  const steps = useMemo(() => {
    const choices = new Map<string, TimelineSegment>()
    for (const track of tracks) for (const segment of track.segments) if (segment.stepId && !choices.has(segment.stepId)) choices.set(segment.stepId, segment)
    return [...choices.values()]
  }, [tracks])
  const ticks = useMemo(() => {
    if (!timed || span === undefined) return []
    const interval = span / Math.max(1, width * scale / tickWidth), power = 10 ** Math.floor(Math.log10(Math.max(1, interval)))
    const unit = [1, 2, 5, 10].find(value => value * power >= interval)! * power
    const marks = Array.from({ length: Math.min(200, Math.floor(span / unit) + 1) }, (_, index) => index * unit)
    return [0, ...marks.filter(time => time > 0 && time < span && Math.min(time, span - time) / span * width * scale >= tickWidth), span]
  }, [span, timed, width, scale, tickWidth])
  return <section className="pm-ui-timeline" data-density={density} data-disabled={blocked || undefined} data-segment-picker={segmentPicker?.track} aria-label={label} aria-busy={loading || seeking || undefined}>
    <div className="pm-ui-timeline__tools">
      <PmInput label={`${labels.position} (${labels.seconds})`} width="time" density={density} inputMode="decimal" maxLength={32} value={raw ?? (position === undefined ? '' : (position / 1000).toFixed(3))} placeholder={labels.unknown} error={invalid ? labels.invalidPosition : undefined} disabled={cannotSeek}
        onChange={event => setRaw(event.target.value)} onBlur={commitPosition}
        onCompositionStart={() => { composing.current = true }} onCompositionEnd={() => { composing.current = false }}
        onKeyDown={event => { if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return; if (event.key === 'Enter') { event.preventDefault(); commitPosition() } else if (event.key === 'Escape') setRaw(undefined) }} />
      <div className="pm-ui-timeline__zoom">
        <PmIconButton icon="minus" label={labels.zoomOut} density={density} disabled={blocked || scale <= 1} onClick={() => zoomTo(scale / 2)} />
        <output className="pm-ui-timeline__scale">{Math.round(scale * 100)}%</output>
        <PmIconButton icon="plus" label={labels.zoomIn} density={density} disabled={blocked || scale >= 16} onClick={() => zoomTo(scale * 2)} />
        <PmIconButton icon="fit" label={labels.fit} density={density} disabled={blocked} onClick={() => { zoomTo(1); viewport.current?.scrollTo({ left: 0 }) }} />
      </div>
    </div>
    <div className="pm-ui-timeline__status" role="status">{loading ? labels.loading : timing === 'unknown' || span === undefined ? labels.unknown : `${timing === 'estimated' ? `${labels.estimated} · ` : ''}${timelineTime(span)}`}</div>
    <div className="pm-ui-timeline__tracks">
      <div className="pm-ui-timeline__labels" aria-hidden="true">{timed && <><span /><span /></>}{tracks.map(track => <span key={track.id}>{track.label}</span>)}</div>
      <div ref={viewport} className="pm-ui-timeline__viewport" tabIndex={0} aria-label={label} aria-describedby={hintId}>
        <div className="pm-ui-timeline__canvas" style={{ width: timed ? `${width * scale}px` : '100%' }}>
          {timed && <><div className="pm-ui-timeline__ruler" aria-hidden="true" onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); requestSeek((event.clientX - rect.left) / rect.width * span!) }}>
            {ticks.map((time, index) => <span key={time} ref={index === 0 ? tick : undefined} data-end={time === span || undefined} style={{ left: `${time / span! * 100}%` }}>{timelineTime(time).replace(/\.000$/, '')}</span>)}
          </div><PmRange label={labels.seek} value={position ?? 0} max={span!} disabled={cannotSeek} density={density} valueText={timelineTime} onPreviewChange={setPreviewTime} onValueCommit={requestSeek} /></>}
          {rows.map(track => <div key={track.id} className="pm-ui-timeline__track" data-track={track.id} role="group" aria-label={track.label}>
            {track.segments.map(segment => {
              const description = `${segment.label}${segment.statusLabel ? ` · ${segment.statusLabel}` : ''} · ${segment.positioned ? `${segment.timing === 'estimated' ? `${labels.estimated} · ` : ''}${timelineTime(segment.startMs!)}–${timelineTime(segment.endMs!)}` : labels.unknown}`
              const content = <>{segment.wave && segment.positioned && <svg className="pm-ui-timeline__wave" viewBox="0 0 160 20" preserveAspectRatio="none" aria-hidden="true"><path d={segment.wave} /></svg>}<span>{segment.label}</span></>
              return segment.positioned ? <button key={segment.id} type="button" className="pm-ui-timeline__segment" data-timing={segment.timing} aria-label={description} title={description} aria-pressed={segment.stepId ? segment.stepId === selectedStepId : undefined} disabled={blocked || segment.disabled || !segment.stepId} onClick={() => { if (onSelectSegment) onSelectSegment(track.id, segment); else if (segment.stepId) onSelectStep(segment.stepId) }} style={{ left: `${segment.startMs! / span! * 100}%`, width: `${(segment.endMs! - segment.startMs!) / span! * 100}%` }}>{content}</button>
                : <span className="pm-ui-timeline__unknown" key={segment.id} title={description}>{segment.label} · {labels.unknown}</span>
            })}
          </div>)}
          {timed && shownPosition !== undefined && <span className="pm-ui-timeline__cursor" data-preview={previewTime !== undefined || undefined} style={{ left: `${Math.max(0, Math.min(1, shownPosition / span!)) * 100}%` }} aria-hidden="true" />}
        </div>
      </div>
    </div>
    {segmentPicker && pickerSegments.length > 0 && <div className="pm-ui-timeline__segment-picker"><PmSelect density="touch" label={segmentPicker.label} value="" disabled={cannotSeek || !onSelectSegment}
      onChange={event => { const segment = pickerSegments.find(segment => segment.id === event.target.value); if (segment && !cannotSeek) onSelectSegment?.(segmentPicker.track, segment) }}>
      <option value="">{segmentPicker.placeholder}</option>{pickerSegments.map(segment => <option key={segment.id} value={segment.id} disabled={segment.disabled}>{timelineTime(segment.startMs!)} · {segment.label}</option>)}
    </PmSelect></div>}
    <div className="pm-ui-timeline__steps">{steps.map(segment => <PmButton key={segment.stepId} density={density} disabled={blocked || segment.disabled} aria-pressed={segment.stepId === selectedStepId} variant={segment.stepId === selectedStepId ? 'accent' : 'default'} onClick={() => onSelectStep(segment.stepId!)}>{segment.label}</PmButton>)}</div>
    {!tracks.some(track => track.segments.length) && <PmNotice>{labels.empty}</PmNotice>}
    <p id={hintId} className="pm-ui-sr-only">{labels.seekHint}</p>
  </section>
}
