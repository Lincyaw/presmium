import { ICONS } from '@lincyaw/design'
import type { IconName } from '@lincyaw/design'
import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { createElement, forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

const cls = (...names: (string | false | undefined | null)[]) => names.filter(Boolean).join(' ')

export function PmIcon({ name, size = 20, strokeWidth = 1.7 }: { name: IconName, size?: number | string, strokeWidth?: number }) {
  return (
    <svg className="pm-ui-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {ICONS[name].map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
    </svg>
  )
}

export type ButtonVariant = 'default' | 'primary' | 'accent' | 'ghost' | 'danger'

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & { type?: 'button' | 'submit' | 'reset' }

export const PmButton = forwardRef<HTMLButtonElement, ButtonProps & { variant?: ButtonVariant, small?: boolean, icon?: IconName }>(function PmButton({ variant = 'default', small, icon, type = 'button', className, children, ...rest }, ref) {
  return (
    <button ref={ref} type={type} className={cls('pm-ui-button', variant !== 'default' && `pm-ui-button--${variant}`, small && 'pm-ui-button--small', className)} {...rest}>
      {icon && <PmIcon name={icon} size={small ? 14 : 16} strokeWidth={2} />}
      {children}
    </button>
  )
})

export const PmIconButton = forwardRef<HTMLButtonElement, ButtonProps & { icon: IconName, label: string, small?: boolean }>(function PmIconButton({ icon, label, small, className, ...rest }, ref) {
  return (
    <button ref={ref} type="button" className={cls('pm-ui-icon-button', small && 'pm-ui-icon-button--small', className)} aria-label={label} title={label} {...rest}>
      <PmIcon name={icon} size={small ? 16 : 20} />
    </button>
  )
})

export type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger' | 'outline'

export function PmBadge({ tone = 'neutral', pill, children }: { tone?: Tone, pill?: boolean, children?: ReactNode }) {
  return <span className={cls('pm-ui-badge', tone !== 'neutral' && `pm-ui-badge--${tone}`, pill && 'pm-ui-badge--pill')}>{children}</span>
}

export function PmCard({ variant = 'default', className, children, ...rest }: { variant?: 'default' | 'interactive' | 'dashed', className?: string, children?: ReactNode, [attribute: `data-${string}`]: string | undefined }) {
  return <div className={cls('pm-ui-card', variant !== 'default' && `pm-ui-card--${variant}`, className)} {...rest}>{children}</div>
}

export function PmField({ label, inline, group, children }: { label: string, inline?: boolean, group?: boolean, children?: ReactNode }) {
  if (group) return <div className="pm-ui-field" role="group" aria-label={label}><span className="pm-ui-field__label">{label}</span>{children}</div>
  return (
    <label className={cls('pm-ui-field', inline && 'pm-ui-field--inline')}>
      {inline ? <>{children}<span className="pm-ui-field__label">{label}</span></> : <><span className="pm-ui-field__label">{label}</span>{children}</>}
    </label>
  )
}

export type PopoverPlacement = 'below-end' | 'below-start' | 'above-end' | 'above-start'
const placementOf = (placement: PopoverPlacement) => ({ side: placement.startsWith('above') ? 'top' as const : 'bottom' as const, align: placement.endsWith('start') ? 'start' as const : 'end' as const })

export function PmDialog({ open, label, closeLabel, name, actions, onClose, onCloseAutoFocus, children }: { open: boolean, label: string, closeLabel: string, name?: string, actions?: ReactNode, onClose(): void, onCloseAutoFocus?(event: Event): void, children?: ReactNode }) {
  return (
    <Dialog.Root open={open} onOpenChange={next => { if (!next) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="pmw-dialog-overlay" />
        <Dialog.Content className={cls('pm-ui-dialog', 'pm-ui', name && `${name}__panel`)} aria-describedby={undefined} onCloseAutoFocus={onCloseAutoFocus}>
          <div className="pm-ui-dialog__header">
            <Dialog.Title className="pm-ui-dialog__title">{label}</Dialog.Title>
            {actions}
            <Dialog.Close asChild><PmIconButton icon="close" label={closeLabel} small /></Dialog.Close>
          </div>
          <div className="pm-ui-dialog__body">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
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
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild><PmIconButton icon={icon} label={label} small /></DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="pm-ui-menu pmw-overlay" aria-label={label} {...placementOf(placement)} sideOffset={6} collisionPadding={16}>
          {items.map(item => (
            <DropdownMenu.Item key={item.id} className={cls('pm-ui-menu__item', item.danger && 'pm-ui-menu__item--danger')} disabled={item.disabled} onSelect={() => onSelect(item.id)}>
              {item.icon && <PmIcon name={item.icon} size={16} />}{item.label}
            </DropdownMenu.Item>
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
      {children && <p style={{ margin: 0 }}>{children}</p>}
      {action}
    </div>
  )
}

export function PmNotice({ tone = 'neutral', children }: { tone?: 'neutral' | 'accent' | 'ok' | 'warn' | 'danger', children?: ReactNode }) {
  return <div className={cls('pm-ui-notice', tone !== 'neutral' && `pm-ui-notice--${tone}`)} role={tone === 'danger' ? 'alert' : 'status'}>{children}</div>
}
