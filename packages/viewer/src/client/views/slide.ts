import { createStore, HostProvider, useHost, useMessages, useStore } from '@lincyaw/host'
import { CAPTURE_PARAM, slideChapters, slideShape, VIDEO_EXPORT_PARAM } from '@lincyaw/kernel'
import type { IRDocument, IRSection, SlideShape } from '@lincyaw/kernel'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { SECTION_CONTEXT } from '../section-context.ts'
import { viewerMessages } from '../viewer-messages.ts'
import { useViewer } from '../viewer-state.ts'
import { h } from '../element.ts'
import { BLOCK_CLASS } from '../slidev-compat/click-directives.ts'
import { layers, visuals } from './overlay.ts'
import './slide.css'
const MESSAGES = { 'zh-CN': { steps: (at: number, of: number) => `第 ${at} 步，共 ${of} 步`, more: '向下滚动查看更多' }, en: { steps: (at: number, of: number) => `Step ${at} of ${of}`, more: 'Scroll for more' } }
const LAYOUTS = new Set(['default', 'cover', 'center', 'full'])
function slideOptions(section: IRSection, cover: boolean) { const hints = section.hints.slides ?? {}; const zoom = Number(hints.zoom); return { layout: typeof hints.layout === 'string' && LAYOUTS.has(hints.layout) ? hints.layout : cover ? 'cover' : 'default', className: typeof hints.class === 'string' ? hints.class : undefined, zoom: Number.isFinite(zoom) && zoom > 0 ? zoom : undefined } }
export function useSlides() { const viewer = useViewer(); const doc = useStore(viewer.doc); return { viewer, shape: slideShape(doc), chapters: slideChapters(doc) } }
export function SlideFit({ shape, scale: fixed, children, overlay }: { shape: SlideShape, scale?: number, children?: ReactNode, overlay?: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ width: number, height: number }>()
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry!.contentRect.width, height: entry!.contentRect.height }))
    if (box.current) observer.observe(box.current)
    return () => observer.disconnect()
  }, [])
  const { width, height } = shape
  const scale = fixed ?? (size ? Math.min(size.width / width, size.height / height) : 1)
  const left = size && fixed === undefined ? (size.width - width * scale) / 2 : 0
  const top = size && fixed === undefined ? (size.height - height * scale) / 2 : 0
  return h('div', { ref: box, className: 'pm-slide-fit' }, [
    h('div', { className: 'pm-slide-fit__canvas', style: { width: `${width}px`, height: `${height}px`, transform: `translate(${left}px, ${top}px) scale(${scale})` } }, children),
    // Captions follow the canvas bounds without shrinking their text with the slide.
    overlay ? h('div', { className: 'pm-slide-fit__overlay', style: { left, top, width: width * scale, height: height * scale } }, overlay) : null,
  ])
}

/** Below this the presentation does not shrink a slide further: its body scrolls instead, its text still readable. */
export const SLIDE_MIN_SCALE = 0.7
/** A slide that has to shrink below this to fit is crowded, and the author is told (`slideCrowding`). */
export const SLIDE_CROWDED_SCALE = 0.85
// Captures, the recording of a lecture video and its preview in the workbench (`externalControls`) are pictures nobody
// scrolls: their crowded slides shrink whole, as printed.
const capturing = typeof location !== 'undefined' && [CAPTURE_PARAM, VIDEO_EXPORT_PARAM].some(name => new URLSearchParams(location.search).has(name))

/** The smallest scale each slide shown in the presentation needed to fit, by section id, for the document it was measured in. */
export const slideCrowding = createStore<{ doc?: IRDocument, fits: ReadonlyMap<string, number> }>({ fits: new Map() })

function measured(doc: IRDocument, section: string, fit: number): void {
  measuredAll(doc, new Map([[section, fit]]))
}

