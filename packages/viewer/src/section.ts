import { isChapterTitle, narrationAt } from '@presmium/kernel'
import type { IRBlock, IRSection } from '@presmium/kernel'
import type { InjectionKey, PropType, Ref, VNodeChild } from 'vue'
import { computed, defineComponent, h, inject, onBeforeUnmount, onMounted, provide, ref, shallowRef, toRef } from 'vue'
import { BlockView, isOverlay } from './block.ts'
import { SECTION_CONTEXT } from './context.ts'
import { FINAL_STEP, sectionDiagnostics, stepAtLine } from './domain/index.ts'
import type { Position } from './domain/index.ts'
import { messages } from './i18n.ts'
import { useViewer } from './viewer.ts'

/** `document`: every step at once; `scrolly`: content pinned on one side, the steps follow the narration as it scrolls. */
export type SectionLayout = 'document' | 'scrolly'

/** Share of the viewport height, from the top, that a step marker must pass to become current. */
export const STEP_LINE = 0.6

/**
 * Share of the viewport height, from the top, that a section's top must pass
 * to become the section read: a section whose heading is near the top of the
 * screen, rather than one whose start has reached the step line.
 */
const READ_LINE = 0.25

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
  /**
   * Remembers what is at the reading line: the step marker of a scrolly
   * section, else the block or the section there. The returned function
   * scrolls it back to the same place, e.g. after content above it changed.
   */
  hold(): () => void
  dispose(): void
}

export const PAGE_TRACKER: InjectionKey<PageTracker> = Symbol('presmium.viewer.page')

function markers(el: HTMLElement): HTMLElement[] {
  return [...el.querySelectorAll<HTMLElement>('.pm-step')]
}

/**
 * `report` gets the section read (the last one whose top has passed the
 * reading line, near the top of the screen), with its step when it is a
 * scrolly section. After `scrollTo` (an explicit navigation: a link to a
 * section, a view switch), nothing is reported until the reader scrolls, so
 * the target stays the section read even where the page cannot scroll it to
 * the top; until then, content that lays out late above it (components that
 * load in the browser, diagrams) does not push it away: it is scrolled to again.
 */
export function createPageTracker(report: (section: string, step?: number) => void, active: () => boolean): PageTracker {
  const tracked = new Set<Tracked>()
  let frame = 0
  let restoredY: number | undefined
  /** The target of the last `scrollTo`, while the reader has not scrolled since. */
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
      // Not scrolled since the last navigation: keep its target in place if content above it moved.
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
  /** Scrolls to a position on this page; false when its section is not here. */
  const place = (position: Position): boolean => {
    const section = [...tracked].find(s => s.id() === position.section)
    if (!section) return false
    const marker = section.layout() === 'scrolly'
      ? markers(section.el).filter(m => Number(m.dataset.step) <= position.step).at(-1)
      : undefined
    const top = marker
      // The marker of the step just passes the step line.
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
        // The reading position has not changed: nothing to report.
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

/**
 * The blocks of a section in the document layout: narration as body text,
 * each run of visual blocks (what the slide shows) together on a board.
 * Overlays (`ComponentNode.layer`), which draw over other content, stand
 * outside the boards, so a board never holds only them.
 */
function documentBlocks(section: IRSection, step: number): VNodeChild[] {
  const children: VNodeChild[] = []
  let board: IRBlock[] = []
  const flush = () => {
    if (board.length) children.push(h('div', { key: `board:${board[0]!.id}`, class: 'pm-board' }, blockViews(board, section, step, true)))
    board = []
  }
  for (const block of section.blocks) {
    if (block.role === 'visual' && !isOverlay(block)) {
      board.push(block)
      continue
    }
    if (block.role === 'narration') flush()
    children.push(h(BlockView, { key: block.id, block, section, step, expanded: true }))
  }
  flush()
  return children
}

/**
 * One section in a page view: its heading (the anchor of deep links; a
 * title for the cover and chapter titles, a section heading otherwise), its
 * blocks in the section's layout and compile diagnostics in a dev server.
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
      // A section with nothing to show on the stage (e.g. a chapter's opening words) reads as text.
      const body = layout === 'scrolly' && section.blocks.some(b => b.role === 'visual')
        ? [
            h('div', { class: 'pm-stage pm-board' }, blockViews(section.blocks.filter(b => b.role === 'visual'), section, current, false)),
            // A step without narration (a component's own step) takes less of the track.
            h('div', { class: 'pm-track' }, Array.from({ length: section.steps + 1 }, (_, k) => {
              const narration = narrationAt(section, k)
              return h('div', { 'key': k, 'class': ['pm-step', { 'pm-step--current': k === current, 'pm-step--bare': narration.length === 0 }], 'data-step': k }, blockViews(narration, section, current, false))
            })),
          ]
        : [h('div', { class: 'pm-section__body' }, documentBlocks(section, current))]
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
