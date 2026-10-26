import { DragDropProvider, useDragDropManager } from '@dnd-kit/react'
import type { DragEndEvent, DragOverEvent, DragStartEvent } from '@dnd-kit/react'
import { isSortable, useSortable } from '@dnd-kit/react/sortable'
import { Accessibility, Feedback } from '@dnd-kit/dom'
import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { MutableRefObject, ReactNode } from 'react'
import { PmIconButton } from './base-controls.tsx'
import type { ControlDensity } from './base-controls.tsx'

export interface SortableListItem {
  id: string
  label: string
  prefix?: ReactNode
  actions?: ReactNode
  disabled?: boolean
  /** Reordering can be unavailable while selection and the item's actions remain usable. */
  reorderDisabled?: boolean
}
export interface SortableListLabels {
  handle(label: string): string
  instructions: string
  pickedUp(label: string, index: number, count: number): string
  position(label: string, index: number, count: number): string
  dropped(label: string): string
  cancelled(label: string): string
  saving(label: string): string
  saved(label: string, index: number, count: number): string
  failed(label: string): string
}
export interface SortableListProps {
  label: string
  scopeKey: string
  /** An external source replacement cancels a gesture without replacing the navigation control. */
  resetKey?: string | number
  items: readonly SortableListItem[]
  value?: string
  onSelect(id: string): void
  onMove?(id: string, before: string | null): void | Promise<void>
  /** These states block reordering, without blocking selection or caller-owned actions. */
  reorderDisabled?: boolean
  loading?: boolean
  density?: ControlDensity
  locale?: 'zh-CN' | 'en'
  labels?: Partial<SortableListLabels>
  className?: string
}

const MESSAGES: Record<'zh-CN' | 'en', SortableListLabels> = {
  'zh-CN': {
    handle: label => `移动：${label}`,
    instructions: '按空格或回车开始移动，用方向键调整位置，再按空格或回车放下，按 Escape 取消。',
    pickedUp: (label, index, count) => `已拾起${label}，第 ${index} 项，共 ${count} 项。`,
    position: (label, index, count) => `${label}，位置 ${index}，共 ${count} 项。`,
    dropped: label => `已放下${label}。`, cancelled: label => `已取消移动${label}。`,
    saving: label => `正在移动${label}。`, saved: (label, index, count) => `已移动${label}，第 ${index} 项，共 ${count} 项。`,
    failed: label => `未能移动${label}。`,
  },
  en: {
    handle: label => `Move: ${label}`,
    instructions: 'Press Space or Enter to pick up an item, use the arrow keys to move, then press Space or Enter to drop, or Escape to cancel.',
    pickedUp: (label, index, count) => `Picked up ${label}, item ${index} of ${count}.`,
    position: (label, index, count) => `${label}, position ${index} of ${count}.`,
    dropped: label => `Dropped ${label}.`, cancelled: label => `Canceled moving ${label}.`,
    saving: label => `Moving ${label}.`, saved: (label, index, count) => `Moved ${label}, item ${index} of ${count}.`,
    failed: label => `Could not move ${label}.`,
  },
}

function defaultLocale(): 'zh-CN' | 'en' {
  const languages = [typeof document === 'undefined' ? '' : document.documentElement.lang, typeof navigator === 'undefined' ? '' : navigator.language, 'zh-CN']
  return languages.find(language => /^(?:zh|en)(?:-|$)/i.test(language))!.toLowerCase().startsWith('zh') ? 'zh-CN' : 'en'
}

/** A changed list identity owns a fresh gesture and cannot receive an earlier move's completion. */
export function PmSortableList(props: SortableListProps) {
  const gesture = useRef(false), focus = useRef<string>()
  const order = JSON.stringify(props.items.map(item => item.id)), previous = useRef({ scope: props.scopeKey, order, reset: props.resetKey, generation: 0 })
  if (previous.current.scope !== props.scopeKey) focus.current = undefined
  if (gesture.current && (previous.current.scope !== props.scopeKey || previous.current.order !== order || previous.current.reset !== props.resetKey)) {
    previous.current.generation++; gesture.current = false
  }
  previous.current = { scope: props.scopeKey, order, reset: props.resetKey, generation: previous.current.generation }
  const signature = JSON.stringify([props.scopeKey, props.items.map(item => item.id).sort(), previous.current.generation, props.locale ?? defaultLocale(), props.labels?.instructions])
  return <SortableSession key={signature} {...props} gesture={gesture} focus={focus} />
}

type AccessibilityOptions = NonNullable<ConstructorParameters<typeof Accessibility>[1]>

