import { createElement as h } from 'react'
import * as RadioGroup from '@radix-ui/react-radio-group'
import { PmIcon } from './components.ts'
import type { Choice, ControlDensity } from './components.ts'

// A module of its own, as `menu.ts` is: a page whose code shows no segmented control loads none of Radix's radio group.

export function PmSegmented({ value, modelValue, choices, items, label, onValueChange, density = 'compact', disabled }: { value?: string, modelValue?: string, choices?: Choice[], items?: Choice[], label: string, density?: ControlDensity, disabled?: boolean, onValueChange?(value: string): void }) {
  return h(RadioGroup.Root, { className: 'pm-ui-segmented', 'aria-label': label, value: value ?? modelValue, onValueChange, orientation: 'horizontal', ...{ 'data-density': density }, disabled },
    (choices ?? items ?? []).map(item => h(RadioGroup.Item, { key: item.value, value: item.value, className: 'pm-ui-segmented__option', disabled: item.disabled }, item.icon ? h(PmIcon, { name: item.icon }) : null, item.label)))
}
