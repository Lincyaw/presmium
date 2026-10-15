/**
 * The present view (P-77): full screen, one section at a time, step by step,
 * driven by the keyboard; and the presenter window, which shows the narration
 * of the current step, a preview of the next one and a timer. Windows of the
 * same document in these views follow each other (see `createViewer`).
 * Keys run the named actions of the registry (K-15); plugins add their own,
 * and layers drawn over the views.
 */
import type { IRSection } from '@presmium/kernel'
import type { Ref } from 'vue'
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, provide, ref, shallowRef, watch } from 'vue'
import { BlockView } from './block.ts'
import { SECTION_CONTEXT } from './context.ts'
import { blockText, narrationAt, nextPosition } from './domain/index.ts'
import { messages } from './i18n.ts'
import { listActions, listLayers } from './registry.ts'
import type { ViewerAction } from './registry.ts'
import { useViewer } from './viewer.ts'
import type { Viewer } from './viewer.ts'

/** Whether the overview of the present view is open; one present view shows at a time. */
const overview = ref(false)

/** The built-in actions: navigation in both views; leaving, the presenter window and the overview in the present view. */
export const BUILTIN_ACTIONS: readonly ViewerAction[] = [
  { id: 'next', keys: ['ArrowRight', 'ArrowDown', 'PageDown', ' '], run: (viewer) => { viewer.next() } },
  { id: 'prev', keys: ['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'], run: (viewer) => { viewer.prev() } },
  { id: 'first', keys: ['Home'], run: viewer => viewer.go({ section: viewer.doc.value.sections[0]?.id ?? '', step: 0 }) },
  { id: 'last', keys: ['End'], run: viewer => viewer.go({ section: viewer.doc.value.sections.at(-1)?.id ?? '', step: Number.POSITIVE_INFINITY }) },
  { id: 'exit', keys: ['Escape'], views: ['present'], run: viewer => viewer.setView(viewer.pageView.value) },
  {
    id: 'presenter',
    keys: ['p'],
    views: ['present'],
    run: viewer => viewer.options.openPresenter ? viewer.options.openPresenter(viewer.position.value) : false,
  },
  { id: 'overview', keys: ['o'], views: ['present'], run: () => { overview.value = !overview.value } },
]

function typing(target: EventTarget | null): boolean {
  return Boolean((target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable]'))
}

/** Keys while the view is shown: the first action of the view bound to the key runs. */
function useActions(viewer: Viewer, view: string): void {
  const onKey = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || typing(event.target)) return
    for (const action of listActions(view)) {
      if (!action.keys.includes(event.key) || action.run(viewer) === false) continue
      event.preventDefault()
      return
    }
  }
  onMounted(() => {
    window.addEventListener('keydown', onKey)
    document.documentElement.classList.add('pm-presenting')
  })
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKey)
    document.documentElement.classList.remove('pm-presenting')
  })
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'

function focusables(within: readonly Element[]): HTMLElement[] {
  return within
    .flatMap(el => [...el.querySelectorAll<HTMLElement>(FOCUSABLE)])
    .filter(el => !el.closest('[inert]') && (el.checkVisibility ? el.checkVisibility({ visibilityProperty: true }) : el.getClientRects().length > 0))
    .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
}

/**
 * An overlay view is modal (N-06): the page under it is inert, and Tab cycles
 * through the view and what is drawn over it (fixed elements with a higher
 * z-index, such as the presenter panels or a classroom badge). Leaving it
 * gives the focus back to the control that opened it, e.g. the view menu.
 */
function useModal(root: Readonly<Ref<HTMLElement | undefined>>): void {
  let opener: Element | null = null
  let above: Element[] = []
  const inert: Element[] = []
  const onTab = (event: KeyboardEvent) => {
    if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey || !root.value) return
    const items = focusables([root.value, ...above])
    const active = document.activeElement as HTMLElement | null
    const at = active ? items.indexOf(active) : -1
    const target = event.shiftKey
      ? (at <= 0 ? items.at(-1) : undefined)
      : (at === -1 || at === items.length - 1 ? items[0] : undefined)
    if (!items.length || target) {
      event.preventDefault()
      target?.focus()
    }
  }
  onMounted(() => {
    opener = document.activeElement
    const el = root.value
    if (!el) return
    const z = Number(getComputedStyle(el).zIndex) || 0
    const isAbove = (other: Element) => {
      const style = getComputedStyle(other)
      return style.position === 'fixed' && (Number(style.zIndex) || 0) > z
    }
    for (let node: Element = el; node.parentElement && node !== document.body; node = node.parentElement) {
      for (const sibling of node.parentElement.children) {
        if (sibling === node || sibling.hasAttribute('inert') || ['SCRIPT', 'STYLE', 'LINK'].includes(sibling.tagName)) continue
        if (isAbove(sibling)) {
          above.push(sibling)
          continue
        }
        sibling.setAttribute('inert', '')
        inert.push(sibling)
      }
    }
    document.addEventListener('keydown', onTab)
  })
  onBeforeUnmount(() => {
    document.removeEventListener('keydown', onTab)
    inert.splice(0).forEach(el => el.removeAttribute('inert'))
    above = []
    if (opener instanceof HTMLElement && opener.isConnected && opener !== document.body) opener.focus({ preventScroll: true })
  })
}

