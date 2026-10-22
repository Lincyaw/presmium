import type { IRSection } from '@lincyaw/kernel'
import type { Ref } from 'vue'
import { computed, h, onBeforeUnmount, onMounted, provide } from 'vue'
import { BlockView } from '../block.ts'
import { listLayers } from '../registry.ts'
import { SECTION_CONTEXT } from '../section-context.ts'
import type { Viewer } from '../viewer-state.ts'

// The page stays mounted to preserve its scroll position; only the overlay is interactive.
export function useModal(root: Readonly<Ref<HTMLElement | undefined>>): void {
  const inert: Element[] = []
  onMounted(() => {
    const el = root.value?.closest('[data-pm-overlay-scope]')
    if (!el) return
    for (let node: Element = el; node.parentElement && node !== document.body; node = node.parentElement) {
      for (const sibling of node.parentElement.children) {
        if (sibling === node || sibling.hasAttribute('inert') || ['SCRIPT', 'STYLE', 'LINK'].includes(sibling.tagName)) continue
        sibling.setAttribute('inert', '')
        inert.push(sibling)
      }
    }
  })
  onBeforeUnmount(() => inert.splice(0).forEach(el => el.removeAttribute('inert')))
}

/** The props of the focus scope around an overlay view, which traps the focus and focuses the view's root. */
export function focusScope(root: Readonly<Ref<HTMLElement | undefined>>) {
  return { 'data-pm-overlay-scope': '', style: { display: 'contents' }, loop: true, trapped: true, onMountAutoFocus: (event: Event) => {
    event.preventDefault()
    root.value?.focus({ preventScroll: true })
  } }
}

/** Publishes the height of an overlay view's bar as `--pm-overlay-bar` while the view is mounted. */
export function useOverlayBar(bar: Readonly<Ref<HTMLElement | undefined>>): void {
  const root = () => document.documentElement.style
  let observer: ResizeObserver | undefined
  onMounted(() => {
    const el = bar.value
    if (!el) return
    const update = () => root().setProperty('--pm-overlay-bar', `${el.offsetHeight}px`)
    update()
    observer = new ResizeObserver(update)
    observer.observe(el)
  })
  onBeforeUnmount(() => {
    observer?.disconnect()
    root().removeProperty('--pm-overlay-bar')
  })
}

/** The section and step at the viewer's position, provided as the section context of the overlay view. */
export function useCurrentSection(viewer: Viewer, view: string) {
  const section = computed(() => viewer.section(viewer.position.value.section))
  const step = computed(() => viewer.position.value.step)
  provide(SECTION_CONTEXT, { section: section as Readonly<Ref<IRSection>>, step, view: computed(() => view) })
  return { section, step }
}

export function visuals(section: IRSection, step: number) {
  return section.blocks.filter(b => b.role === 'visual').map(block => h(BlockView, { key: `${section.id}/${block.id}`, block, section, step }))
}

export function button(label: string, onClick: () => void) {
  return h('button', { type: 'button', class: 'pm-present__button', onClick }, label)
}

export function layers(view: string, scope: 'view' | 'viewport') {
  return listLayers(view).filter(layer => (layer.scope ?? 'viewport') === scope).map(layer => h(layer.component, { key: layer.id, view }))
}