function SortableGuard({ signature, revision, active, onReplace }: { signature: string, revision: string, active: MutableRefObject<boolean>, onReplace(): void }) {
  const manager = useDragDropManager(), previous = useRef({ signature, revision })
  useLayoutEffect(() => {
    if (previous.current.signature !== signature || previous.current.revision !== revision) {
      if (active.current) manager?.actions.stop({ canceled: true })
      if (previous.current.revision !== revision) onReplace()
    }
    previous.current = { signature, revision }
  }, [manager, signature, revision, onReplace])
  return null
}

function SortableSession(props: SortableListProps & { gesture: MutableRefObject<boolean>, focus: MutableRefObject<string | undefined> }) {
  const { items, onMove, density = 'compact', locale = defaultLocale() } = props
  const labels = useMemo(() => ({ ...MESSAGES[locale], ...props.labels }), [locale, props.labels])
  const [pending, setPending] = useState<{ id: string, order: string[] }>(), [announcement, setAnnouncement] = useState('')
  const alive = useRef(true), active = props.gesture, focus = props.focus, request = useRef<object>(), current = useRef({ props, labels })
  const list = useRef<HTMLOListElement>(null), handles = useRef(new Map<string, HTMLButtonElement>())
  const focusFrame = useRef<number>()
  const pendingOrder = useRef<string[]>()
  current.current = { props, labels }
  useLayoutEffect(() => { alive.current = true; return () => { alive.current = false; request.current = undefined; active.current = false; if (focusFrame.current !== undefined) cancelAnimationFrame(focusFrame.current) } }, [])
  const group = useId(), disabled = Boolean(props.reorderDisabled || props.loading || pending || !onMove)
  const signature = JSON.stringify([props.reorderDisabled, props.loading, Boolean(onMove), items.map(item => [item.id, item.disabled, item.reorderDisabled])])
  const orderKey = JSON.stringify(items.map(item => item.id)), revision = JSON.stringify([orderKey, props.resetKey])
  const restoreFocus = () => {
    const handle = focus.current && handles.current.get(focus.current), element = list.current?.ownerDocument.activeElement
    if (handle && (element === document.body || [...handles.current.values()].includes(element as HTMLButtonElement))) handle.focus({ preventScroll: true })
  }
  useLayoutEffect(() => {
    const select = (event: FocusEvent) => { if (event.target !== document.body) { const entry = [...handles.current].find(([, handle]) => handle === event.target); focus.current = entry?.[0] } }
    const point = (event: PointerEvent) => { if (![...handles.current.values()].some(handle => handle.contains(event.target as Node))) focus.current = undefined }
    const tab = (event: KeyboardEvent) => { if (event.key === 'Tab') focus.current = undefined }
    const blur = () => { focus.current = undefined }
    document.addEventListener('focusin', select); document.addEventListener('pointerdown', point); document.addEventListener('keydown', tab); window.addEventListener('blur', blur)
    return () => { document.removeEventListener('focusin', select); document.removeEventListener('pointerdown', point); document.removeEventListener('keydown', tab); window.removeEventListener('blur', blur) }
  }, [])
  useLayoutEffect(restoreFocus, [orderKey, props.resetKey, Boolean(pending), props.loading, props.reorderDisabled])
  const ordered = pending ? pending.order.flatMap(id => { const item = items.find(item => item.id === id); return item ? [item] : [] }) : items
  const named = (id?: string | number) => current.current.props.items.find(item => item.id === id)?.label ?? ''
  const accessibility = useMemo<AccessibilityOptions>(() => ({
    screenReaderInstructions: { draggable: labels.instructions },
    announcements: {
      dragstart: ({ operation: { source } }: DragStartEvent) => source ? current.current.labels.pickedUp(named(source.id), isSortable(source) ? source.initialIndex + 1 : 1, current.current.props.items.length) : undefined,
      dragover: ({ operation: { source } }: DragOverEvent) => source && isSortable(source) ? current.current.labels.position(named(source.id), source.index + 1, current.current.props.items.length) : undefined,
      dragend: ({ operation: { source }, canceled }: DragEndEvent) => source ? canceled ? current.current.labels.cancelled(named(source.id)) : current.current.labels.dropped(named(source.id)) : undefined,
    },
  }), [labels])
  return <DragDropProvider plugins={defaults => [...defaults, Feedback.configure({ dropAnimation: null, keyboardTransition: null }), Accessibility.configure(accessibility)]}
    onBeforeDragStart={event => { const source = event.operation.source, item = items.find(item => item.id === source?.id); if (disabled || !item || item.disabled || item.reorderDisabled) event.preventDefault() }}
    onDragStart={() => { active.current = true; setAnnouncement('') }}
    onDragEnd={event => {
      active.current = false
      const source = event.operation.source
      const element = document.activeElement
      if (alive.current && source && event.nativeEvent instanceof KeyboardEvent && (element === document.body || [...handles.current.values()].includes(element as HTMLButtonElement))) {
        focus.current = String(source.id)
        if (focusFrame.current !== undefined) cancelAnimationFrame(focusFrame.current)
        focusFrame.current = requestAnimationFrame(() => { focusFrame.current = undefined; if (alive.current) restoreFocus() })
      }
      if (!alive.current || disabled || event.canceled || !onMove || !isSortable(source) || !event.operation.target || source.initialIndex === source.index) return
      const item = items[source.initialIndex]
      if (!item || item.id !== source.id || item.disabled || item.reorderDisabled || source.index < 0 || source.index >= items.length) return
      const order = items.map(item => item.id)
      order.splice(source.initialIndex, 1); order.splice(source.index, 0, item.id)
      const before = order[source.index + 1] ?? null, owner = {}
      request.current = owner; pendingOrder.current = order; setPending({ id: item.id, order }); setAnnouncement(labels.saving(item.label))
      void (async () => {
        try {
          await onMove(item.id, before)
          if (alive.current && request.current === owner) setAnnouncement(current.current.labels.saved(item.label, order.indexOf(item.id) + 1, order.length))
        } catch {
          if (alive.current && request.current === owner) setAnnouncement(current.current.labels.failed(item.label))
        } finally {
          if (alive.current && request.current === owner) { request.current = undefined; pendingOrder.current = undefined; setPending(undefined) }
        }
      })()
    }}>
    <ol ref={list} className={['pm-ui-sortable-list', 'pm-ui', props.className].filter(Boolean).join(' ')} aria-label={props.label} aria-busy={Boolean(props.loading || pending) || undefined} data-density={density}>
      {ordered.map((item, index) => <SortableRow key={item.id} item={item} index={index} group={group} density={density} selected={item.id === props.value} disabled={disabled} loading={Boolean(props.loading || pending?.id === item.id)} label={labels.handle(item.label)} onSelect={props.onSelect} onHandle={element => { if (element) handles.current.set(item.id, element); else handles.current.delete(item.id) }} onSettled={restoreFocus} />)}
    </ol>
    <p role="status" className="pm-ui-sr-only">{announcement}</p>
    <SortableGuard signature={signature} revision={revision} active={active} onReplace={() => {
      if (pendingOrder.current && JSON.stringify(pendingOrder.current) === orderKey) return
      request.current = undefined; pendingOrder.current = undefined; setPending(undefined); setAnnouncement('')
    }} />
  </DragDropProvider>
}

