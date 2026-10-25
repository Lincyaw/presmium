import { useLayoutEffect } from 'react'
import type { RefObject } from 'react'

export function resolveTarget(from: Element | undefined, selector: string | undefined): HTMLElement | undefined {
  if (!from || !selector) return undefined
  try {
    for (let scope = from.parentElement; scope; scope = scope.parentElement) {
      const found = scope.querySelector<HTMLElement>(selector)
      if (found) return found
    }
  } catch (error) {
    console.warn(`[presmium] invalid cue target "${selector}"`, error)
  }
  return undefined
}

export function useTargetMark(anchor: RefObject<Element | null | undefined>, selector: string | (() => string | undefined), attribute: string, value: string | undefined | (() => string | undefined)): void {
  const targetSelector = typeof selector === 'function' ? selector() : selector
  const current = typeof value === 'function' ? value() : value
  useLayoutEffect(() => {
    const marked = current === undefined ? undefined : resolveTarget(anchor.current ?? undefined, targetSelector)
    if (marked && current !== undefined) marked.setAttribute(attribute, current)
    return () => marked?.removeAttribute(attribute)
  }, [anchor, targetSelector, attribute, current])
}