function measuredAll(doc: IRDocument, measured: ReadonlyMap<string, number>): void {
  const current = slideCrowding.getSnapshot()
  const fits = new Map(current.doc === doc ? current.fits : [])
  let changed = current.doc !== doc
  for (const [section, fit] of measured) {
    const least = Math.min(fits.get(section) ?? 1, fit)
    if (fits.get(section) === least) continue
    fits.set(section, least)
    changed = true
  }
  if (changed) slideCrowding.set({ doc, fits })
}

/** Runs `run` when the page is idle (or after `timeout` at the latest); the returned function cancels it. */
function whenIdle(run: () => void, timeout = 1000): () => void {
  if (typeof requestIdleCallback === 'function') { const id = requestIdleCallback(run, { timeout }); return () => cancelIdleCallback(id) }
  const id = setTimeout(run, 50)
  return () => clearTimeout(id)
}

/** Resolves when the fonts and the pictures in `element` have loaded (or failed), or after `timeout` at the latest. */
function drawn(element: HTMLElement | null, timeout = 5000): Promise<void> {
  const images = [...element?.querySelectorAll('img') ?? []].filter(image => !image.complete)
  const loaded = Promise.all([document.fonts.ready, ...images.map(image => new Promise<void>((done) => {
    image.addEventListener('load', () => done(), { once: true })
    image.addEventListener('error', () => done(), { once: true })
  }))])
  return Promise.race([loaded.then(() => {}), new Promise<void>(done => setTimeout(done, timeout))])
}

/**
 * Measures how crowded each slide of the document is without presenting it, for `slideCrowding`: off screen, one slide
 * at a time at its last step, each when the page is idle, components shown as printed (their fallbacks). A new revision
 * of the document starts over and drops the measurement under way. `onMeasured` follows each complete pass.
 */
export function SlideFitProbe({ onMeasured }: { onMeasured?: (doc: IRDocument) => void }) {
  const { viewer, shape } = useSlides()
  const doc = useStore(viewer.doc)
  const host = useHost()
  const printed = useMemo(() => ({ ...host, useStaticRender: () => true }), [host])
  const [at, setAt] = useState<{ doc: IRDocument, index: number }>()
  const fits = useRef(new Map<string, number>())
  const latest = useRef<number>()
  const probe = useRef<HTMLDivElement>(null)
  const done = useRef(onMeasured)
  done.current = onMeasured
  useEffect(() => {
    fits.current = new Map()
    latest.current = undefined
    setAt(undefined)
    return whenIdle(() => setAt({ doc, index: 0 }))
  }, [doc])
  useEffect(() => {
    if (!at || at.doc !== doc) return
    const section = doc.sections[at.index]
    if (!section) {
      measuredAll(doc, fits.current)
      done.current?.(doc)
      return
    }
    // After the slide is laid out with its fonts and pictures (its fit reported again as they arrive) and the page is idle
    // again: its fit, then the next slide. A picture still loading would leave the slide shorter than the presentation shows it.
    let cancel = () => {}, cancelled = false
    const frame = requestAnimationFrame(() => {
      void drawn(probe.current).then(() => requestAnimationFrame(() => {
        if (cancelled) return
        cancel = whenIdle(() => {
          if (latest.current !== undefined) fits.current.set(section.id, latest.current)
          latest.current = undefined
          setAt({ doc, index: at.index + 1 })
        })
      }))
    })
    return () => { cancelled = true; cancelAnimationFrame(frame); cancel() }
  }, [at, doc])
  const section = at && at.doc === doc ? doc.sections[at.index] : undefined
  return h('div', { 'ref': probe, 'className': 'pm-slide-probe', 'aria-hidden': true, 'inert': '', 'style': { width: `${shape.width}px`, height: `${shape.height}px` } }, section
    ? h(HostProvider, { adapter: printed }, h(SlideFace, { key: section.id, section, step: section.steps, view: 'print', onFit: (fit: number) => { latest.current = fit } }))
    : null)
}