function SortableRow({ item, index, group, density, selected, disabled, loading, label, onSelect, onHandle, onSettled }: {
  item: SortableListItem, index: number, group: string, density: ControlDensity, selected: boolean, disabled: boolean, loading: boolean, label: string, onSelect(id: string): void, onHandle(element: HTMLButtonElement | null): void, onSettled(): void,
}) {
  const { ref, handleRef, isDragSource } = useSortable({ id: item.id, index, group, type: group, accept: group, disabled: disabled || item.disabled || item.reorderDisabled, transition: null })
  const callbacks = useRef({ handleRef, onHandle })
  callbacks.current = { handleRef, onHandle }
  const attachHandle = useCallback((element: HTMLButtonElement | null) => {
    callbacks.current.handleRef(element); callbacks.current.onHandle(element)
  }, [])
  const wasDragging = useRef(false)
  useLayoutEffect(() => { if (wasDragging.current && !isDragSource) onSettled(); wasDragging.current = isDragSource }, [isDragSource, onSettled])
  return <li ref={ref} className="pm-ui-sortable-list__row" data-sortable-id={item.id} data-density={density} data-selected={selected || undefined} data-dragging={isDragSource || undefined}>
    <PmIconButton ref={attachHandle} icon="grip" label={label} density={density} className="pm-ui-sortable-list__handle" disabled={disabled || item.disabled || item.reorderDisabled} loading={loading} tooltip={false} />
    <button type="button" className="pm-ui-sortable-list__select" disabled={item.disabled} aria-current={selected ? 'location' : undefined} onClick={() => onSelect(item.id)}>
      {item.prefix !== undefined && <span className="pm-ui-sortable-list__prefix">{item.prefix}</span>}<span className="pm-ui-sortable-list__label">{item.label}</span>
    </button>
    {item.actions && <span className="pm-ui-sortable-list__actions">{item.actions}</span>}
  </li>
}
