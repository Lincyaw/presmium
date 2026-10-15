import type { IRBlock, IRSection } from '@presmium/kernel'
import type { InjectionKey, PropType, Ref, VNodeChild } from 'vue'
import { computed, defineComponent, h, inject, onBeforeUnmount, onMounted, provide, ref, shallowRef, toRef } from 'vue'
import { BlockView } from './block.ts'
import { SECTION_CONTEXT } from './context.ts'
import { FINAL_STEP, narrationAt, sectionDiagnostics, stepAtLine } from './domain/index.ts'
import type { Position } from './domain/index.ts'
import { useViewer } from './viewer.ts'

/** `document`: every step at once; `scrolly`: content pinned on one side, the steps follow the narration as it scrolls. */
export type SectionLayout = 'document' | 'scrolly'

/** Share of the viewport height, from the top, that a step marker must pass to become current. */
export const STEP_LINE = 0.6

interface Tracked {
  el: HTMLElement
  id(): string
  layout(): SectionLayout
  /** Scroll-driven step of a scrolly section. */
  step: Ref<number>
}

/** Follows the scrolling of the sections on a page: the reading section and the steps of scrolly sections. */
export interface PageTracker {
  add(section: Tracked): () => void
  /** Scrolls to a position; false when its section is not on this page. */
  scrollTo(position: Position): boolean
  dispose(): void
}

export const PAGE_TRACKER: InjectionKey<PageTracker> = Symbol('presmium.viewer.page')

function markers(el: HTMLElement): HTMLElement[] {
  return [...el.querySelectorAll<HTMLElement>('.pm-step')]
}

/**
 * `report` gets the section at the reading line, with its step when it is a
 * scrolly section. After `scrollTo`, nothing is reported until the reader
 * scrolls, so a restored position is not replaced by a nearby section.
 */
export function createPageTracker(report: (section: string, step?: number) => void, active: () => boolean): PageTracker {
  const tracked = new Set<Tracked>()
  let frame = 0
  let restoredY: number | undefined

  const update = () => {
    frame = 0
    const line = window.innerHeight * STEP_LINE
    let reading: { section: Tracked, top: number } | undefined
    let first: { section: Tracked, top: number } | undefined
    for (const section of tracked) {
      if (section.layout() === 'scrolly') {
        section.step.value = stepAtLine(markers(section.el).map(m => ({ step: Number(m.dataset.step), top: m.getBoundingClientRect().top })), line)
      }
      const top = section.el.getBoundingClientRect().top
      if (top <= line && (!reading || top > reading.top)) reading = { section, top }
      if (!first || top < first.top) first = { section, top }
    }
    if (!active() || (restoredY !== undefined && Math.abs(window.scrollY - restoredY) < 2)) return
    restoredY = undefined
    const current = (reading ?? first)?.section
    if (current) report(current.id(), current.layout() === 'scrolly' ? current.step.value : undefined)
  }
  const schedule = () => {
    frame ||= requestAnimationFrame(update)
  }
  const dispose = () => {
    cancelAnimationFrame(frame)
    frame = 0
    window.removeEventListener('scroll', schedule)
    window.removeEventListener('resize', schedule)
  }

  return {
    add(section) {
      if (tracked.size === 0) {
        window.addEventListener('scroll', schedule, { passive: true })
        window.addEventListener('resize', schedule)
      }
      tracked.add(section)
      schedule()
      return () => {
        tracked.delete(section)
        if (tracked.size === 0) dispose()
      }
    },
    scrollTo(position) {
      const section = [...tracked].find(s => s.id() === position.section)
      if (!section) return false
      const marker = section.layout() === 'scrolly'
        ? markers(section.el).filter(m => Number(m.dataset.step) <= position.step).at(-1)
        : undefined
      if (marker) {
        // The marker of the step just passes the reading line.
        const line = window.innerHeight * STEP_LINE
        window.scrollTo({ top: window.scrollY + marker.getBoundingClientRect().top - line + 1, behavior: 'instant' })
      } else {
        section.el.scrollIntoView({ block: 'start', behavior: 'instant' })
      }
      restoredY = window.scrollY
      schedule()
      return true
    },
    dispose,
  }
}

