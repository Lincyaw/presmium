import { ICONS } from '@lincyaw/design'
import type { IconName } from '@lincyaw/design'
import * as Tooltip from '@radix-ui/react-tooltip'
import { createContext, createElement, forwardRef, useContext, useEffect, useRef, useState } from 'react'
import type { ButtonHTMLAttributes, MouseEvent, ReactNode } from 'react'

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

/** Set by `PmToolbarButton` for the button it wraps. A toolbar item that cannot act stays focusable (WAI-ARIA APG): a
 * natively disabled button takes no focus, so a click on it lets the toolbar move the focus to another item, and the
 * next Space would press that one. */
export const ToolbarItemContext = createContext(false)

/** `disabled` or `aria-disabled` as a native `disabled` attribute, or, in a toolbar, as `aria-disabled` with the
 * button kept focusable, its tooltip shown, and clicks (also from Enter and Space) ignored. */
function useDisabled(disabled: boolean | undefined, loading: boolean | undefined, rest: ButtonProps) {
  const inToolbar = useContext(ToolbarItemContext)
  const off = Boolean(disabled || loading || rest['aria-disabled'] === true || rest['aria-disabled'] === 'true')
  if (!inToolbar) return { disabled: off }
  return { 'aria-disabled': off || undefined, onClick: off ? (event: MouseEvent<HTMLButtonElement>) => event.preventDefault() : rest.onClick }
}

export const PmButton = forwardRef<HTMLButtonElement, ButtonProps & ControlProps & { variant?: ButtonVariant, small?: boolean, icon?: IconName }>(function PmButton({ variant = 'default', small, density = 'compact', loading, icon, type = 'button', className, children, disabled, ...rest }, ref) {
  return (
    <button {...rest} {...useDisabled(disabled, loading, rest)} ref={ref} type={type} data-density={density} aria-busy={loading || undefined} className={cls('pm-ui-button', variant !== 'default' && `pm-ui-button--${variant}`, className)}>
      <span className={cls('pm-ui-button__content', !icon && loading !== undefined && 'pm-ui-button__content--loading-text')}>{(icon || loading !== undefined) && <span aria-hidden="true" className={cls('pm-ui-button__icon', loading && 'pm-ui-loading')}>{loading ? <PmIcon name="loading" /> : icon && <PmIcon name={icon} />}</span>}{children}</span>
    </button>
  )
})

const TOOLTIP_DELAY = 500
const TOOLTIP_SKIP = 300
let tooltipClosedAt = 0

/** Focus moved by the program, such as to the first control of a newly opened view after a dialog closes, is not the
 * author's: only focus the browser marks as keyboard focus opens the tooltip, so it does not stay up with no pointer. */
function focusShowsTooltip(element: Element): boolean {
  try { return element.matches(':focus-visible') } catch { return true }
}

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
      <Tooltip.Root open={open} onOpenChange={change}><Tooltip.Trigger asChild onPointerEnter={() => { pointer.current = true }} onPointerLeave={() => { pointer.current = false }} onFocus={event => { if (!focusShowsTooltip(event.currentTarget)) event.preventDefault() }}>{children}</Tooltip.Trigger><Tooltip.Portal><div className="pm-ui-tooltip-layer"><Tooltip.Content className="pm-ui-tooltip pm-ui" side="bottom" sideOffset={6} collisionPadding={8}>
        {label}{shortcut && <kbd className="pm-ui-shortcut">{shortcut}</kbd>}{description && description !== label && <span className="pm-ui-tooltip__description">{description}</span>}
      </Tooltip.Content></div></Tooltip.Portal></Tooltip.Root>
    </Tooltip.Provider>
  )
}

export const PmIconButton = forwardRef<HTMLButtonElement, ButtonProps & ControlProps & { icon: IconName, label: string, hint?: string, shortcut?: string, small?: boolean, tooltip?: boolean }>(function PmIconButton({ icon, label, hint, shortcut, small, tooltip = true, density = 'compact', loading, className, disabled, ...rest }, ref) {
  const button = <button {...rest} {...useDisabled(disabled, loading, rest)} ref={ref} type="button" data-density={density} aria-label={label} aria-busy={loading || undefined} className={cls('pm-ui-icon-button', className)}>
      <span className={cls('pm-ui-button__content', loading && 'pm-ui-loading')}><PmIcon name={loading ? 'loading' : icon} /></span>
    </button>
  return tooltip ? <PmTooltip label={label} shortcut={shortcut} description={hint}>{button}</PmTooltip> : button
})
