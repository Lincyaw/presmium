import { ICONS } from '@lincyaw/design'
import type { IconName } from '@lincyaw/design'
import * as Dialog from '@radix-ui/react-dialog'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Tabs from '@radix-ui/react-tabs'
import * as Tooltip from '@radix-ui/react-tooltip'
import * as Toolbar from '@radix-ui/react-toolbar'
import * as RadioGroup from '@radix-ui/react-radio-group'
import { createElement, forwardRef, useEffect, useId, useRef } from 'react'
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

const cls = (...names: (string | false | undefined | null)[]) => names.filter(Boolean).join(' ')

export function PmIcon({ name, size: _size, strokeWidth = 1.7 }: { name: IconName, size?: number | string, strokeWidth?: number }) {
  return (
    <svg className="pm-ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {ICONS[name].map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
    </svg>
  )
}

export type ButtonVariant = 'default' | 'primary' | 'accent' | 'ghost' | 'danger'

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & { type?: 'button' | 'submit' | 'reset' }
export type ControlDensity = 'compact' | 'regular' | 'touch'
type ControlProps = { density?: ControlDensity, loading?: boolean }

export const PmButton = forwardRef<HTMLButtonElement, ButtonProps & ControlProps & { variant?: ButtonVariant, small?: boolean, icon?: IconName }>(function PmButton({ variant = 'default', small, density = small ? 'compact' : 'regular', loading, icon, type = 'button', className, children, disabled, ...rest }, ref) {
  return (
    <button {...rest} ref={ref} type={type} data-density={density} aria-busy={loading || undefined} disabled={disabled || loading || rest['aria-disabled'] === true || rest['aria-disabled'] === 'true'} className={cls('pm-ui-button', variant !== 'default' && `pm-ui-button--${variant}`, className)}>
      <span className="pm-ui-button__content">{(icon || loading !== undefined) && <span className={cls('pm-ui-button__icon', loading && 'pm-ui-loading')}>{loading ? <PmIcon name="loading" /> : icon && <PmIcon name={icon} />}</span>}{children}</span>
    </button>
  )
})

/** Radix opens on keyboard focus immediately; pointer hover uses the I11 delay. */
export function PmTooltip({ label, shortcut, children }: { label: string, shortcut?: string, children: ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={300} skipDelayDuration={0}>
      <Tooltip.Root><Tooltip.Trigger asChild>{children}</Tooltip.Trigger><Tooltip.Portal><Tooltip.Content className="pm-ui-tooltip pm-ui" side="bottom" sideOffset={6} collisionPadding={8}>
        {label}{shortcut && <kbd className="pm-ui-shortcut">{shortcut}</kbd>}
      </Tooltip.Content></Tooltip.Portal></Tooltip.Root>
    </Tooltip.Provider>
  )
}

export const PmIconButton = forwardRef<HTMLButtonElement, ButtonProps & ControlProps & { icon: IconName, label: string, hint?: string, shortcut?: string, small?: boolean }>(function PmIconButton({ icon, label, hint, shortcut, small, density = small ? 'compact' : 'regular', loading, className, disabled, ...rest }, ref) {
  return <PmTooltip label={hint ?? label} shortcut={shortcut}>
    <button {...rest} ref={ref} type="button" data-density={density} aria-label={label} aria-busy={loading || undefined} disabled={disabled || loading || rest['aria-disabled'] === true || rest['aria-disabled'] === 'true'} className={cls('pm-ui-icon-button', className)}>
      <span className={cls('pm-ui-button__content', loading && 'pm-ui-loading')}><PmIcon name={loading ? 'loading' : icon} /></span>
    </button>
  </PmTooltip>
})

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

export function PmDialog({ open, label, closeLabel, name, actions, description, footer, busy, onClose, onCloseAutoFocus, children }: { open: boolean, label: string, closeLabel: string, name?: string, actions?: ReactNode, description?: string, footer?: ReactNode, busy?: boolean, onClose(): void, onCloseAutoFocus?(event: Event): void, children?: ReactNode }) {
  const trigger = useRef<HTMLElement | null>(null)
  return (
    <Dialog.Root open={open} modal onOpenChange={next => { if (!next && !busy) onClose() }}>
      <Dialog.Portal>
        <Dialog.Overlay className="pm-ui-dialog-overlay" />
        <Dialog.Content className={cls('pm-ui-dialog', 'pm-ui', name && `${name}__panel`)} data-density="regular" aria-busy={busy || undefined} {...description ? {} : { 'aria-describedby': undefined }} onOpenAutoFocus={() => { trigger.current = document.activeElement as HTMLElement }} onInteractOutside={event => event.preventDefault()} onEscapeKeyDown={event => { event.stopPropagation(); if (busy) event.preventDefault() }} onCloseAutoFocus={event => {
          onCloseAutoFocus?.(event)
          if (event.defaultPrevented) return
          event.preventDefault()
          const target = trigger.current?.isConnected ? trigger.current : document.querySelector<HTMLElement>('[role="toolbar"] button:not(:disabled), main button:not(:disabled)')
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

export function PmMenu({ label, items, icon = 'more', placement = 'below-end', onSelect }: { label: string, items: MenuItem[], icon?: IconName, placement?: PopoverPlacement, onSelect(id: string): void }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild><PmIconButton icon={icon} label={label} small /></DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content className="pm-ui-menu pm-ui-floating pm-ui" data-density="compact" aria-label={label} {...placementOf(placement)} sideOffset={6} collisionPadding={16} onEscapeKeyDown={event => event.stopPropagation()}>
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
      {children && <p style={{ margin: 0 }}>{children}</p>}
      {action}
    </div>
  )
}

export function PmNotice({ tone = 'neutral', children }: { tone?: 'neutral' | 'accent' | 'ok' | 'warn' | 'danger', children?: ReactNode }) {
  return <div className={cls('pm-ui-notice', tone !== 'neutral' && `pm-ui-notice--${tone}`)} role={tone === 'danger' ? 'alert' : 'status'}>{children}</div>
}
