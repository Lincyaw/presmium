import type { InjectionKey, PropType, VNode } from 'vue'
import { defineComponent, cloneVNode, h, inject, provide, ref, useId } from 'vue'
import { DialogClose, DialogContent, DialogPortal, DialogRoot, DialogTitle, DialogTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuPortal, DropdownMenuRoot, DropdownMenuTrigger, PopoverAnchor, PopoverContent, PopoverPortal, PopoverRoot, TabsContent, TabsList, TabsRoot, TabsTrigger, ToggleGroupItem, ToggleGroupRoot } from 'reka-ui'
import type { ToolbarPlacement } from '../contracts.ts'
import { ICONS } from '@lincyaw/design'
import type { IconName } from '@lincyaw/design'

const PLACEMENT: InjectionKey<ToolbarPlacement> = Symbol('presmium.toolbarPlacement')
const OVERLAY_Z: InjectionKey<string> = Symbol('presmium.overlayZ')

function overlayStyle(kind: 'popover' | 'dialog') {
  const parent = inject(OVERLAY_Z, undefined)
  const zIndex = parent ? `calc(${parent} + 1)` : `var(--pm-z-${kind})`
  provide(OVERLAY_Z, zIndex)
  return { zIndex }
}


/** @experimental */
export function useToolbarPlacement(): ToolbarPlacement {
  return inject(PLACEMENT, 'bar')
}

/** @experimental */
export function provideToolbarPlacement(placement: ToolbarPlacement): void {
  provide(PLACEMENT, placement)
}

export const PmIcon = defineComponent({
  name: 'PmIcon',
  props: {
    name: { type: String as PropType<IconName>, required: true },
    size: { type: [Number, String], default: 20 },
    strokeWidth: { type: Number, default: 1.7 },
  },
  setup(props) {
    return () => h('svg', {
      'class': 'pm-ui-icon',
      'width': props.size,
      'height': props.size,
      'viewBox': '0 0 24 24',
      'fill': 'none',
      'stroke': 'currentColor',
      'stroke-width': props.strokeWidth,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      'aria-hidden': 'true',
      'focusable': 'false',
    }, (ICONS[props.name] ?? []).map(([tag, attrs]) => h(tag, attrs)))
  },
})

export type ButtonVariant = 'default' | 'primary' | 'accent' | 'ghost' | 'danger'

export const PmButton = defineComponent({
  name: 'PmButton',
  props: {
    variant: { type: String as PropType<ButtonVariant>, default: 'default' },
    small: Boolean,
    icon: String as PropType<IconName>,
    type: { type: String as PropType<'button' | 'submit' | 'reset'>, default: 'button' },
  },
  setup(props, { slots }) {
    return () => h('button', {
      type: props.type,
      class: ['pm-ui-button', props.variant !== 'default' && `pm-ui-button--${props.variant}`, props.small && 'pm-ui-button--small'],
    }, [props.icon ? h(PmIcon, { name: props.icon, size: props.small ? 14 : 16, strokeWidth: 2 }) : null, slots.default?.()])
  },
})

export const PmIconButton = defineComponent({
  name: 'PmIconButton',
  props: {
    icon: { type: String as PropType<IconName>, required: true },
    label: { type: String, required: true },
    small: Boolean,
  },
  setup(props) {
    return () => h('button', {
      'type': 'button',
      'class': ['pm-ui-icon-button', props.small && 'pm-ui-icon-button--small'],
      'aria-label': props.label,
      'title': props.label,
    }, [h(PmIcon, { name: props.icon, size: props.small ? 16 : 20 })])
  },
})

export type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger' | 'outline'

export const PmBadge = defineComponent({
  name: 'PmBadge',
  props: {
    tone: { type: String as PropType<Tone>, default: 'neutral' },
    pill: Boolean,
  },
  setup(props, { slots }) {
    return () => h('span', { class: ['pm-ui-badge', props.tone !== 'neutral' && `pm-ui-badge--${props.tone}`, props.pill && 'pm-ui-badge--pill'] }, slots.default?.())
  },
})

export const PmCard = defineComponent({
  name: 'PmCard',
  props: {
    variant: { type: String as PropType<'default' | 'interactive' | 'dashed'>, default: 'default' },
    tag: { type: String, default: 'div' },
  },
  setup(props, { slots }) {
    return () => h(props.tag, { class: ['pm-ui-card', props.variant !== 'default' && `pm-ui-card--${props.variant}`] }, slots.default?.())
  },
})

