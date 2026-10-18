import { FocusScope } from 'reka-ui'
import { PmApprovals } from '@presmium/host'
import { blockText, sectionNarration } from '@presmium/kernel'
import type { IRSection } from '@presmium/kernel'
import type { Ref } from 'vue'
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, provide, ref, shallowRef, watch } from 'vue'
import { BlockView } from './block.ts'
import { SECTION_CONTEXT } from './context.ts'
import { nextPosition } from './domain/index.ts'
import { messages } from './i18n.ts'
import { listActions, listLayers } from './registry.ts'
import type { ViewerAction } from './registry.ts'
import { useViewer } from './viewer.ts'
import type { Viewer } from './viewer.ts'

const overview = ref(false)

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
  return Boolean((target as HTMLElement | null)?.closest?.('input, textarea, select, [contenteditable], [role="dialog"], [role="menu"], [role="tablist"], [role="slider"]'))
}

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

// The page stays mounted to preserve its scroll position; only the overlay is interactive.
function useModal(root: Readonly<Ref<HTMLElement | undefined>>): void {
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

function focusScope(root: Readonly<Ref<HTMLElement | undefined>>) {
  return { 'data-pm-overlay-scope': '', style: { display: 'contents' }, loop: true, trapped: true, onMountAutoFocus: (event: Event) => {
    event.preventDefault()
    root.value?.focus({ preventScroll: true })
  } }
}

interface Fitted {
  width?: number
  scale: number
  height: number
  shift: number
}

function useFit(frame: Readonly<Ref<HTMLElement | undefined>>, content: Readonly<Ref<HTMLElement | undefined>>) {
  const fitted = ref<Fitted>()
  const fit = () => {
    const [outer, inner] = [frame.value, content.value]
    if (!outer || !inner) return
    const style = getComputedStyle(outer)
    const available = {
      height: outer.clientHeight - Number.parseFloat(style.paddingTop) - Number.parseFloat(style.paddingBottom) - 1,
      width: outer.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight),
    }
    if (available.height <= 0 || available.width <= 0) return
    inner.style.width = ''
    const wide = Math.max(0, ...[...inner.querySelectorAll<HTMLElement>('pre, table, .pm-block, .pm-mermaid, .pm-math--display')].map(el => el.scrollWidth - el.clientWidth))
    const width = available.width + wide
    if (wide > 0) inner.style.width = `${width}px`
    const natural = inner.offsetHeight
    const scale = Math.min(1, available.width / width, available.height / natural)
    const next = scale < 1 ? { width: wide > 0 ? width : undefined, scale, height: natural * scale, shift: (available.width - width * scale) / 2 } : undefined
    if (JSON.stringify(next) !== JSON.stringify(fitted.value)) fitted.value = next
    else if (next?.width) inner.style.width = `${next.width}px`
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

function useOverlayBar(bar: Readonly<Ref<HTMLElement | undefined>>): void {
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

function useCurrent(viewer: Viewer, view: string) {
  const section = computed(() => viewer.section(viewer.position.value.section))
  const step = computed(() => viewer.position.value.step)
  provide(SECTION_CONTEXT, { section: section as Readonly<Ref<IRSection>>, step, view: computed(() => view) })
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
    const { section, step } = useCurrent(viewer, 'present')
    const root = shallowRef<HTMLElement>()
    const frame = shallowRef<HTMLElement>()
    const content = shallowRef<HTMLElement>()
    const bar = shallowRef<HTMLElement>()
    const fitted = useFit(frame, content)
    useOverlayBar(bar)
    overview.value = false
    const closeOverview = () => {
      overview.value = false
      root.value?.focus()
    }
    useActions(viewer, 'present')
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
      return h(FocusScope, focusScope(root), () => [h('div', {
        'ref': root,
        'class': 'pm-present',
        'role': 'region',
        'aria-label': t.present.region,
        'tabindex': -1,
        'data-section': current.id,
        'data-step': step.value,
      }, [
        h('div', { ref: frame, class: 'pm-present__slide' }, [
          h('div', { class: 'pm-present__fit', style: fitted.value ? { height: `${fitted.value.height}px`, overflow: 'clip' } : undefined }, h('div', {
            key: current.id,
            ref: content,
            class: 'pm-present__content',
            style: fitted.value
              ? { width: fitted.value.width ? `${fitted.value.width}px` : undefined, transform: `translateX(${fitted.value.shift}px) scale(${fitted.value.scale})` }
              : undefined,
          }, [
            h('h1', { class: 'pm-present__title' }, current.title),
            ...visuals(current, step.value),
          ])),
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
        h('div', { ref: bar, class: 'pm-present__bar' }, [
          h('span', { class: 'pm-present__counter' }, t.present.counter(current.index, sections.length, step.value, current.steps)),
          button(t.present.prev, () => viewer.prev()),
          button(t.present.next, () => viewer.next()),
          button(t.present.overview, () => overview.value = !overview.value),
          viewer.options.openPresenter ? button(t.present.presenter, () => viewer.options.openPresenter!(viewer.position.value)) : null,
          button(t.present.fullscreen, () => void root.value?.requestFullscreen?.().catch(() => {})),
          button(t.present.exit, () => viewer.setView(viewer.pageView.value)),
          h(PmApprovals, { placement: 'above' }),
        ]),
      ]), ...layers('present')])
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
    const { section, step } = useCurrent(viewer, 'presenter')
    const root = shallowRef<HTMLElement>()
    const bar = shallowRef<HTMLElement>()
    useActions(viewer, 'presenter')
    useOverlayBar(bar)
    useModal(root)
    const started = ref(Date.now())
    const now = ref(Date.now())
    let timer: ReturnType<typeof setInterval> | undefined
    onMounted(() => {
      timer = setInterval(() => now.value = Date.now(), 1000)
    })
    onBeforeUnmount(() => clearInterval(timer))

    const upcoming = computed(() => {
      const t = messages()
      const next = nextPosition(viewer.doc.value, viewer.position.value)
      if (!next) return t.presenter.end
      const target = viewer.section(next.section)!
      if (next.section !== section.value?.id) return t.presenter.nextSection(target.title)
      return sectionNarration(target).filter(block => block.at === next.step).map(blockText).join('\n') || t.presenter.nextStep(next.step)
    })

    return () => {
      const current = section.value
      if (!current) return null
      const t = messages()
      const notes = sectionNarration(current)
      return h(FocusScope, focusScope(root), () => [h('div', { 'ref': root, 'tabindex': -1, 'class': 'pm-presenter', 'data-section': current.id, 'data-step': step.value }, [
        h('div', { ref: bar, class: 'pm-presenter__bar' }, [
          h('strong', { class: 'pm-presenter__title' }, `${current.index}. ${current.title}`),
          current.steps > 0 ? h('span', { class: 'pm-presenter__counter' }, t.presenter.step(step.value, current.steps)) : null,
          h('span', { 'class': 'pm-presenter__timer', 'aria-label': t.presenter.timer }, clock(now.value - started.value)),
          button(t.presenter.restart, () => started.value = now.value = Date.now()),
          button(t.present.prev, () => viewer.prev()),
          button(t.present.next, () => viewer.next()),
          h(PmApprovals),
        ]),
        h('div', { class: 'pm-presenter__main' }, [
          h('div', { key: current.id, class: 'pm-presenter__slide' }, [h('h1', { class: 'pm-present__title' }, current.title), ...visuals(current, step.value)]),
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
      ]), ...layers('presenter')])
    }
  },
})