function blockViews(blocks: IRBlock[], section: IRSection, step: number, expanded: boolean): VNodeChild[] {
  return blocks.map(block => h(BlockView, { key: block.id, block, section, step, expanded }))
}

/**
 * One section in a page view: its heading (the anchor of deep links), its
 * blocks in the section's layout, compile diagnostics in a dev server, and
 * links to the previous and next section.
 */
export const SectionView = defineComponent({
  name: 'PmSectionView',
  props: {
    section: { type: Object as PropType<IRSection>, required: true },
    layout: { type: String as PropType<SectionLayout>, default: 'document' },
  },
  setup(props) {
    const viewer = useViewer()
    const tracker = inject(PAGE_TRACKER, undefined)
    const el = shallowRef<HTMLElement>()
    const scrolled = ref(0)
    const step = computed(() => (props.layout === 'scrolly' ? scrolled.value : FINAL_STEP))
    provide(SECTION_CONTEXT, { section: toRef(props, 'section'), step })

    let untrack: (() => void) | undefined
    onMounted(() => {
      if (!el.value || !tracker) return
      untrack = tracker.add({ el: el.value, id: () => props.section.id, layout: () => props.layout, step: scrolled })
    })
    onBeforeUnmount(() => untrack?.())

    const neighbours = computed(() => {
      const { sections } = viewer.doc.value
      const i = sections.findIndex(s => s.id === props.section.id)
      return { prev: sections[i - 1], next: sections[i + 1] }
    })
    const href = (id: string) => viewer.options.sectionHref?.(id) ?? `#${id}`

    return () => {
      const { section, layout } = props
      const current = step.value
      const problems = viewer.options.diagnostics ? sectionDiagnostics(section, viewer.doc.value.diagnostics) : []
      const body = layout === 'scrolly'
        ? [
            h('div', { class: 'pm-stage' }, blockViews(section.blocks.filter(b => b.role === 'visual'), section, current, false)),
            h('div', { class: 'pm-track' }, Array.from({ length: section.steps + 1 }, (_, k) =>
              h('div', { 'key': k, 'class': ['pm-step', { 'pm-step--current': k === current }], 'data-step': k }, blockViews(narrationAt(section, k), section, current, false)))),
          ]
        : [h('div', { class: 'pm-section__body' }, blockViews(section.blocks, section, current, true))]
      const { prev, next } = neighbours.value
      return h('section', {
        'ref': el,
        'class': ['pm-section', `pm-section--${layout}`, { 'pm-section--error': problems.some(p => p.severity === 'error') }],
        'data-section': section.id,
        'data-index': section.index,
        'data-step': layout === 'scrolly' ? current : undefined,
      }, [
        h('h2', { id: section.id, class: 'pm-section__title', tabindex: -1 }, [
          section.title,
          h('a', { 'class': 'header-anchor', 'href': `#${section.id}`, 'aria-label': `链接到“${section.title}”` }, '​'),
        ]),
        problems.length
          ? h('ul', { class: 'pm-diagnostics', role: 'alert' }, problems.map((p, i) => h('li', { 'key': i, 'data-severity': p.severity }, `${p.severity}: ${p.message}`)))
          : null,
        ...body,
        h('nav', { 'class': 'pm-section-nav', 'aria-label': '章节导航' }, [
          prev ? h('a', { class: 'pm-section-nav__prev', href: href(prev.id), rel: 'prev' }, [h('span', '上一节'), h('strong', prev.title)]) : h('span'),
          next ? h('a', { class: 'pm-section-nav__next', href: href(next.id), rel: 'next' }, [h('span', '下一节'), h('strong', next.title)]) : h('span'),
        ]),
        viewer.options.sectionFooter?.(section, current) ?? null,
      ])
    }
  },
})