export const PmField = defineComponent({
  name: 'PmField',
  props: {
    label: { type: String, required: true },
    inline: Boolean,
  },
  setup(props, { slots }) {
    return () => h('label', { class: ['pm-ui-field', props.inline && 'pm-ui-field--inline'] }, props.inline
      ? [slots.default?.(), h('span', { class: 'pm-ui-field__label' }, props.label)]
      : [h('span', { class: 'pm-ui-field__label' }, props.label), slots.default?.()])
  },
})

export interface Choice {
  value: string
  label: string
}

export const PmSegmented = defineComponent({
  name: 'PmSegmented',
  props: {
    modelValue: { type: String, required: true },
    options: { type: Array as PropType<Choice[]>, required: true },
    label: { type: String, required: true },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => h(ToggleGroupRoot, {
      'type': 'single', 'class': 'pm-ui-segmented', 'aria-label': props.label, 'modelValue': props.modelValue,
      'onUpdate:modelValue': value => { if (typeof value === 'string' && value) emit('update:modelValue', value) },
    }, () => props.options.map(option => h(ToggleGroupItem, {
      key: option.value, value: option.value, class: 'pm-ui-segmented__option',
    }, () => option.label)))
  },
})

export const PmTabs = defineComponent({
  name: 'PmTabs',
  props: {
    modelValue: { type: String, required: true },
    tabs: { type: Array as PropType<Choice[]>, required: true },
    label: { type: String, required: true },
  },
  emits: ['update:modelValue'],
  setup(props, { emit, slots }) {
    return () => h(TabsRoot, {
      'class': 'pm-ui-tabset', 'modelValue': props.modelValue,
      'onUpdate:modelValue': value => emit('update:modelValue', String(value)),
    }, () => [
      h(TabsList, { class: 'pm-ui-tabs', 'aria-label': props.label }, () => props.tabs.map(tab =>
        h(TabsTrigger, { key: tab.value, value: tab.value, class: 'pm-ui-tab' }, () => tab.label))),
      slots.default ? h(TabsContent, { key: props.modelValue, value: props.modelValue, class: 'pm-ui-tabpanel', tabindex: 0 }, () => slots.default?.({ value: props.modelValue })) : null,
    ])
  },
})

export type PopoverPlacement = 'below-end' | 'below-start' | 'above-end' | 'above-start'

function placement(value: PopoverPlacement) {
  return { side: value.startsWith('above') ? 'top' as const : 'bottom' as const, align: value.endsWith('start') ? 'start' as const : 'end' as const, sideOffset: 6, collisionPadding: 16 }
}

export const PmPopover = defineComponent({
  name: 'PmPopover',
  props: {
    open: Boolean,
    label: { type: String, required: true },
    placement: { type: String as PropType<PopoverPlacement>, default: 'below-end' },
    name: String,
  },
  emits: ['update:open'],
  setup(props, { emit, slots }) {
    const style = overlayStyle('popover')
    const anchor = ref<HTMLElement>()
    const id = useId()
    let outside = false
    return () => h(PopoverRoot, { 'open': props.open, 'onUpdate:open': value => emit('update:open', value) }, () => [
      h(PopoverAnchor, { asChild: true }, () => h('span', { ref: anchor, class: ['pm-ui-anchor', props.name] }, slots.trigger?.().map(node => cloneVNode(node, {
        'aria-haspopup': 'dialog', 'aria-expanded': props.open, 'aria-controls': props.open ? id : undefined,
      })))),
      h(PopoverPortal, {}, () => h(PopoverContent, {
        ...placement(props.placement), 'id': id, style,
        onOpenAutoFocus: () => { outside = false },
        onInteractOutside: () => { outside = true },
        onCloseAutoFocus: (event: Event) => { event.preventDefault(); if (!outside) anchor.value?.querySelector<HTMLElement>('button, [href]')?.focus() },
        'class': ['pm-ui-popover', 'pm-ui-floating', 'pm-ui', props.name && `${props.name}__panel`], 'aria-label': props.label,
      }, slots.default)),
    ])
  },
})

const dialogProps = {
  open: Boolean,
  label: { type: String, required: true },
  closeLabel: { type: String, required: true },
  name: String,
} as const

