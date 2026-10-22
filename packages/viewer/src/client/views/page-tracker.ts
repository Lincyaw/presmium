import type { InjectionKey, Ref } from 'vue'
import { stepAtLine } from '../../domain/index.ts'
import type { Position } from '../../domain/index.ts'
import type { SectionLayout } from '../section.ts'

/** The share of the window's height at which a scrollytelling section moves to its next step. */
const STEP_LINE = 0.6

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

/** Tracks the sections on a page as it scrolls: reports the one being read and its step, and scrolls back to a position. */
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
      if (pinned) alignTo(pinned)
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
  const alignTo = (position: Position): boolean => {
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
      if (!alignTo(position)) return false
      pinned = position
      schedule()
      return true
    },
    dispose,
  }
}
