import { useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'

const px = (value: string) => Number.parseFloat(value) || 0

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

function layoutTop(el: HTMLElement): number {
  let top = el.offsetTop
  for (let box = el.offsetParent; box instanceof HTMLElement; box = box.offsetParent) top += box.clientTop + box.offsetTop
  return top
}

function spaceBelow(el: HTMLElement): number | undefined {
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

/** Calls `fit` with the height left below the element on its slide, again whenever the layout around it changes. */
export function useSlideSpaceBelow(el: RefObject<HTMLElement | null | undefined>, active: boolean, fit: (space: number) => void): void {
  const callback = useRef(fit)
  callback.current = fit
  useLayoutEffect(() => {
    const target = el.current
    if (!active || !target) return
    let disposed = false
    const measure = () => {
      if (disposed) return
      const space = spaceBelow(target)
      if (space !== undefined) callback.current(space)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(target)
    for (let box = target; box.parentElement; box = box.parentElement) {
      for (let before = box.previousElementSibling; before; before = before.previousElementSibling) observer.observe(before)
      observer.observe(box.parentElement)
      if (getComputedStyle(box.parentElement).overflowY === 'hidden') break
    }
    measure()
    void document.fonts?.ready.then(measure)
    return () => { disposed = true; observer.disconnect() }
  }, [el, active])
}
