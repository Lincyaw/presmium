/**
 * The shared components of the design (N-10, docs/architecture.md 5.10):
 * icons, buttons, fields, badges, cards, segmented controls, tabs, popovers,
 * drawers, dialogs, menus, empty states and notices, drawn with the classes of
 * components.css. Plugins use these rather than controls of their own.
 */
import type { InjectionKey, PropType, VNode } from 'vue'
import { defineComponent, h, inject, nextTick, onBeforeUnmount, onMounted, provide, ref, Teleport, watch } from 'vue'
import type { ToolbarPlace } from '../types.ts'
import { ICONS } from '@presmium/design'
import type { IconName } from '@presmium/design'

const PLACE: InjectionKey<ToolbarPlace> = Symbol('presmium.toolbarPlace')

/**
 * Where the calling toolbar item is drawn (see `ToolbarPlace`); a page's toolbar unless a shell says otherwise.
 *
 * @experimental The workbench's browser side, outside the 1.x semver promise (docs/api.md section 3).
 */
export function useToolbarPlace(): ToolbarPlace {
  return inject(PLACE, 'bar')
}

/**
 * Tells the toolbar items below the calling component where they are drawn. Must be called inside a component setup.
 *
 * @experimental The workbench's browser side, outside the 1.x semver promise (docs/api.md section 3).
 */
export function provideToolbarPlace(place: ToolbarPlace): void {
  provide(PLACE, place)
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

/** A button: `primary` (ink) for the main action, `accent` for a switch that is on, `ghost` without a frame. */
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

/** A button that is an icon only; its label is its accessible name and its tooltip. */
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

/** A short label: a count, a language, a state (`ok`, `warn`); `pill` for the source of a change. */
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

/** A card; `interactive` when it leads somewhere, `dashed` for a way to make something new. */
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

/** A labelled field around its control (the default slot); `inline` puts a checkbox before its label. */
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

/** A row of mutually exclusive buttons (the preview's views): the chosen one raised. */
export const PmSegmented = defineComponent({
  name: 'PmSegmented',
  props: {
    modelValue: { type: String, required: true },
    options: { type: Array as PropType<Choice[]>, required: true },
    label: { type: String, required: true },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () => h('div', { 'class': 'pm-ui-segmented', 'role': 'group', 'aria-label': props.label }, props.options.map(option => h('button', {
      'key': option.value,
      'type': 'button',
      'class': 'pm-ui-segmented__option',
      'aria-pressed': option.value === props.modelValue ? 'true' : 'false',
      'onClick': () => emit('update:modelValue', option.value),
    }, option.label)))
  },
})

let ids = 0

/**
 * Tabs: the tab list, and the chosen tab's panel (the default slot, given the
 * chosen `value`), labelled by its tab. Arrow keys move between tabs.
 */
export const PmTabs = defineComponent({
  name: 'PmTabs',
  props: {
    modelValue: { type: String, required: true },
    tabs: { type: Array as PropType<Choice[]>, required: true },
    label: { type: String, required: true },
  },
  emits: ['update:modelValue'],
  setup(props, { emit, slots }) {
    const prefix = `pm-ui-tabs-${++ids}`
    const list = ref<HTMLElement>()
    const tabId = (value: string) => `${prefix}-tab-${value}`
    const panelId = (value: string) => `${prefix}-panel-${value}`
    const move = (event: KeyboardEvent) => {
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
      if (!step) return
      event.preventDefault()
      const index = props.tabs.findIndex(tab => tab.value === props.modelValue)
      const next = props.tabs[(index + step + props.tabs.length) % props.tabs.length]
      if (!next) return
      emit('update:modelValue', next.value)
      void nextTick(() => list.value?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus())
    }
    return () => h('div', { class: 'pm-ui-tabset' }, [
      h('div', { 'ref': list, 'class': 'pm-ui-tabs', 'role': 'tablist', 'aria-label': props.label, 'onKeydown': move }, props.tabs.map((tab) => {
        const selected = tab.value === props.modelValue
        return h('button', {
          'key': tab.value,
          'type': 'button',
          'role': 'tab',
          'class': 'pm-ui-tab',
          'id': tabId(tab.value),
          'aria-selected': selected ? 'true' : 'false',
          'aria-controls': selected && slots.default ? panelId(tab.value) : undefined,
          'tabindex': selected ? 0 : -1,
          'onClick': () => emit('update:modelValue', tab.value),
        }, tab.label)
      })),
      slots.default
        ? h('div', { 'class': 'pm-ui-tabpanel', 'role': 'tabpanel', 'id': panelId(props.modelValue), 'aria-labelledby': tabId(props.modelValue), 'tabindex': 0 }, slots.default({ value: props.modelValue }))
        : null,
    ])
  },
})

/**
 * Closes what floats on Escape, wherever the focus is (giving it back to the
 * trigger, the first control of `root`, when it was inside or lost), and on a
 * press outside `root` (the trigger and the panel). A dialog keeps its place
 * on a press outside, and gives the focus back itself.
 */
function useDismiss(open: () => boolean, close: () => void, root: () => HTMLElement | undefined, dialog = false): void {
  const outside = !dialog
  const onPointer = (event: PointerEvent) => {
    if (!outside || !open()) return
    const target = event.target as Node | null
    if (target && root()?.contains(target)) return
    close()
  }
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !open()) return
    const within = root()?.contains(document.activeElement)
    close()
    if (!dialog && (within || document.activeElement === document.body)) root()?.querySelector<HTMLElement>('button, [href], input, select, textarea')?.focus()
  }
  onMounted(() => {
    document.addEventListener('pointerdown', onPointer, true)
    document.addEventListener('keydown', onKey)
  })
  onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onPointer, true)
    document.removeEventListener('keydown', onKey)
  })
}