/**
 * Fits the content of a slide to its frame (N-05): content taller than the
 * frame is scaled down, as a slide is, so nothing is cut off at any screen
 * size. Hidden steps keep their place, so the scale is the same at every step.
 * The scaled content's box gets the scaled height, so the frame never overflows.
 */
function useFit(frame: Readonly<Ref<HTMLElement | undefined>>, content: Readonly<Ref<HTMLElement | undefined>>) {
  const fitted = ref<{ scale: number, height: number }>()
  const fit = () => {
    const [outer, inner] = [frame.value, content.value]
    if (!outer || !inner) return
    const style = getComputedStyle(outer)
    const available = outer.clientHeight - Number.parseFloat(style.paddingTop) - Number.parseFloat(style.paddingBottom) - 1
    // The layout height: a transform does not change it.
    const natural = inner.offsetHeight
    const next = natural > available && available > 0 ? { scale: available / natural, height: available } : undefined
    if (next?.scale !== fitted.value?.scale || next?.height !== fitted.value?.height) fitted.value = next
  }
  let observer: ResizeObserver | undefined
  onMounted(() => {
    observer = new ResizeObserver(fit)
    if (frame.value) observer.observe(frame.value)
  })
  watch(content, (el, old) => {
    if (old) observer?.unobserve(old)
    if (el) observer?.observe(el)
  }, { flush: 'post' })
  onBeforeUnmount(() => observer?.disconnect())
  return fitted
}

/** The current section and step, given to the components inside as `SECTION_CONTEXT`. */
function useCurrent(viewer: Viewer) {
  const section = computed(() => viewer.section(viewer.position.value.section))
  const step = computed(() => viewer.position.value.step)
  // Rendered only while the section exists.
  provide(SECTION_CONTEXT, { section: section as Readonly<Ref<IRSection>>, step })
  return { section, step }
}

function visuals(section: IRSection, step: number) {
  return section.blocks.filter(b => b.role === 'visual').map(block => h(BlockView, { key: `${section.id}/${block.id}`, block, section, step }))
}

function button(label: string, onClick: () => void) {
  return h('button', { type: 'button', class: 'pm-present__button', onClick }, label)
}

function layers(view: string) {
  return listLayers(view).map(layer => h(layer.component, { key: layer.id, view }))
}

/** Moves the focus among the overview's sections with the arrow keys, Home and End; returns whether it handled the key. */
function moveInOverview(root: HTMLElement | undefined, key: string): boolean {
  const items = [...root?.querySelectorAll<HTMLElement>('.pm-overview__item') ?? []]
  if (!items.length) return false
  const at = Math.max(items.indexOf(document.activeElement as HTMLElement), 0)
  const columns = items.filter(item => item.offsetTop === items[0]!.offsetTop).length
  const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns, Home: -at, End: items.length }
  if (!(key in moves)) return false
  items[Math.min(Math.max(at + moves[key]!, 0), items.length - 1)]!.focus()
  return true
}

