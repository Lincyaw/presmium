import { ICONS } from '@presmium/design'
import type { IconName } from '@presmium/design'
import { createPortal } from 'react-dom'
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { ButtonHTMLAttributes, KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from 'react'

const cls = (...names: (string | false | undefined | null)[]) => names.filter(Boolean).join(' ')

export function PmIcon({ name, size = 20, strokeWidth = 1.7 }: { name: IconName, size?: number | string, strokeWidth?: number }) {
  return (
    <svg className="pm-ui-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {ICONS[name].map(([tag, attrs], i) => (tag === 'path' ? <path key={i} {...attrs} /> : tag === 'circle' ? <circle key={i} {...attrs} /> : <rect key={i} {...attrs} />))}
    </svg>
  )
}

export type ButtonVariant = 'default' | 'primary' | 'accent' | 'ghost' | 'danger'

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & { type?: 'button' | 'submit' | 'reset' }

export function PmButton({ variant = 'default', small, icon, type = 'button', className, children, ...rest }: ButtonProps & { variant?: ButtonVariant, small?: boolean, icon?: IconName }) {
  return (
    <button type={type} className={cls('pm-ui-button', variant !== 'default' && `pm-ui-button--${variant}`, small && 'pm-ui-button--small', className)} {...rest}>
      {icon && <PmIcon name={icon} size={small ? 14 : 16} strokeWidth={2} />}
      {children}
    </button>
  )
}

export function PmIconButton({ icon, label, small, className, ...rest }: ButtonProps & { icon: IconName, label: string, small?: boolean }) {
  return (
    <button type="button" className={cls('pm-ui-icon-button', small && 'pm-ui-icon-button--small', className)} aria-label={label} title={label} {...rest}>
      <PmIcon name={icon} size={small ? 16 : 20} />
    </button>
  )
}

export type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger' | 'outline'

export function PmBadge({ tone = 'neutral', pill, children }: { tone?: Tone, pill?: boolean, children?: ReactNode }) {
  return <span className={cls('pm-ui-badge', tone !== 'neutral' && `pm-ui-badge--${tone}`, pill && 'pm-ui-badge--pill')}>{children}</span>
}

export function PmCard({ variant = 'default', className, children, ...rest }: { variant?: 'default' | 'interactive' | 'dashed', className?: string, children?: ReactNode, [attribute: `data-${string}`]: string | undefined }) {
  return <div className={cls('pm-ui-card', variant !== 'default' && `pm-ui-card--${variant}`, className)} {...rest}>{children}</div>
}

export function PmField({ label, inline, children }: { label: string, inline?: boolean, children?: ReactNode }) {
  return (
    <label className={cls('pm-ui-field', inline && 'pm-ui-field--inline')}>
      {inline ? <>{children}<span className="pm-ui-field__label">{label}</span></> : <><span className="pm-ui-field__label">{label}</span>{children}</>}
    </label>
  )
}

export interface Choice<T extends string = string> {
  value: T
  label: string
}

export function PmSegmented<T extends string>({ value, options, label, onChange }: { value: T, options: Choice<T>[], label: string, onChange(value: T): void }) {
  return (
    <div className="pm-ui-segmented" role="group" aria-label={label}>
      {options.map(option => (
        <button key={option.value} type="button" className="pm-ui-segmented__option" aria-pressed={option.value === value} onClick={() => onChange(option.value)}>{option.label}</button>
      ))}
    </div>
  )
}

export function PmTabs<T extends string>({ value, tabs, label, onChange, children }: { value: T, tabs: Choice<T>[], label: string, onChange(value: T): void, children?: ReactNode }) {
  const prefix = useId()
  const list = useRef<HTMLDivElement>(null)
  const move = (event: ReactKeyboardEvent) => {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const index = tabs.findIndex(tab => tab.value === value)
    const next = tabs[(index + step + tabs.length) % tabs.length]
    if (!next) return
    onChange(next.value)
    requestAnimationFrame(() => list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus())
  }
  return (
    <div className="pm-ui-tabset">
      <div ref={list} className="pm-ui-tabs" role="tablist" aria-label={label} onKeyDown={move}>
        {tabs.map(tab => (
          <button key={tab.value} type="button" role="tab" className="pm-ui-tab" id={`${prefix}-tab-${tab.value}`} aria-selected={tab.value === value} aria-controls={tab.value === value && children ? `${prefix}-panel-${tab.value}` : undefined} tabIndex={tab.value === value ? 0 : -1} onClick={() => onChange(tab.value)}>{tab.label}</button>
        ))}
      </div>
      {children && <div className="pm-ui-tabpanel" role="tabpanel" id={`${prefix}-panel-${value}`} aria-labelledby={`${prefix}-tab-${value}`} tabIndex={0}>{children}</div>}
    </div>
  )
}

function useDismiss(open: boolean, close: () => void, root: RefObject<HTMLElement | null>, dialog = false): void {
  const latest = useRef(close)
  latest.current = close
  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (dialog) return
      const target = event.target as Node | null
      if (target && root.current?.contains(target)) return
      latest.current()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      const within = root.current?.contains(document.activeElement)
      latest.current()
      if (!dialog && (within || document.activeElement === document.body)) root.current?.querySelector<HTMLElement>('button, [href], input, select, textarea')?.focus()
    }
    document.addEventListener('pointerdown', onPointer, true)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer, true)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, dialog, root])
}

function useInView(panel: RefObject<HTMLElement | null>, open: boolean): void {
  useLayoutEffect(() => {
    const element = panel.current
    if (!open || !element) return
    const place = () => {
      element.style.translate = ''
      const box = element.getBoundingClientRect()
      const margin = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
      const width = document.documentElement.clientWidth
      let shift = box.right > width - margin ? width - margin - box.right : 0
      if (box.left + shift < margin) shift = margin - box.left
      if (shift) element.style.translate = `${Math.round(shift)}px 0`
    }
    place()
    const observer = new ResizeObserver(place)
    observer.observe(element)
    window.addEventListener('resize', place)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', place)
    }
  }, [open, panel])
}

