import { createElement as h } from 'react'
import * as Dropdown from '@radix-ui/react-dropdown-menu'
import type { IconName } from '@lincyaw/design'
import { cls, placement, PmIcon, PmIconButton } from './components.ts'
import type { MenuItem, PopoverPlacement } from './components.ts'

// A module of its own, as `segmented.ts` is: a page whose code shows no menu loads none of Radix's menus.

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