/** The crowded slides as problems the preview reports to the workbench, each on its page. */
export function slideCrowdingProblems(): { level: 'warning', plugin: string, section: string, message: string }[] {
  const { doc, fits } = slideCrowding.getSnapshot()
  if (!doc) return []
  const t = viewerMessages()
  return doc.sections.flatMap((section) => {
    const fit = fits.get(section.id)
    if (fit === undefined || fit >= SLIDE_CROWDED_SCALE) return []
    const shown = Math.max(fit, SLIDE_MIN_SCALE)
    return [{ level: 'warning' as const, plugin: 'presmium.slides.crowded', section: section.id, message: t.present.crowded(section.index, Math.round(shown * 100), fit < SLIDE_MIN_SCALE) }]
  })
}

// The shrink is measured after layout and before paint and written to the element itself, not through a render:
// a render would come a frame late, and the new slide would show for that frame at full size. With `readable` (the
// presentation) it stops at `SLIDE_MIN_SCALE`, and the body scrolls what does not fit, its heading kept at the top and a
// fade with a hint at the bottom while there is more below; printed, the whole slide shrinks.
function SlideBody({ zoom, readable, step, more, onFit, children }: { zoom?: number, readable: boolean, step: number, more: string, onFit?: (fit: number) => void, children?: ReactNode }) {
  const frame = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const fitted = useRef(onFit)
  fitted.current = onFit
  const measure = useRef<() => void>()
  useLayoutEffect(() => {
    const outer = frame.current, inner = content.current
    if (!outer || !inner) return
    let shown = 1
    // The heading is moved down by what the body has scrolled (in the content's own, scaled pixels): `sticky` does not
    // hold inside the scaled content.
    const scrolled = () => {
      const scrolls = outer.classList.contains('pm-slide__body--scrolls')
      const heading = inner.querySelector<HTMLElement>(':scope > .pm-slide__title')
      if (heading) heading.style.transform = scrolls && outer.scrollTop > 0 ? `translateY(${outer.scrollTop / shown}px)` : ''
      outer.toggleAttribute('data-more', scrolls && outer.scrollTop + outer.clientHeight < outer.scrollHeight - 1)
    }
    measure.current = () => {
      const fit = Math.min(1, outer.clientHeight / Math.max(1, inner.scrollHeight), outer.clientWidth / Math.max(1, inner.scrollWidth))
      const scale = readable ? Math.max(fit, SLIDE_MIN_SCALE) : fit
      const left = Math.max(0, (outer.clientWidth - inner.offsetWidth * scale) / 2)
      inner.style.transform = scale < 1 ? `translateX(${left}px) scale(${scale})` : ''
      // A scaled box still takes its full height in the scroll range: the margin gives back what the scale took off.
      inner.style.marginBottom = scale > fit ? `${-inner.offsetHeight * (1 - scale)}px` : ''
      outer.classList.toggle('pm-slide__body--scrolls', scale > fit)
      shown = scale
      scrolled()
      fitted.current?.(fit)
    }
    const observer = new ResizeObserver(() => measure.current?.())
    observer.observe(outer)
    observer.observe(inner)
    outer.addEventListener('scroll', scrolled, { passive: true })
    return () => { observer.disconnect(); outer.removeEventListener('scroll', scrolled) }
  }, [readable])
  // A new revision of the document can change the slide without changing its size.
  useLayoutEffect(() => measure.current?.())
  // A step that reveals content below (or above) what a scrolling slide shows scrolls it into view, its top kept in view
  // below the heading, which stays at the top.
  useEffect(() => {
    const outer = frame.current, inner = content.current
    if (!readable || !outer || !inner || !outer.classList.contains('pm-slide__body--scrolls')) return
    const revealed = [...inner.querySelectorAll<HTMLElement>(`.${BLOCK_CLASS}[data-at="${step}"]:not(.pm-hidden)`)]
    if (!revealed.length) return
    const id = requestAnimationFrame(() => {
      const box = outer.getBoundingClientRect(), rects = revealed.map(element => element.getBoundingClientRect())
      const heading = inner.querySelector('.pm-slide__title')?.getBoundingClientRect()
      const visible = heading ? Math.max(box.top, heading.bottom) : box.top
      const top = Math.min(...rects.map(rect => rect.top)), bottom = Math.max(...rects.map(rect => rect.bottom))
      const delta = bottom > box.bottom ? Math.min(bottom - box.bottom, top - visible) : top < visible ? top - visible : 0
      // The slide is drawn scaled: the distance on screen, in the body's own pixels.
      const scale = box.height / Math.max(1, outer.clientHeight)
      if (Math.abs(delta) >= 1) outer.scrollBy({ top: delta / scale, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    })
    return () => cancelAnimationFrame(id)
  }, [step, readable])
  return h('div', { ref: frame, className: 'pm-slide__body' }, [
    h('div', { key: 'content', ref: content, className: 'pm-slide__content', style: zoom ? { zoom } : undefined }, children),
    readable ? h('div', { 'key': 'more', 'className': 'pm-slide__more', 'aria-hidden': true }, h('span', { className: 'pm-slide__more-hint' }, more)) : null,
  ])
}

export function SlideFace({ section, step, view = 'present', onFit }: { section: IRSection, step: number, view?: string, onFit?: (fit: number) => void }) { const { viewer, chapters } = useSlides(); const doc = useStore(viewer.doc); const t = useMessages(MESSAGES); const { sections } = doc; const options = slideOptions(section, section.index === 1 && sections.length > 1); const chapter = options.layout === 'cover' || options.layout === 'full' ? undefined : chapters.get(section.id); const done = Math.min(step, section.steps); const readable = view === 'present' && !capturing && !viewer.options.externalControls; return h(SECTION_CONTEXT.Provider, { value: { section, step, view } }, h('div', { class: ['pm-slide', `pm-slide--${options.layout}`, options.className], 'data-section': section.id, 'data-slide': section.index, 'data-step': step }, [chapter ? h('p', { className: 'pm-slide__chapter' }, chapter) : null, h(SlideBody, { key: section.id, zoom: options.zoom, readable, step, more: t.more, onFit: onFit ?? (readable ? (fit: number) => measured(doc, section.id, fit) : undefined) }, [h(options.layout === 'cover' ? 'h1' : 'h2', { className: 'pm-slide__title' }, section.title), ...visuals(section, step)]), options.layout === 'full' ? null : h('footer', { className: 'pm-slide__footer' }, [options.layout === 'cover' ? null : h('span', { className: 'pm-slide__deck' }, doc.meta.title), section.steps > 0 ? h('span', { className: 'pm-slide__steps', role: 'img', 'aria-label': t.steps(done, section.steps), style: { '--pm-slide-steps': section.steps } }, Array.from({ length: section.steps }, (_, i) => h('span', { key: i, 'data-done': i < done ? '' : undefined }))) : null, h('span', { className: 'pm-slide__page' }, `${section.index} / ${sections.length}`)]), h('div', { className: 'pm-slide__layers' }, layers(view, 'slide', { section: section.id, step }))])) }
export function SlidesPrint({ steps = false, slides }: { steps?: boolean, slides?: readonly number[] }) { const { viewer, shape } = useSlides(); const doc = useStore(viewer.doc); useEffect(() => { let disposed = false; void (async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.complete ? undefined : new Promise<void>(done => { image.addEventListener('load', () => done(), { once: true }); image.addEventListener('error', () => done(), { once: true }) }))); if (!disposed) document.documentElement.setAttribute('data-presmium-printed', '') })(); return () => { disposed = true; document.documentElement.removeAttribute('data-presmium-printed') } }, []); const chosen = slides && new Set(slides); const pages = doc.sections.filter(section => !chosen || chosen.has(section.index)).flatMap(section => steps ? Array.from({ length: section.steps + 1 }, (_, step) => ({ section, step })) : [{ section, step: section.steps }]); return h('div', { className: 'pm-slides-print', style: { '--pm-slide-width': `${shape.width}px`, '--pm-slide-height': `${shape.height}px` } }, pages.map(({ section, step }) => h('div', { key: `${section.id}@${step}`, className: 'pm-slides-print__page', style: { width: `${shape.width}px`, height: `${shape.height}px` } }, h(SlideFace, { section, step, view: 'print' })))) }
