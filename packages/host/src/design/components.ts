import { createContext, createElement as h, forwardRef, useContext, useEffect, useId, useRef } from 'react'
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import * as Popover from '@radix-ui/react-popover'
import * as Dropdown from '@radix-ui/react-dropdown-menu'
import * as Tabs from '@radix-ui/react-tabs'
import * as Tooltip from '@radix-ui/react-tooltip'
import * as RadioGroup from '@radix-ui/react-radio-group'
import { useLocale } from '../locale.ts'
import { ICONS } from '@lincyaw/design'
import type { IconName } from '@lincyaw/design'
import type { ToolbarPlacement } from '../contracts.ts'
export type ButtonVariant = 'default' | 'primary' | 'accent' | 'ghost' | 'danger'
export type ControlDensity = 'compact' | 'regular' | 'touch'
export type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger' | 'outline'
export type PopoverPlacement = 'below-end' | 'below-start' | 'above-end' | 'above-start' | 'above' | 'below'
export interface Choice { value: string, label: string, icon?: IconName, disabled?: boolean }
export interface MenuItem { id: string, label: string, icon?: IconName, danger?: boolean, disabled?: boolean, shortcut?: string, checked?: boolean, separator?: boolean }
const cls = (...values: (string | false | undefined)[]) => values.filter(Boolean).join(' ')
export function PmIcon({ name, size: _size, strokeWidth = 1.7, ...attrs }: { name: IconName, size?: number | string, strokeWidth?: number } & HTMLAttributes<SVGElement>) {
  return h('svg', { ...attrs, className: cls('pm-ui-icon', attrs.className), viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, focusable: false }, ICONS[name]?.map(([tag, attributes], key) => h(tag, { ...attributes, key })))
}
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant, small?: boolean, icon?: IconName, density?: ControlDensity, loading?: boolean }
export const PmButton = forwardRef<HTMLButtonElement, ButtonProps>(function PmButton({ variant = 'default', small, density = small ? 'compact' : 'regular', loading, icon, className, children, disabled, ...rest }, ref) {
  return h('button', { ...rest, ref, type: rest.type ?? 'button', 'data-density': density, 'aria-busy': loading || undefined, disabled: disabled || loading || rest['aria-disabled'] === true || rest['aria-disabled'] === 'true', className: cls('pm-ui-button', variant !== 'default' && `pm-ui-button--${variant}`, className) },
    h('span', { className: 'pm-ui-button__content' },
      icon || loading !== undefined ? h('span', { className: 'pm-ui-button__icon', 'aria-hidden': true }, loading ? h(PmIcon, { name: 'loading', className: 'pm-ui-loading' }) : icon ? h(PmIcon, { name: icon }) : null) : null,
      children))
})
export function PmTooltip({ label, shortcut, children }: { label: string, shortcut?: string, children: ReactNode }) {
  return h(Tooltip.Provider, { delayDuration: 300, skipDelayDuration: 0, children:
    h(Tooltip.Root, {}, h(Tooltip.Trigger, { asChild: true }, children), h(Tooltip.Portal, {},
      h(Tooltip.Content, { className: 'pm-ui-tooltip pm-ui', side: 'top', sideOffset: 6, collisionPadding: 8 }, label, shortcut ? h('kbd', { className: 'pm-ui-shortcut' }, shortcut) : null))) })
}
export const PmIconButton = forwardRef<HTMLButtonElement, ButtonProps & { icon: IconName, label: string, hint?: string, shortcut?: string }>(function PmIconButton({ icon, label, hint, shortcut, small, density = small ? 'compact' : 'regular', loading, className, disabled, ...rest }, ref) {
  const button = h('button', { ...rest, ref, type: 'button', 'data-density': density, 'aria-label': label, 'aria-busy': loading || undefined, disabled: disabled || loading || rest['aria-disabled'] === true || rest['aria-disabled'] === 'true', className: cls('pm-ui-icon-button', className) }, h(PmIcon, { name: loading ? 'loading' : icon, className: loading ? 'pm-ui-loading' : undefined }))
  return h(PmTooltip, { label: hint ?? label, shortcut, children: button })
})
export function PmBadge({ tone = 'neutral', pill, children, className, ...rest }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone, pill?: boolean }) { return h('span', { ...rest, className: cls('pm-ui-badge', tone !== 'neutral' && `pm-ui-badge--${tone}`, pill && 'pm-ui-badge--pill', className) }, children) }
export function PmCard({ variant = 'default', className, children, ...rest }: HTMLAttributes<HTMLDivElement> & { variant?: string }) { return h('div', { ...rest, className: cls('pm-ui-card', variant !== 'default' && `pm-ui-card--${variant}`, className) }, children) }
export function PmField({ label, inline, group, children }: { label: string, inline?: boolean, group?: boolean, children?: ReactNode }) { return h(group ? 'div' : 'label', { className: cls('pm-ui-field', inline && 'pm-ui-field--inline'), ...(group ? { role: 'group', 'aria-label': label } : {}) }, h('span', { className: 'pm-ui-field__label' }, label), children) }
interface OverlayProps {
  open: boolean
  label: string
  closeLabel?: string
  name?: string
  children?: ReactNode
  trigger?: ReactNode
  actions?: ReactNode
  description?: string
  footer?: ReactNode
  busy?: boolean
  onOpenChange?(open: boolean): void
  onClose?(): void
  onOpenAutoFocus?(event: Event): void
  onCloseAutoFocus?(event: Event): void
}
function DialogSurface({ open, label, closeLabel, name, children, actions, trigger, description, footer, busy, onOpenChange, onClose, onOpenAutoFocus, onCloseAutoFocus, drawer = false }: OverlayProps & { drawer?: boolean }) {
  const kind = drawer ? 'pm-ui-drawer' : 'pm-ui-dialog'
  const locale = useLocale()
  const id = useId()
  const focusTarget = useRef<HTMLElement | null>(typeof document === 'undefined' ? null : document.activeElement as HTMLElement)
  useEffect(() => {
    if (open) return
    const remember = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement && event.target !== document.body && event.target.closest('[data-pm-dialog]')?.getAttribute('data-pm-dialog') !== id) focusTarget.current = event.target
    }
    document.addEventListener('focusin', remember, true)
    return () => document.removeEventListener('focusin', remember, true)
  }, [id, open])
  return h(Dialog.Root, { open, modal: true, onOpenChange: next => { if (!next && busy) return; onOpenChange?.(next); if (!next) onClose?.() } },
    trigger ? h(Dialog.Trigger, { asChild: true }, trigger) : null,
    h(Dialog.Portal, {}, h(Dialog.Overlay, { className: 'pm-ui-dialog-overlay' }),
      h(Dialog.Content, {
        className: cls(kind, 'pm-ui', name && `${name}__panel`), ...{ 'data-density': 'regular', 'data-pm-dialog': id }, 'aria-busy': busy || undefined,
        ...description ? {} : { 'aria-describedby': undefined },
        onInteractOutside: event => event.preventDefault(),
        onEscapeKeyDown: event => { event.stopPropagation(); if (busy) event.preventDefault() },
        onOpenAutoFocus: event => {
          onOpenAutoFocus?.(event)
          if (event.defaultPrevented || !(event.target instanceof HTMLElement)) return
          const panel = event.target
          if (panel.contains(document.activeElement)) { event.preventDefault(); return }
          const target = [...panel.querySelectorAll<HTMLElement>(`.${kind}__body :is(button, input, textarea, select, a[href], [tabindex]), .pm-ui-dialog__footer :is(button, input, textarea, select, a[href], [tabindex])`)].find(element => element.tabIndex >= 0 && !element.closest('[inert], [hidden]') && !element.matches(':disabled, [aria-disabled="true"]') && element.getClientRects().length && getComputedStyle(element).visibility === 'visible')
          if (target) { event.preventDefault(); target.focus() }
        },
        onCloseAutoFocus: event => {
          onCloseAutoFocus?.(event)
          if (event.defaultPrevented) return
          event.preventDefault()
          const available = (element: HTMLElement | null): element is HTMLElement => Boolean(element?.isConnected && element !== document.body && !element.closest(`[data-pm-dialog="${id}"], [inert], [hidden]`) && !element.matches(':disabled, [aria-disabled="true"]') && element.getClientRects().length && getComputedStyle(element).visibility === 'visible')
          const target = available(focusTarget.current) ? focusTarget.current : [...document.querySelectorAll<HTMLElement>('[role="toolbar"] button, main button')].find(available)
          target?.focus()
        },
      }, h('div', { className: `${kind}__header` },
        h(Dialog.Title, { className: `${kind}__title` }, label), actions,
        h(Dialog.Close, { asChild: true }, h(PmIconButton, { icon: 'close', label: closeLabel ?? (locale === 'zh-CN' ? '关闭' : 'Close'), small: true, disabled: busy }))),
      description ? h(Dialog.Description, { className: 'pm-ui-dialog__description' }, description) : null,
      h('div', { className: `${kind}__body` }, children),
      footer ? h('div', { className: 'pm-ui-dialog__footer' }, footer) : null)))
}
export function PmDialog(props: OverlayProps) { return h(DialogSurface, props) }
export function PmDrawer(props: OverlayProps) { return h(DialogSurface, { ...props, drawer: true }) }
const placement = (value: PopoverPlacement) => ({ side: value.startsWith('above') ? 'top' as const : 'bottom' as const, align: value.endsWith('start') ? 'start' as const : 'end' as const })
export function PmPopover({ open, label, name, children, trigger, placement: place = 'below-end', onOpenChange }: OverlayProps & { placement?: PopoverPlacement }) { return h(Popover.Root, { open, onOpenChange }, trigger ? h(Popover.Trigger, { asChild: true }, trigger) : null, h(Popover.Portal, {}, h(Popover.Content, { ...placement(place), className: cls('pm-ui-popover pm-ui-floating pm-ui', name), 'aria-label': label, onEscapeKeyDown: event => event.stopPropagation() }, children))) }
export function PmMenu({ label, items, icon = 'more', placement: place = 'below-end', onSelect }: { label: string, items: MenuItem[], icon?: IconName, placement?: PopoverPlacement, onSelect?(id: string): void }) {
  return h(Dropdown.Root, {},
    h(Dropdown.Trigger, { asChild: true }, h(PmIconButton, { icon, label, small: true })),
    h(Dropdown.Portal, {}, h(Dropdown.Content, { ...placement(place), className: 'pm-ui-menu pm-ui-floating pm-ui', ...{ 'data-density': 'compact' }, 'aria-label': label, onEscapeKeyDown: event => event.stopPropagation() },
      items.map(item => h(Dropdown.Group, { key: item.id }, item.separator ? h(Dropdown.Separator, { className: 'pm-ui-menu__separator' }) : null,
        item.checked === undefined ? h(Dropdown.Item, { disabled: item.disabled, textValue: item.label, className: cls('pm-ui-menu__item', item.danger && 'pm-ui-menu__item--danger'), onSelect: () => onSelect?.(item.id) },
          item.icon ? h(PmIcon, { name: item.icon }) : null, item.label, item.shortcut ? h('kbd', { className: 'pm-ui-shortcut' }, item.shortcut) : null)
        : h(Dropdown.CheckboxItem, { checked: item.checked, disabled: item.disabled, textValue: item.label, className: cls('pm-ui-menu__item', item.danger && 'pm-ui-menu__item--danger'), onSelect: () => onSelect?.(item.id) },
          h(Dropdown.ItemIndicator, {}, h(PmIcon, { name: 'check' })), item.label))))))
}
export function PmTabs({ value, modelValue, tabs, label, children, onValueChange, iconOnly, density = 'compact' }: { value?: string, modelValue?: string, tabs: Choice[], label: string, children?: ReactNode, iconOnly?: boolean, density?: ControlDensity, onValueChange?(value: string): void }) {
  return h(Tabs.Root, { value: value ?? modelValue, onValueChange, activationMode: 'manual', className: 'pm-ui-tabs-root', ...{ 'data-density': density } },
    h(Tabs.List, { className: 'pm-ui-tabs', 'aria-label': label }, tabs.map(tab => {
      const trigger = h(Tabs.Trigger, { key: tab.value, value: tab.value, className: 'pm-ui-tab', disabled: tab.disabled, 'aria-label': tab.label, ...{ 'data-icon-only': iconOnly || undefined } }, tab.icon ? h(PmIcon, { name: tab.icon }) : null, iconOnly ? null : tab.label)
      return iconOnly ? h(PmTooltip, { key: tab.value, label: tab.label, children: trigger }) : trigger
    })), children)
}
export function PmTabPanel({ value, children, forceMount, hidden }: { value: string, children?: ReactNode, forceMount?: true, hidden?: boolean }) { return h(Tabs.Content, { value, forceMount, hidden, className: 'pm-ui-tab-panel' }, children) }
export function PmSegmented({ value, modelValue, choices, items, label, onValueChange, density = 'compact', disabled }: { value?: string, modelValue?: string, choices?: Choice[], items?: Choice[], label: string, density?: ControlDensity, disabled?: boolean, onValueChange?(value: string): void }) {
  return h(RadioGroup.Root, { className: 'pm-ui-segmented', 'aria-label': label, value: value ?? modelValue, onValueChange, orientation: 'horizontal', ...{ 'data-density': density }, disabled },
    (choices ?? items ?? []).map(item => h(RadioGroup.Item, { key: item.value, value: item.value, className: 'pm-ui-segmented__option', disabled: item.disabled }, item.icon ? h(PmIcon, { name: item.icon }) : null, item.label)))
}
export function PmNotice({ tone = 'neutral', children, className, ...rest }: HTMLAttributes<HTMLDivElement> & { tone?: Tone }) { return h('div', { ...rest, className: cls('pm-ui-notice', tone !== 'neutral' && `pm-ui-notice--${tone}`, className), role: tone === 'danger' ? 'alert' : 'status' }, children) }
export function PmEmpty({ title, icon, action, children }: { title?: string, icon?: IconName, action?: ReactNode, children?: ReactNode }) { return h('div', { className: 'pm-ui-empty' }, icon ? h(PmIcon, { name: icon }) : null, title ? h('p', { className: 'pm-ui-empty__title' }, title) : null, children, action) }
export const ToolbarPlacementContext = createContext<ToolbarPlacement>('bar')
export const provideToolbarPlacement = ToolbarPlacementContext.Provider
export function useToolbarPlacement() { return useContext(ToolbarPlacementContext) }
export function PmToolbarEntry({ title, label = title ?? '', name, icon = 'more', open = false, onOpenChange, children }: { title?: string, name?: string, label?: string, closeLabel?: string, icon?: IconName, open?: boolean, onOpenChange?(open: boolean): void, children?: ReactNode }) { const where = useToolbarPlacement(); return h(PmPopover, { open, onOpenChange, name, label, placement: where === 'status' ? 'above-start' : 'below-end', trigger: h(PmIconButton, { icon, label, small: true, className: name && `${name}__toggle`, 'aria-expanded': open }) }, children) }