/**
 * Keeps a floating panel inside the window, 1 rem from its sides: a panel
 * that would leave it (its trigger near an edge, a phone's narrow screen,
 * e.g. VitePress's navigation screen) moves sideways. It follows the window
 * and the panel's size, which its content changes as it loads.
 */
function useInView(panel: () => HTMLElement | undefined): void {
  let observer: ResizeObserver | undefined
  const place = () => {
    const element = panel()
    if (!element) return
    element.style.translate = ''
    const box = element.getBoundingClientRect()
    const margin = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    const width = document.documentElement.clientWidth
    let shift = box.right > width - margin ? width - margin - box.right : 0
    if (box.left + shift < margin) shift = margin - box.left
    if (shift) element.style.translate = `${Math.round(shift)}px 0`
  }
  watch(panel, (element) => {
    observer?.disconnect()
    observer = undefined
    if (!element || typeof ResizeObserver === 'undefined') return
    observer = new ResizeObserver(place)
    observer.observe(element)
  }, { flush: 'post' })
  onMounted(() => window.addEventListener('resize', place))
  onBeforeUnmount(() => {
    observer?.disconnect()
    window.removeEventListener('resize', place)
  })
}

export type PopoverPlacement = 'below-end' | 'below-start' | 'above-end' | 'above-start'

/**
 * A panel that floats by its trigger (the `trigger` slot), labelled `label`,
 * with the default slot's content, inside the window; Escape and a press
 * outside close it. `name` prefixes the classes of the wrapper and the panel
 * (`<name>__panel`).
 */
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
    const root = ref<HTMLElement>()
    const panel = ref<HTMLElement>()
    useDismiss(() => props.open, () => emit('update:open', false), () => root.value)
    useInView(() => panel.value)
    return () => h('span', { ref: root, class: ['pm-ui-anchor', props.name] }, [
      slots.trigger?.(),
      props.open
        ? h('div', { 'ref': panel, 'class': ['pm-ui-popover', `pm-ui-popover--${props.placement}`, props.name && `${props.name}__panel`], 'role': 'dialog', 'aria-label': props.label }, slots.default?.())
        : null,
    ])
  },
})

