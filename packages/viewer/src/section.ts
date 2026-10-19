import { isChapterTitle, narrationAt } from '@presmium/kernel'
import type { IRBlock, IRSection } from '@presmium/kernel'
import type { InjectionKey, PropType, Ref, VNodeChild } from 'vue'
import { computed, defineComponent, h, inject, onBeforeUnmount, onMounted, provide, ref, shallowRef, toRef } from 'vue'
import { BlockView } from './block.ts'
import { SECTION_CONTEXT } from './context.ts'
import { FINAL_STEP, sectionDiagnostics, stepAtLine } from './domain/index.ts'
import type { Position } from './domain/index.ts'
import { messages } from './i18n.ts'
import { useViewer } from './viewer.ts'

export type SectionLayout = 'document' | 'scrolly'

export const STEP_LINE = 0.6

const READ_LINE = 0.25

interface Tracked {
  el: HTMLElement
  id(): string
  layout(): SectionLayout
  step: Ref<number>
}

export interface PageTracker {
  add(section: Tracked): () => void
  scrollTo(position: Position): boolean
  hold(): () => void
  dispose(): void
}

export const PAGE_TRACKER: InjectionKey<PageTracker> = Symbol('presmium.viewer.page')

function markers(el: HTMLElement): HTMLElement[] {
  return [...el.querySelectorAll<HTMLElement>('.pm-step')]
}

export function createPageTracker(report: (section: string, step?: number) => void, active: () => boolean): PageTracker {
  const tracked = new Set<Tracked>()
  let frame = 0
  let restoredY: number | undefined
  let pinned: Position | undefined
  const resized = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => schedule())
  const scrolled = () => restoredY !== undefined && Math.abs(window.scrollY - restoredY) >= 2

  const update = () => {
    frame = 0
    const steps = window.innerHeight * STEP_LINE
    const line = window.innerHeight * READ_LINE
    let reading: { section: Tracked, top: number } | undefined
    let first: { section: Tracked, top: number } | undefined
    for (const section of tracked) {
      if (section.layout() === 'scrolly') {
        section.step.value = stepAtLine(markers(section.el).map(m => ({ step: Number(m.dataset.step), top: m.getBoundingClientRect().top })), steps)
      }
      const top = section.el.getBoundingClientRect().top
      if (top <= line && (!reading || top > reading.top)) reading = { section, top }
      if (!first || top < first.top) first = { section, top }
    }
    if (restoredY !== undefined && !scrolled()) {
      if (pinned) place(pinned)
      return
    }
    restoredY = undefined
    pinned = undefined
    if (!active()) return
    const current = (reading ?? first)?.section
    if (current) report(current.id(), current.layout() === 'scrolly' ? current.step.value : undefined)
  }
  const schedule = () => {
    frame ||= requestAnimationFrame(update)
  }
  const place = (position: Position): boolean => {
    const section = [...tracked].find(s => s.id() === position.section)
    if (!section) return false
    const marker = section.layout() === 'scrolly'
      ? markers(section.el).filter(m => Number(m.dataset.step) <= position.step).at(-1)
      : undefined
    const top = marker
      ? window.scrollY + marker.getBoundingClientRect().top - window.innerHeight * STEP_LINE + 1
      : window.scrollY + section.el.getBoundingClientRect().top - Number.parseFloat(getComputedStyle(section.el).scrollMarginTop || '0')
    if (Math.abs(window.scrollY - Math.max(top, 0)) >= 1) window.scrollTo({ top, behavior: 'instant' })
    restoredY = window.scrollY
    return true
  }
  const dispose = () => {
    cancelAnimationFrame(frame)
    frame = 0
    resized?.disconnect()
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
      resized?.observe(section.el)
      schedule()
      return () => {
        tracked.delete(section)
        resized?.unobserve(section.el)
        if (tracked.size === 0) dispose()
      }
    },
    hold() {
      const line = window.innerHeight * STEP_LINE
      let reading: { section: Tracked, top: number } | undefined
      for (const section of tracked) {
        const top = section.el.getBoundingClientRect().top
        if (top <= line && (!reading || top > reading.top)) reading = { section, top }
      }
      if (!reading) return () => {}
      const { el } = reading.section
      const above = (candidates: HTMLElement[]) => candidates.filter(c => c.getBoundingClientRect().top <= line).at(-1)
      const anchor = reading.section.layout() === 'scrolly'
        ? above(markers(el)) ?? el
        : [...el.querySelectorAll<HTMLElement>('.pm-block')].find(b => b.getBoundingClientRect().top <= line && b.getBoundingClientRect().bottom > line) ?? el
      const top = anchor.getBoundingClientRect().top
      return () => {
        const moved = anchor.isConnected ? anchor.getBoundingClientRect().top - top : 0
        if (Math.abs(moved) < 1) return
        window.scrollBy({ top: moved, behavior: 'instant' })
        restoredY = window.scrollY
        schedule()
      }
    },
    scrollTo(position) {
      if (!place(position)) return false
      pinned = position
      schedule()
      return true
    },
    dispose,
  }
}