export type PopoverPlacement = 'below-end' | 'below-start' | 'above-end' | 'above-start'

export function PmPopover({ open, label, placement = 'below-end', name, trigger, onClose, children }: { open: boolean, label: string, placement?: PopoverPlacement, name?: string, trigger: ReactNode, onClose(): void, children?: ReactNode }) {
  const root = useRef<HTMLSpanElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  useDismiss(open, onClose, root)
  useInView(panel, open)
  return (
    <span ref={root} className={cls('pm-ui-anchor', name)}>
      {trigger}
      {open && <div ref={panel} className={cls('pm-ui-popover', `pm-ui-popover--${placement}`, name && `${name}__panel`)} role="dialog" aria-label={label}>{children}</div>}
    </span>
  )
}

export function PmDrawer({ open, label, closeLabel, name, trigger, onClose, children }: { open: boolean, label: string, closeLabel: string, name?: string, trigger?: ReactNode, onClose(): void, children?: ReactNode }) {
  const root = useRef<HTMLSpanElement>(null)
  useDismiss(open, onClose, root)
  return (
    <span ref={root} className={cls('pm-ui-anchor', name)}>
      {trigger}
      {open && (
        <div className={cls('pm-ui-drawer', name && `${name}__panel`)} role="dialog" aria-label={label}>
          <div className="pm-ui-drawer__header">
            <h2 className="pm-ui-drawer__title">{label}</h2>
            <PmIconButton icon="close" label={closeLabel} small onClick={onClose} />
          </div>
          <div className="pm-ui-drawer__body">{children}</div>
        </div>
      )}
    </span>
  )
}

export function PmDialog({ open, label, closeLabel, name, actions, onClose, children }: { open: boolean, label: string, closeLabel: string, name?: string, actions?: ReactNode, onClose(): void, children?: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null)
  const id = useId()
  useDismiss(open, onClose, panel, true)
  useEffect(() => {
    if (!open) return
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    const first = panel.current?.querySelector<HTMLElement>('.pm-ui-dialog__body :is(input, select, textarea, button, [href])')
    ;(first ?? panel.current)?.focus()
    return () => {
      if (before?.isConnected) before.focus()
    }
  }, [open])
  if (!open) return null
  return createPortal(
    <div ref={panel} className={cls('pm-ui-dialog', 'pm-ui', name && `${name}__panel`)} role="dialog" aria-labelledby={id} tabIndex={-1}>
      <div className="pm-ui-dialog__header">
        <h2 id={id} className="pm-ui-dialog__title">{label}</h2>
        {actions}
        <PmIconButton icon="close" label={closeLabel} small onClick={onClose} />
      </div>
      <div className="pm-ui-dialog__body">{children}</div>
    </div>,
    document.body,
  )
}

export interface MenuItem {
  id: string
  label: string
  icon?: IconName
  danger?: boolean
  disabled?: boolean
}

export function PmMenu({ label, items, icon = 'more', placement = 'below-end', onSelect }: { label: string, items: MenuItem[], icon?: IconName, placement?: PopoverPlacement, onSelect(id: string): void }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLSpanElement>(null)
  const list = useRef<HTMLUListElement>(null)
  useDismiss(open, () => setOpen(false), root)
  useInView(list, open)
  const items_ = () => [...(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])]
  const focusAt = (index: number) => {
    const all = items_()
    all[(index + all.length) % all.length]?.focus()
  }
  useEffect(() => {
    if (open) focusAt(0)
  }, [open])
  const onKey = (event: ReactKeyboardEvent) => {
    const at = items_().indexOf(document.activeElement as HTMLElement)
    if (event.key === 'ArrowDown') focusAt(at + 1)
    else if (event.key === 'ArrowUp') focusAt(at - 1)
    else if (event.key === 'Tab') return setOpen(false)
    else return
    event.preventDefault()
  }
  return (
    <span ref={root} className="pm-ui-anchor" onKeyDown={onKey}>
      <PmIconButton icon={icon} label={label} small aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} />
      {open && (
        <ul ref={list} className={cls('pm-ui-menu', `pm-ui-popover--${placement}`)} role="menu" aria-label={label}>
          {items.map(item => (
            <li key={item.id} role="none">
              <button
                type="button"
                role="menuitem"
                className={cls('pm-ui-menu__item', item.danger && 'pm-ui-menu__item--danger')}
                disabled={item.disabled}
                tabIndex={-1}
                onClick={() => {
                  setOpen(false)
                  root.current?.querySelector<HTMLElement>('button')?.focus()
                  onSelect(item.id)
                }}
              >
                {item.icon && <PmIcon name={item.icon} size={16} />}
                {item.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </span>
  )
}

export function PmEmpty({ title, icon, action, children }: { title?: string, icon?: IconName, action?: ReactNode, children?: ReactNode }) {
  return (
    <div className="pm-ui-empty">
      {icon && <PmIcon name={icon} size={28} />}
      {title && <p className="pm-ui-empty__title">{title}</p>}
      {children && <p style={{ margin: 0 }}>{children}</p>}
      {action}
    </div>
  )
}

export function PmNotice({ tone = 'neutral', children }: { tone?: 'neutral' | 'accent' | 'ok' | 'warn' | 'danger', children?: ReactNode }) {
  return <div className={cls('pm-ui-notice', tone !== 'neutral' && `pm-ui-notice--${tone}`)} role={tone === 'danger' ? 'alert' : 'status'}>{children}</div>
}