/**
 * A panel beside the activity bar, as tall as the window: a title, a close
 * button and the default slot. Escape and a press outside close it.
 */
export const PmDrawer = defineComponent({
  name: 'PmDrawer',
  props: {
    open: Boolean,
    label: { type: String, required: true },
    closeLabel: { type: String, required: true },
    name: String,
  },
  emits: ['update:open'],
  setup(props, { emit, slots }) {
    const root = ref<HTMLElement>()
    const close = () => emit('update:open', false)
    useDismiss(() => props.open, close, () => root.value)
    return () => h('span', { ref: root, class: ['pm-ui-anchor', props.name] }, [
      slots.trigger?.(),
      props.open
        ? h('div', { 'class': ['pm-ui-drawer', props.name && `${props.name}__panel`], 'role': 'dialog', 'aria-label': props.label }, [
            h('div', { class: 'pm-ui-drawer__header' }, [
              h('h2', { class: 'pm-ui-drawer__title' }, props.label),
              h(PmIconButton, { icon: 'close', label: props.closeLabel, small: true, onClick: close }),
            ]),
            h('div', { class: 'pm-ui-drawer__body' }, slots.default?.()),
          ])
        : null,
    ])
  },
})

/**
 * A dialog over the page, titled `label` (its accessible name), with a close
 * button: not modal, so the page stays usable; Escape closes it and the
 * focus goes back where it was. It moves to the end of the document, out of
 * any toolbar.
 */
export const PmDialog = defineComponent({
  name: 'PmDialog',
  props: {
    open: Boolean,
    label: { type: String, required: true },
    closeLabel: { type: String, required: true },
    name: String,
  },
  emits: ['update:open'],
  setup(props, { emit, slots }) {
    const panel = ref<HTMLElement>()
    const id = `pm-ui-dialog-${++ids}`
    let before: HTMLElement | undefined
    const close = () => emit('update:open', false)
    useDismiss(() => props.open, close, () => panel.value, true)
    watch(() => props.open, async (open) => {
      if (typeof document === 'undefined') return
      if (!open) {
        if (before?.isConnected) before.focus()
        before = undefined
        return
      }
      before = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
      await nextTick()
      const first = panel.value?.querySelector<HTMLElement>('.pm-ui-dialog__body :is(input, select, textarea, button, [href])')
      ;(first ?? panel.value)?.focus()
    }, { immediate: true })
    return () => (props.open
      ? h(Teleport, { to: 'body' }, h('div', {
          'ref': panel,
          'class': ['pm-ui-dialog', 'pm-ui', props.name && `${props.name}__panel`],
          'role': 'dialog',
          'aria-labelledby': id,
          'tabindex': -1,
        }, [
          h('div', { class: 'pm-ui-dialog__header' }, [
            h('h2', { id, class: 'pm-ui-dialog__title' }, props.label),
            slots.actions?.(),
            h(PmIconButton, { icon: 'close', label: props.closeLabel, small: true, onClick: close }),
          ]),
          h('div', { class: 'pm-ui-dialog__body' }, slots.default?.()),
        ]))
      : null)
  },
})

export interface MenuItem {
  id: string
  label: string
  icon?: IconName
  danger?: boolean
  disabled?: boolean
}

