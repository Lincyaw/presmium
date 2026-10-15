import { usePrefersReducedMotion, useStepState } from '@presmium/host'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { cueRange, cueSteps } from '../domain/index.ts'
import { useIsLive } from './live.ts'
import { resolveTarget, useTargetMark } from './targets.ts'

/** Props shared by `PmSpotlight` and `PmHint`. */
export interface CueProps {
  /** CSS selector of the target, looked up in the cue's slide. */
  target: string
  /** First step (default 1). */
  at?: number | string
  /** Step at which the cue ends (exclusive); open-ended when absent. */
  until?: number | string
  title?: string
  text?: string
}

/** A page-level effect on one element, drawn by driver.js. */
export interface CueRequest {
  element: HTMLElement
  title?: string
  text?: string
  /** False with reduced motion: the effect appears in its final state. */
  animate: boolean
}

/** Draws (or, with `undefined`, withdraws) the page-level effect `owner` asks for. */
export type ShowCue = (owner: object, request: CueRequest | undefined) => void

export function sameCue(a: CueRequest | undefined, b: CueRequest | undefined): boolean {
  return !!a && !!b && a.element === b.element && a.title === b.title && a.text === b.text && a.animate === b.animate
}

/** How an active cue is drawn: by a page-level effect on the live slide, or in place elsewhere. */
export type CueLook = 'live' | 'inline'

/**
 * A spotlight or hint. Its look is a function of the step: while the step is
 * in range the target carries `attribute` (`live` or `inline`), and on the live
 * slide `show` draws the page-level effect. Must be called inside a component setup.
 */
export function useCue(props: CueProps, attribute: string, show: ShowCue) {
  const range = cueRange(props.at, props.until)
  const state = useStepState(range)
  const live = useIsLive()
  const reduced = usePrefersReducedMotion()
  /** An element of the cue component, from which the target is looked up. */
  const anchor = ref<HTMLElement>()
  const look = computed((): CueLook | undefined => (state.value.active ? (live.value ? 'live' : 'inline') : undefined))

  useTargetMark(anchor, () => props.target, attribute, look)

  // A slide can become live before it is laid out; drawing again once the target has a size places the effect.
  const owner = {}
  const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => draw())
  let observed: HTMLElement | undefined
  function draw() {
    const element = look.value === 'live' ? resolveTarget(anchor.value, props.target) : undefined
    if (element !== observed) {
      if (observed) observer?.unobserve(observed)
      if (element) observer?.observe(element)
      observed = element
    }
    show(owner, element && { element, title: props.title, text: props.text, animate: !reduced.value })
  }
  watch([look, reduced, anchor], draw, { flush: 'post' })
  onBeforeUnmount(() => {
    observer?.disconnect()
    show(owner, undefined)
  })

  return { anchor, look, steps: cueSteps(range) }
}
