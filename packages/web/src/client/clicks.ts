/**
 * `v-click` compatibility layer of the web form: the directives `v-click`,
 * `v-after`, `v-click-hide` and the components `<v-click>`, `<v-after>`,
 * `<v-clicks>`. Document sections show everything; scrolly sections show an
 * element while the scrolled-to step is inside its click range.
 */
import type { App, Directive, Ref } from 'vue'
import { defineComponent, h, onBeforeUnmount, onMounted, shallowRef, watchEffect, withDirectives } from 'vue'
import { clickVisible, resolveClicks } from '../domain/index.ts'
import type { ClickRange, ClickSpec, SectionLayout } from '../domain/index.ts'

interface Controller {
  add(el: HTMLElement, spec: ClickSpec): void
  remove(el: HTMLElement): void
}

const controllers = new WeakMap<Element, Controller>()
/** Elements mounted before their section (children mount first); claimed when it mounts. */
const pending = new Map<HTMLElement, ClickSpec>()

function controllerOf(el: HTMLElement): Controller | undefined {
  const section = el.closest('.pm-section')
  return section ? controllers.get(section) : undefined
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
 * Tracks the click elements of a section and marks each `data-pm-click="shown|hidden"`
 * for the section's step. Returns a function that stops tracking.
 */
export function trackClicks(section: HTMLElement, layout: SectionLayout, step: Readonly<Ref<number>>): () => void {
  const specs = new Map<HTMLElement, ClickSpec>()
  const ranges = shallowRef(new Map<HTMLElement, ClickRange>())
  const resolve = () => {
    const ordered = [...specs.keys()].sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
    const resolved = resolveClicks(ordered.map(el => specs.get(el)!))
    ranges.value = new Map(ordered.map((el, i) => [el, resolved[i]!]))
  }
  controllers.set(section, {
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
    if (!section.contains(el)) continue
    pending.delete(el)
    specs.set(el, spec)
  }
  resolve()
  const stop = watchEffect(() => {
    for (const [el, range] of ranges.value) {
      el.dataset.pmClick = layout === 'scrolly' && !clickVisible(range, step.value) ? 'hidden' : 'shown'
    }
  })
  return () => {
    stop()
    controllers.delete(section)
  }
}

function clickDirective(kind: ClickSpec['kind'], hide = false): Directive<HTMLElement, unknown> {
  return {
    mounted(el, binding) {
      register(el, { kind, at: binding.value, hide: hide || Boolean(binding.modifiers.hide) })
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
