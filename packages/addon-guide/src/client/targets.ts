import type { MaybeRefOrGetter } from 'vue'
import { onBeforeUnmount, toValue, watch } from 'vue'

/**
 * The element matching `selector` nearest to `from`: the closest ancestor of
 * `from` that contains a match decides. A cue therefore finds its target in
 * its own slide even when the page renders that slide more than once (the
 * presenter view and its preview). Undefined when nothing matches.
 */
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

/**
 * Sets `attribute` on the cue target while `value` is defined, so the target's
 * look follows the step: the attribute moves or goes away when the step changes
 * and is removed when the cue unmounts.
 */
export function useTargetMark(
  anchor: MaybeRefOrGetter<Element | undefined>,
  selector: MaybeRefOrGetter<string | undefined>,
  attribute: string,
  value: MaybeRefOrGetter<string | undefined>,
): void {
  let marked: HTMLElement | undefined
  const clear = () => {
    marked?.removeAttribute(attribute)
    marked = undefined
  }
  watch(
    () => [toValue(anchor), toValue(selector), toValue(value)] as const,
    ([from, target, current]) => {
      clear()
      if (current === undefined) return
      marked = resolveTarget(from, target)
      marked?.setAttribute(attribute, current)
    },
    { immediate: true, flush: 'post' },
  )
  onBeforeUnmount(clear)
}
