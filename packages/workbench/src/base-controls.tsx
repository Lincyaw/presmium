import { ICONS } from '@lincyaw/design'
import type { IconName } from '@lincyaw/design'
import * as Tooltip from '@radix-ui/react-tooltip'
import { createElement, forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

const cls = (...names: (string | false | undefined | null)[]) => names.filter(Boolean).join(' ')

export function PmIcon({ name, size: _size, strokeWidth = 1.7 }: { name: IconName, size?: number | string, strokeWidth?: number }) {
  return (
    <svg className="pm-ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {ICONS[name].map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
    </svg>
  )
}

export type ButtonVariant = 'default' | 'primary' | 'accent' | 'ghost' | 'danger'

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & { type?: 'button' | 'submit' | 'reset' }
export type ControlDensity = 'compact' | 'regular' | 'touch'
export type ControlProps = { density?: ControlDensity, loading?: boolean }

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

export const PmIconButton = forwardRef<HTMLButtonElement, ButtonProps & ControlProps & { icon: IconName, label: string, hint?: string, shortcut?: string, small?: boolean, tooltip?: boolean }>(function PmIconButton({ icon, label, hint, shortcut, small, tooltip = true, density = small ? 'compact' : 'regular', loading, className, disabled, ...rest }, ref) {
  const button = <button {...rest} ref={ref} type="button" data-density={density} aria-label={label} aria-busy={loading || undefined} disabled={disabled || loading || rest['aria-disabled'] === true || rest['aria-disabled'] === 'true'} className={cls('pm-ui-icon-button', className)}>
      <span className={cls('pm-ui-button__content', loading && 'pm-ui-loading')}><PmIcon name={loading ? 'loading' : icon} /></span>
    </button>
  return tooltip ? <PmTooltip label={hint ?? label} shortcut={shortcut}>{button}</PmTooltip> : button
})
