import type { Ref } from 'vue'
import { onBeforeUnmount, onMounted } from 'vue'

const px = (value: string) => Number.parseFloat(value) || 0

/**
 * The slide that shows `el`: the nearest box that hides what overflows it (a
 * slide of the slides, the frame of the present view), as the innermost box
 * that covers it, so that its height is in the px of `el` (a zoomed slide's
 * layout is taller than the slide by its zoom).
 */
function slideOf(el: HTMLElement): HTMLElement | undefined {
  const path: HTMLElement[] = []
  for (let box = el.parentElement; box; box = box.parentElement) {
    path.push(box)
    if (getComputedStyle(box).overflowY !== 'hidden') continue
    const { top, bottom } = box.getBoundingClientRect()
    return path.find((inner) => {
      const covers = inner.getBoundingClientRect()
      return Math.abs(covers.top - top) < 1 && Math.abs(covers.bottom - bottom) < 1
    })
  }
}

/** The top of `el` in the layout, which a transform does not change (the present view scales a slide to fit its frame). */
function layoutTop(el: HTMLElement): number {
  let top = el.offsetTop
  for (let box = el.offsetParent; box instanceof HTMLElement; box = box.offsetParent) top += box.clientTop + box.offsetTop
  return top
}

/** The height from the top of `el` to the bottom of the content of its slide, in its own px; undefined outside a slide or while hidden. */
function roomBelow(el: HTMLElement): number | undefined {
  const slide = el.offsetParent ? slideOf(el) : undefined
  if (!slide?.clientHeight) return undefined
  let below = px(getComputedStyle(el).marginBottom)
  for (let box = el.parentElement; box && box !== slide; box = box.parentElement) {
    const style = getComputedStyle(box)
    below += px(style.paddingBottom) + px(style.borderBottomWidth)
  }
  const top = layoutTop(el) - layoutTop(slide) - slide.clientTop
  return Math.max(0, slide.clientHeight - px(getComputedStyle(slide).paddingBottom) - top - below)
}

/**
 * Fits `el` to its slide while `active` (N-05): calls `fit` with the height
 * from its top to the bottom of the slide, again whenever the slide, `el` or
 * what comes before it changes size.
 */
export function useSlideRoom(el: Readonly<Ref<HTMLElement | undefined>>, active: boolean, fit: (room: number) => void): void {
  if (!active) return
  const measure = () => {
    const room = el.value && roomBelow(el.value)
    if (room !== undefined) fit(room)
  }
  let observer: ResizeObserver | undefined
  onMounted(() => {
    const target = el.value
    if (!target) return
    observer = new ResizeObserver(measure)
    observer.observe(target)
    // What comes before it moves it down; the slide changes its height with the window around it.
    for (let box = target; box.parentElement; box = box.parentElement) {
      for (let before = box.previousElementSibling; before; before = before.previousElementSibling) observer.observe(before)
      observer.observe(box.parentElement)
      if (getComputedStyle(box.parentElement).overflowY === 'hidden') break
    }
    void document.fonts?.ready.then(measure)
  })
  onBeforeUnmount(() => observer?.disconnect())
}