export const PresentView = defineComponent({
  name: 'PmPresentView',
  setup() {
    const viewer = useViewer()
    const { section, step } = useCurrent(viewer)
    const root = shallowRef<HTMLElement>()
    const frame = shallowRef<HTMLElement>()
    const content = shallowRef<HTMLElement>()
    const fitted = useFit(frame, content)
    overview.value = false
    const closeOverview = () => {
      overview.value = false
      root.value?.focus()
    }
    useActions(viewer, 'present')
    // While the overview is open, keys move through it instead of running actions; Enter picks a section.
    const onOverviewKey = (event: KeyboardEvent) => {
      if (!overview.value || event.key === 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return
      event.stopImmediatePropagation()
      if (event.key === 'Escape' || event.key === 'o') closeOverview()
      else if (!moveInOverview(root.value, event.key)) return
      event.preventDefault()
    }
    useModal(root)
    onMounted(() => {
      window.addEventListener('keydown', onOverviewKey, { capture: true })
      root.value?.focus()
    })
    onBeforeUnmount(() => {
      window.removeEventListener('keydown', onOverviewKey, { capture: true })
      overview.value = false
    })
    watch(overview, async (open) => {
      if (!open) return
      await nextTick()
      root.value?.querySelector<HTMLElement>('.pm-overview__item[aria-current="true"]')?.focus()
    })
    const jump = (id: string) => {
      viewer.go({ section: id, step: 0 })
      closeOverview()
    }

    return () => {
      const current = section.value
      if (!current) return null
      const t = messages()
      const { sections } = viewer.doc.value
      return h('div', {
        'ref': root,
        'class': 'pm-present',
        'role': 'region',
        'aria-label': t.present.region,
        'tabindex': -1,
        'data-section': current.id,
        'data-step': step.value,
      }, [
        h('div', { ref: frame, class: 'pm-present__slide' }, [
          // Scaled, the content's box is as tall as it shows and clips the content's unscaled layout box.
          h('div', { class: 'pm-present__fit', style: fitted.value ? { height: `${fitted.value.height}px`, overflow: 'clip' } : undefined }, h('div', {
            key: current.id,
            ref: content,
            class: 'pm-present__content',
            style: fitted.value ? { transform: `scale(${fitted.value.scale})` } : undefined,
          }, [
            h('h1', { class: 'pm-present__title' }, current.title),
            ...visuals(current, step.value),
          ])),
          // The overview lies over the slide, which keeps its state underneath.
          overview.value
            ? h('div', { 'class': 'pm-overview', 'role': 'dialog', 'aria-label': t.present.overview }, h('ol', { class: 'pm-overview__grid' }, sections.map(s => h('li', { key: s.id }, h('button', {
                'type': 'button',
                'class': 'pm-overview__item',
                'data-section': s.id,
                'aria-current': s.id === current.id ? 'true' : undefined,
                'onClick': () => jump(s.id),
              }, [h('span', { class: 'pm-overview__index' }, String(s.index)), h('span', { class: 'pm-overview__title' }, s.title)])))))
            : null,
        ]),
        h('div', { class: 'pm-present__bar' }, [
          h('span', { class: 'pm-present__counter' }, t.present.counter(current.index, sections.length, step.value, current.steps)),
          button(t.present.prev, () => viewer.prev()),
          button(t.present.next, () => viewer.next()),
          button(t.present.overview, () => overview.value = !overview.value),
          viewer.options.openPresenter ? button(t.present.presenter, () => viewer.options.openPresenter!(viewer.position.value)) : null,
          button(t.present.fullscreen, () => void root.value?.requestFullscreen?.().catch(() => {})),
          button(t.present.exit, () => viewer.setView(viewer.pageView.value)),
        ]),
        ...layers('present'),
      ])
    }
  },
})

function clock(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export const PresenterView = defineComponent({
  name: 'PmPresenterView',
  setup() {
    const viewer = useViewer()
    const { section, step } = useCurrent(viewer)
    const root = shallowRef<HTMLElement>()
    useActions(viewer, 'presenter')
    useModal(root)
    const started = ref(Date.now())
    const now = ref(Date.now())
    let timer: ReturnType<typeof setInterval> | undefined
    onMounted(() => {
      timer = setInterval(() => now.value = Date.now(), 1000)
    })
    onBeforeUnmount(() => clearInterval(timer))

    /** What comes next: the narration of the next step, or the next section. */
    const upcoming = computed(() => {
      const t = messages()
      const next = nextPosition(viewer.doc.value, viewer.position.value)
      if (!next) return t.presenter.end
      const target = viewer.section(next.section)!
      if (next.section !== section.value?.id) return t.presenter.nextSection(target.title)
      return narrationAt(target, next.step).map(blockText).join('\n') || t.presenter.nextStep(next.step)
    })

    return () => {
      const current = section.value
      if (!current) return null
      const t = messages()
      const notes = current.blocks.filter(b => b.role === 'narration')
      return h('div', { 'ref': root, 'class': 'pm-presenter', 'data-section': current.id, 'data-step': step.value }, [
        h('div', { class: 'pm-presenter__bar' }, [
          h('strong', { class: 'pm-presenter__title' }, `${current.index}. ${current.title}`),
          h('span', { class: 'pm-presenter__counter' }, t.presenter.step(step.value, current.steps)),
          h('span', { 'class': 'pm-presenter__timer', 'aria-label': t.presenter.timer }, clock(now.value - started.value)),
          button(t.presenter.restart, () => started.value = now.value = Date.now()),
          button(t.present.prev, () => viewer.prev()),
          button(t.present.next, () => viewer.next()),
        ]),
        h('div', { class: 'pm-presenter__main' }, [
          h('div', { key: current.id, class: 'pm-presenter__slide' }, visuals(current, step.value)),
          h('div', { class: 'pm-presenter__side' }, [
            h('p', { class: 'pm-presenter__label' }, t.presenter.notes),
            h('div', { class: 'pm-presenter__notes' }, notes.length
              ? notes.map(block => h('div', {
                  'key': block.id,
                  'class': ['pm-presenter__note', { 'pm-current': block.at === step.value }],
                  'data-step': block.at,
                  'aria-current': block.at === step.value ? 'step' : undefined,
                }, [h(BlockView, { block, section: current, step: step.value, expanded: true })]))
              : [h('p', { class: 'pm-presenter__empty' }, t.presenter.noNotes)]),
            h('p', { class: 'pm-presenter__label' }, t.presenter.upcoming),
            h('p', { class: 'pm-presenter__next' }, upcoming.value),
          ]),
        ]),
        ...layers('presenter'),
      ])
    }
  },
})
