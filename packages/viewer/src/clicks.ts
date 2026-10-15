/**
 * `v-click` compatibility for plugin components written for Slidev: the
 * directives `v-click`, `v-after`, `v-click-hide` and the components
 * `<v-click>`, `<v-after>`, `<v-clicks>`. As in a slide, click positions are
 * steps of the section: absolute numbers are section steps (components give
 * theirs with `useStepScope().step(k)`), relative ones count on from the
 * previous relative click of the block. An element shows while the section's
 * step is inside its click range (`.hide`: outside it). Where every step is
 * shown (the document view) elements take their final state, as the
 * component's step state does.
 */
import type { App, Directive, DirectiveBinding, Ref } from 'vue'
import { defineComponent, h, onBeforeUnmount, onMounted, shallowRef, watchEffect, withDirectives } from 'vue'
import { clickVisible, resolveClicks } from './domain/index.ts'
import type { ClickRange, ClickSpec } from './domain/index.ts'

interface Controller {
  add(el: HTMLElement, spec: ClickSpec): void
  remove(el: HTMLElement): void
}

/** Root class of a block; its click elements are resolved together. */
export const BLOCK_CLASS = 'pm-block'

const controllers = new WeakMap<Element, Controller>()
/** Elements mounted before their block (children mount first); claimed when it mounts. */
const pending = new Map<HTMLElement, ClickSpec>()

function controllerOf(el: HTMLElement): Controller | undefined {
  const block = el.closest(`.${BLOCK_CLASS}`)
  return block ? controllers.get(block) : undefined
}

function register(el: HTMLElement, spec: ClickSpec): void {
  const controller = controllerOf(el)
  if (controller) controller.add(el, spec)
  else pending.set(el, spec)
}

function unregister(el: HTMLElement): void {
  pending.delete(el)
  controllerOf(el)?.remove(el)
}

/**
 * Tracks the click elements of a block and marks each `data-pm-click="shown|hidden"`
 * for the section's step. Returns a function that stops tracking.
 */
export function trackClicks(block: HTMLElement, step: Readonly<Ref<number>>): () => void {
  const specs = new Map<HTMLElement, ClickSpec>()
  const ranges = shallowRef(new Map<HTMLElement, ClickRange>())
  const resolve = () => {
    const ordered = [...specs.keys()].sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    const resolved = resolveClicks(ordered.map(el => specs.get(el)!))
    ranges.value = new Map(ordered.map((el, i) => [el, resolved[i]!]))
  }
  controllers.set(block, {
    add(el, spec) {
      specs.set(el, spec)
      resolve()
    },
    remove(el) {
      specs.delete(el)
      resolve()
    },
  })
  for (const [el, spec] of pending) {
    if (!block.contains(el)) continue
    pending.delete(el)
    specs.set(el, spec)
  }
  resolve()
  const stop = watchEffect(() => {
    for (const [el, range] of ranges.value) el.dataset.pmClick = clickVisible(range, step.value) ? 'shown' : 'hidden'
  })
  return () => {
    stop()
    controllers.delete(block)
  }
}

function clickDirective(kind: ClickSpec['kind'], hide = false): Directive<HTMLElement, unknown> {
  const spec = (binding: DirectiveBinding<unknown>): ClickSpec => ({ kind, at: binding.value, hide: hide || Boolean(binding.modifiers.hide) })
  return {
    mounted(el, binding) {
      register(el, spec(binding))
    },
    // A position given by the step scope moves when a live update moves the block.
    updated(el, binding) {
      if (JSON.stringify(binding.value) === JSON.stringify(binding.oldValue)) return
      unregister(el)
      register(el, spec(binding))
    },
    unmounted(el) {
      unregister(el)
    },
  }
}

const vClick = clickDirective('click')
const vAfter = clickDirective('after')

const clickProps = { at: { type: [Number, String, Array], default: undefined }, hide: Boolean }

/** `<v-click>` and `<v-after>`: the content as one click target, without a layout box. */
function clickComponent(name: string, directive: Directive) {
  return defineComponent({
    name,
    props: clickProps,
    setup(props, { slots }) {
      return () => withDirectives(h('span', { class: 'pm-v-click' }, slots.default?.()), [[directive, props.at, '', { hide: props.hide }]])
    },
  })
}

/** `<v-clicks>`: each list item (or each child) is a click target; `every` groups them. */
const VClicks = defineComponent({
  name: 'VClicks',
  props: { every: { type: [Number, String], default: 1 }, hide: Boolean },
  setup(props, { slots }) {
    const root = shallowRef<HTMLElement>()
    let items: HTMLElement[] = []
    onMounted(() => {
      const children = [...root.value!.children] as HTMLElement[]
      items = children.flatMap(child => (/^(UL|OL)$/.test(child.tagName) ? [...child.children] as HTMLElement[] : [child]))
      const every = Math.max(1, Number(props.every) || 1)
      items.forEach((item, i) => register(item, { kind: i % every === 0 ? 'click' : 'after', hide: props.hide }))
    })
    onBeforeUnmount(() => items.forEach(unregister))
    return () => h('div', { ref: root, class: 'pm-v-clicks' }, slots.default?.())
  },
})

export function installClicks(app: App): void {
  app.directive('click', vClick)
  app.directive('after', vAfter)
  app.directive('click-hide', clickDirective('click', true))
  app.component('VClick', clickComponent('VClick', vClick))
  app.component('VAfter', clickComponent('VAfter', vAfter))
  app.component('VClicks', VClicks)
}