/**
 * A menu behind an icon button (`more` by default): arrow keys move between
 * its items, Enter chooses one (`select` with its id), Escape closes it; the
 * focus goes back to the button.
 */
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
    const open = ref(false)
    const root = ref<HTMLElement>()
    const list = ref<HTMLElement>()
    const close = () => open.value = false
    useDismiss(() => open.value, close, () => root.value)
    useInView(() => list.value)
    const items = () => [...(root.value?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])]
    const focusAt = (index: number) => {
      const all = items()
      all[(index + all.length) % all.length]?.focus()
    }
    const onKey = (event: KeyboardEvent) => {
      const all = items()
      const at = all.indexOf(document.activeElement as HTMLElement)
      if (event.key === 'ArrowDown') focusAt(at + 1)
      else if (event.key === 'ArrowUp') focusAt(at - 1)
      else if (event.key === 'Tab') return close()
      else return
      event.preventDefault()
    }
    const toggle = async () => {
      open.value = !open.value
      if (open.value) {
        await nextTick()
        focusAt(0)
      }
    }
    return () => h('span', { ref: root, class: 'pm-ui-anchor', onKeydown: onKey }, [
      h(PmIconButton, { 'icon': props.icon, 'label': props.label, 'small': true, 'aria-haspopup': 'menu', 'aria-expanded': open.value ? 'true' : 'false', 'onClick': toggle }),
      open.value
        ? h('ul', { 'ref': list, 'class': ['pm-ui-menu', `pm-ui-popover--${props.placement}`], 'role': 'menu', 'aria-label': props.label }, props.items.map(item => h('li', { key: item.id, role: 'none' }, [
            h('button', {
              'type': 'button',
              'role': 'menuitem',
              'class': ['pm-ui-menu__item', item.danger && 'pm-ui-menu__item--danger'],
              'disabled': item.disabled,
              'tabindex': -1,
              'onClick': () => {
                close()
                root.value?.querySelector<HTMLElement>('button')?.focus()
                emit('select', item.id)
              },
            }, [item.icon ? h(PmIcon, { name: item.icon, size: 16 }) : null, item.label]),
          ])))
        : null,
    ])
  },
})

/** What a place shows while it has nothing: an icon, a title, a sentence (the default slot) and an action. */
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

/** A message in a box: `role="status"`, or `alert` for a failure (`tone: 'danger'`); `role` from the caller wins. */
export const PmNotice = defineComponent({
  name: 'PmNotice',
  props: {
    tone: { type: String as PropType<'neutral' | 'accent' | 'ok' | 'warn' | 'danger'>, default: 'neutral' },
  },
  setup(props, { slots }) {
    return (): VNode => h('p', { class: ['pm-ui-notice', props.tone !== 'neutral' && `pm-ui-notice--${props.tone}`], role: props.tone === 'danger' ? 'alert' : 'status' }, slots.default?.())
  },
})

/**
 * A toolbar item that opens a panel, drawn for its place (`useToolbarPlace`):
 * in the activity bar an icon button and a drawer beside it, elsewhere a
 * button with its label and a popover (above it in a status bar). `name`
 * prefixes the classes: the wrapper `<name>`, the button `<name>__toggle`,
 * the panel `<name>__panel` (a dialog labelled `label`). Its activity-bar form
 * is the workbench's browser side, outside the 1.x semver promise (docs/api.md section 3).
 */
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
    const place = useToolbarPlace()
    const update = (open: boolean) => emit('update:open', open)
    const toggleAttrs = () => ({
      'class': `${props.name}__toggle`,
      'aria-expanded': props.open ? 'true' : 'false',
      'onClick': () => update(!props.open),
    })
    return () => {
      if (place === 'activity' && props.icon) {
        return h(PmDrawer, { 'open': props.open, 'label': props.label, 'closeLabel': props.closeLabel, 'name': props.name, 'onUpdate:open': update }, {
          trigger: () => h(PmIconButton, { icon: props.icon!, label: props.label, ...toggleAttrs() }),
          default: () => slots.default?.(),
        })
      }
      return h(PmPopover, { 'open': props.open, 'label': props.label, 'name': props.name, 'placement': place === 'status' ? 'above-start' : 'below-end', 'onUpdate:open': update }, {
        trigger: () => h(PmButton, { variant: 'ghost', small: true, icon: props.icon, ...toggleAttrs() }, () => props.label),
        default: () => slots.default?.(),
      })
    }
  },
})
