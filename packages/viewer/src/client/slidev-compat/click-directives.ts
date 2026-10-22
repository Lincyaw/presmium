import type { App, Directive, DirectiveBinding, Ref } from 'vue'
import { defineComponent, h, onBeforeUnmount, onMounted, shallowRef, watchEffect, withDirectives } from 'vue'
import { clickVisible, resolveClicks } from '../../domain/index.ts'
import type { ClickRange, ClickSpec } from '../../domain/index.ts'

interface Controller {
  add(el: HTMLElement, spec: ClickSpec): void
  remove(el: HTMLElement): void
}

export const BLOCK_CLASS = 'pm-block'

const controllers = new WeakMap<Element, Controller>()
const owners = new WeakMap<HTMLElement, Controller>()
const pending = new Map<HTMLElement, ClickSpec>()

function register(el: HTMLElement, spec: ClickSpec): void {
  const block = el.closest(`.${BLOCK_CLASS}`)
  const controller = block ? controllers.get(block) : undefined
  if (!controller) {
    pending.set(el, spec)
    return
  }
  owners.set(el, controller)
  controller.add(el, spec)
}

function unregister(el: HTMLElement): void {
  pending.delete(el)
  owners.get(el)?.remove(el)
  owners.delete(el)
}

export function trackClicks(block: HTMLElement, step: Readonly<Ref<number>>): () => void {
  const specs = new Map<HTMLElement, ClickSpec>()
  const ranges = shallowRef(new Map<HTMLElement, ClickRange>())
  const resolve = () => {
    const ordered = [...specs.keys()].sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    const resolved = resolveClicks(ordered.map(el => specs.get(el)!))
    ranges.value = new Map(ordered.map((el, i) => [el, resolved[i]!]))
  }
  const controller: Controller = {
    add(el, spec) {
      specs.set(el, spec)
      resolve()
    },
    remove(el) {
      if (specs.delete(el)) resolve()
    },
  }
  controllers.set(block, controller)
  for (const [el, spec] of pending) {
    if (!block.contains(el)) continue
    pending.delete(el)
    owners.set(el, controller)
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

function clickComponent(name: string, directive: Directive) {
  return defineComponent({
    name,
    props: clickProps,
    setup(props, { slots }) {
      return () => withDirectives(h('span', { class: 'pm-v-click' }, slots.default?.()), [[directive, props.at, '', { hide: props.hide }]])
    },
  })
}

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

export function installClickDirectives(app: App): void {
  app.directive('click', vClick)
  app.directive('after', vAfter)
  app.directive('click-hide', clickDirective('click', true))
  app.component('VClick', clickComponent('VClick', vClick))
  app.component('VAfter', clickComponent('VAfter', vAfter))
  app.component('VClicks', VClicks)
}