function dialogComponent(drawer: boolean) {
  return defineComponent({
    name: drawer ? 'PmDrawer' : 'PmDialog',
    props: dialogProps,
    emits: ['update:open'],
    setup(props, { emit, slots }) {
      const style = overlayStyle(drawer ? 'popover' : 'dialog')
      const kind = drawer ? 'pm-ui-drawer' : 'pm-ui-dialog'
      let opener: HTMLElement | undefined
      return () => h(DialogRoot, { 'open': props.open, 'onUpdate:open': value => emit('update:open', value) }, () => [
        slots.trigger ? h(DialogTrigger, { asChild: true }, slots.trigger) : null,
        h(DialogPortal, {}, () => h(DialogContent, {
          'class': [kind, 'pm-ui', props.name && `${props.name}__panel`], 'style': style, 'aria-describedby': undefined,
          onOpenAutoFocus: () => { opener = document.activeElement instanceof HTMLElement ? document.activeElement : undefined },
          onCloseAutoFocus: (event: Event) => {
            if (slots.trigger || !opener?.isConnected) return
            event.preventDefault()
            opener.focus()
          },
        }, () => [
          h('div', { class: `${kind}__header` }, [
            h(DialogTitle, { as: 'h2', class: `${kind}__title` }, () => props.label),
            slots.actions?.(),
            h(DialogClose, { asChild: true }, () => h(PmIconButton, { icon: 'close', label: props.closeLabel, small: true })),
          ]),
          h('div', { class: `${kind}__body` }, slots.default?.()),
        ])),
      ])
    },
  })
}

export const PmDrawer = dialogComponent(true)
export const PmDialog = dialogComponent(false)

export interface MenuItem {
  id: string
  label: string
  icon?: IconName
  danger?: boolean
  disabled?: boolean
}

export const PmMenu = defineComponent({
  name: 'PmMenu',
  props: {
    label: { type: String, required: true },
    items: { type: Array as PropType<MenuItem[]>, required: true },
    icon: { type: String as PropType<IconName>, default: 'more' },
    placement: { type: String as PropType<PopoverPlacement>, default: 'below-end' },
  },
  emits: ['select'],
  setup(props, { emit }) {
    const style = overlayStyle('popover')
    return () => h(DropdownMenuRoot, {}, () => [
      h(DropdownMenuTrigger, { asChild: true }, () => h(PmIconButton, { icon: props.icon, label: props.label, small: true })),
      h(DropdownMenuPortal, {}, () => h(DropdownMenuContent, { ...placement(props.placement), style, class: ['pm-ui-menu', 'pm-ui-floating', 'pm-ui'], 'aria-label': props.label }, () => props.items.map(item =>
        h(DropdownMenuItem, {
          key: item.id, disabled: item.disabled, textValue: item.label,
          class: ['pm-ui-menu__item', item.danger && 'pm-ui-menu__item--danger'],
          onSelect: () => emit('select', item.id),
        }, () => [item.icon ? h(PmIcon, { name: item.icon, size: 16 }) : null, item.label])))),
    ])
  },
})

export const PmEmpty = defineComponent({
  name: 'PmEmpty',
  props: {
    title: String,
    icon: String as PropType<IconName>,
  },
  setup(props, { slots }) {
    return () => h('div', { class: 'pm-ui-empty' }, [
      props.icon ? h(PmIcon, { name: props.icon, size: 28 }) : null,
      props.title ? h('p', { class: 'pm-ui-empty__title' }, props.title) : null,
      slots.default ? h('p', { style: { margin: 0 } }, slots.default()) : null,
      slots.action?.(),
    ])
  },
})

export const PmNotice = defineComponent({
  name: 'PmNotice',
  props: {
    tone: { type: String as PropType<'neutral' | 'accent' | 'ok' | 'warn' | 'danger'>, default: 'neutral' },
  },
  setup(props, { slots }) {
    return (): VNode => h('p', { class: ['pm-ui-notice', props.tone !== 'neutral' && `pm-ui-notice--${props.tone}`], role: props.tone === 'danger' ? 'alert' : 'status' }, slots.default?.())
  },
})

export const PmToolbarEntry = defineComponent({
  name: 'PmToolbarEntry',
  props: {
    name: { type: String, required: true },
    label: { type: String, required: true },
    closeLabel: { type: String, required: true },
    icon: String as PropType<IconName>,
    open: Boolean,
  },
  emits: ['update:open'],
  setup(props, { emit, slots }) {
    const placement = useToolbarPlacement()
    const update = (open: boolean) => emit('update:open', open)
    const toggleAttrs = () => ({
      'class': `${props.name}__toggle`,
      'aria-expanded': props.open ? 'true' : 'false',
      'onClick': () => update(!props.open),
    })
    return () => {
      return h(PmPopover, { 'open': props.open, 'label': props.label, 'name': props.name, 'placement': placement === 'status' ? 'above-start' : 'below-end', 'onUpdate:open': update }, {
        trigger: () => h(PmButton, { variant: 'ghost', small: true, icon: props.icon, ...toggleAttrs() }, () => props.label),
        default: () => slots.default?.(),
      })
    }
  },
})
