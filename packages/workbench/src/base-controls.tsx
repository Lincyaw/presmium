import { ICONS } from '@lincyaw/design'
import type { IconName } from '@lincyaw/design'
import * as Tooltip from '@radix-ui/react-tooltip'
import { createElement, forwardRef, useEffect, useRef, useState } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

const cls = (...names: (string | false | undefined | null)[]) => names.filter(Boolean).join(' ')

export function PmIcon({ name, size: _size, strokeWidth = 1.7 }: { name: IconName, size?: number | string, strokeWidth?: number }) {
  return (
    <svg className="pm-ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {ICONS[name].map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
    </svg>
  )
}

export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'text' | 'danger'

export type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> & { type?: 'button' | 'submit' | 'reset' }
export type ControlDensity = 'compact' | 'regular' | 'touch'
export type ControlProps = { density?: ControlDensity, loading?: boolean }

export const PmButton = forwardRef<HTMLButtonElement, ButtonProps & ControlProps & { variant?: ButtonVariant, small?: boolean, icon?: IconName }>(function PmButton({ variant = 'default', small, density = 'compact', loading, icon, type = 'button', className, children, disabled, ...rest }, ref) {
  return (
    <button {...rest} ref={ref} type={type} data-density={density} aria-busy={loading || undefined} disabled={disabled || loading || rest['aria-disabled'] === true || rest['aria-disabled'] === 'true'} className={cls('pm-ui-button', variant !== 'default' && `pm-ui-button--${variant}`, className)}>
      <span className={cls('pm-ui-button__content', !icon && loading !== undefined && 'pm-ui-button__content--loading-text')}>{(icon || loading !== undefined) && <span aria-hidden="true" className={cls('pm-ui-button__icon', loading && 'pm-ui-loading')}>{loading ? <PmIcon name="loading" /> : icon && <PmIcon name={icon} />}</span>}{children}</span>
    </button>
  )
})

const TOOLTIP_DELAY = 500
const TOOLTIP_SKIP = 300
let tooltipClosedAt = 0

/** A pointer shows the tooltip after 500 ms, keyboard focus at once; within 300 ms of one closing, the next opens at
 * once, so moving along a toolbar does not wait again. The timing is shared by every tooltip on the page. */
/** A control's name, its shortcut, and optionally a sentence on what it does (`description`) below them. */
export function PmTooltip({ label, shortcut, description, children }: { label: string, shortcut?: string, description?: string, children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const shown = useRef(false)
  const pointer = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const change = (next: boolean) => {
    clearTimeout(timer.current)
    if (!next) {
      if (shown.current) tooltipClosedAt = Date.now()
      shown.current = false
      setOpen(false)
      return
    }
    const wait = pointer.current && Date.now() - tooltipClosedAt > TOOLTIP_SKIP ? TOOLTIP_DELAY : 0
    timer.current = setTimeout(() => { shown.current = true; setOpen(true) }, wait)
  }
  return (
    <Tooltip.Provider delayDuration={0} skipDelayDuration={0}>
      <Tooltip.Root open={open} onOpenChange={change}><Tooltip.Trigger asChild onPointerEnter={() => { pointer.current = true }} onPointerLeave={() => { pointer.current = false }}>{children}</Tooltip.Trigger><Tooltip.Portal><div className="pm-ui-tooltip-layer"><Tooltip.Content className="pm-ui-tooltip pm-ui" side="bottom" sideOffset={6} collisionPadding={8}>
        {label}{shortcut && <kbd className="pm-ui-shortcut">{shortcut}</kbd>}{description && description !== label && <span className="pm-ui-tooltip__description">{description}</span>}
      </Tooltip.Content></div></Tooltip.Portal></Tooltip.Root>
    </Tooltip.Provider>
  )
}

export const PmIconButton = forwardRef<HTMLButtonElement, ButtonProps & ControlProps & { icon: IconName, label: string, hint?: string, shortcut?: string, small?: boolean, tooltip?: boolean }>(function PmIconButton({ icon, label, hint, shortcut, small, tooltip = true, density = 'compact', loading, className, disabled, ...rest }, ref) {
  const button = <button {...rest} ref={ref} type="button" data-density={density} aria-label={label} aria-busy={loading || undefined} disabled={disabled || loading || rest['aria-disabled'] === true || rest['aria-disabled'] === 'true'} className={cls('pm-ui-icon-button', className)}>
      <span className={cls('pm-ui-button__content', loading && 'pm-ui-loading')}><PmIcon name={loading ? 'loading' : icon} /></span>
    </button>
  return tooltip ? <PmTooltip label={label} shortcut={shortcut} description={hint}>{button}</PmTooltip> : button
})