function blockViews(blocks: IRBlock[], section: IRSection, step: number, expanded: boolean): VNodeChild[] {
  return blocks.map(block => h(BlockView, { key: block.id, block, section, step, expanded }))
}


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
    provide(SECTION_CONTEXT, { section: toRef(props, 'section'), step, view: viewer.pageView })

    let untrack: (() => void) | undefined
    onMounted(() => {
      if (!el.value || !tracker) return
      untrack = tracker.add({ el: el.value, id: () => props.section.id, layout: () => props.layout, step: scrolled })
    })
    onBeforeUnmount(() => untrack?.())

    const heading = computed(() => (isChapterTitle(viewer.doc.value, props.section) ? 'h1' : 'h2'))

    return () => {
      const { section, layout } = props
      const t = messages().section
      const current = step.value
      const problems = viewer.options.diagnostics ? sectionDiagnostics(section, viewer.doc.value.diagnostics) : []
      const body = layout === 'scrolly' && section.blocks.some(b => b.role === 'visual')
        ? [
            h('div', { class: 'pm-stage pm-board' }, blockViews(section.blocks.filter(b => b.role === 'visual'), section, current, false)),
            h('div', { class: 'pm-track' }, Array.from({ length: section.steps + 1 }, (_, k) => {
              const narration = narrationAt(section, k)
              return h('div', { 'key': k, 'class': ['pm-step', { 'pm-step--current': k === current, 'pm-step--bare': narration.length === 0 }], 'data-step': k }, blockViews(narration, section, current, false))
            })),
          ]
        : [h('div', { class: 'pm-section__body' }, blockViews(section.blocks, section, current, true))]
      return h('section', {
        'ref': el,
        'class': ['pm-section', `pm-section--${layout}`, { 'pm-section--error': problems.some(p => p.severity === 'error') }],
        'data-section': section.id,
        'data-index': section.index,
        'data-step': layout === 'scrolly' ? current : undefined,
      }, [
        h(heading.value, { id: section.id, class: 'pm-section__title', tabindex: -1 }, [
          section.title,
          viewer.options.sectionHeading?.(section, current) ?? null,
          h('a', { 'class': 'header-anchor', 'href': `#${section.id}`, 'aria-label': t.anchor(section.title) }, '​'),
        ]),
        viewer.options.openSource
          ? h('p', { class: 'pm-section__source' }, h('button', {
              type: 'button',
              title: t.sourceTitle(`${section.source.file}:${section.source.line}`),
              onClick: () => viewer.options.openSource!(section.source),
            }, t.openSource))
          : null,
        problems.length
          ? h('ul', { class: 'pm-diagnostics', role: 'alert' }, problems.map((p, i) => h('li', { 'key': i, 'data-severity': p.severity }, `${p.severity}: ${p.message}`)))
          : null,
        ...body,
      ])
    }
  },
})
