import { useHost, usePrefersReducedMotion, useStepScope, useStepState, useViewRole } from '@presmium/host'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { cueRange, cueSteps } from '../domain/index.ts'
import { useIsLive } from './live.ts'
import { resolveTarget, useTargetMark } from './targets.ts'

/** Props shared by `PmSpotlight` and `PmHint`. Steps count from the cue's block (its step scope). */
export interface CueProps {
  /** CSS selector of the target, looked up in the cue's slide. */
  target: string
  /** First step (default 0, the step its block appears at). */
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

/** Frames the target's box must keep still before the effect stops following it. */
const STILL_FRAMES = 30

/**
 * A spotlight or hint. Its look is a function of the step: while the step is
 * in range the target carries `attribute` (`live` or `inline`), and on the live
 * slide `show` draws the page-level effect. Where a reader reads the page (the
 * web form's page views), `note` tells whether the cue's title and text show
 * in place: while it is active, and always where every step is shown (the
 * document view); elsewhere it is undefined. Must be called inside a component setup.
 */
export function useCue(props: CueProps, attribute: string, show: ShowCue) {
  const range = cueRange(props.at, props.until)
  const state = useStepState(range)
  const scope = useStepScope()
  const live = useIsLive()
  const reduced = usePrefersReducedMotion()
  const role = useViewRole()
  const step = useHost().useStep()
  /** An element of the cue component, from which the target is looked up. */
  const anchor = ref<HTMLElement>()
  const look = computed((): CueLook | undefined => (state.value.active ? (live.value ? 'live' : 'inline') : undefined))
  const note = computed((): 'shown' | 'hidden' | undefined => {
    if (role.value !== 'reader') return undefined
    return state.value.active || step.value === Number.POSITIVE_INFINITY ? 'shown' : 'hidden'
  })

  useTargetMark(anchor, () => props.target, attribute, look)

  // The host can move the target without resizing it: Slidev scales the slide with a CSS transform when
  // the window changes, and a transition slides it in. While the effect is drawn, the target's box is read
  // on every frame until it has kept still a while, and again when the window resizes or a transition runs.
  const owner = {}
  let request: CueRequest | undefined
  let frame = 0
  let box = ''
  let still = 0
  const follow = () => {
    frame = 0
    if (!request) return
    const next = boxOf(request.element)
    if (next !== box) {
      show(owner, request)
      box = next
      still = 0
    } else {
      still++
    }
    if (still < STILL_FRAMES) frame = requestAnimationFrame(follow)
  }
  const wake = () => {
    still = 0
    if (request && !frame) frame = requestAnimationFrame(follow)
  }
  function draw() {
    cancelAnimationFrame(frame)
    frame = 0
    const element = look.value === 'live' ? resolveTarget(anchor.value, props.target) : undefined
    request = element && { element, title: props.title, text: props.text, animate: !reduced.value }
    show(owner, request)
    if (!request) return
    box = boxOf(request.element)
    wake()
  }
  watch([look, reduced, anchor], draw, { flush: 'post' })
  window.addEventListener('resize', wake)
  document.addEventListener('transitionrun', wake, true)
  document.addEventListener('transitionend', wake, true)
  onBeforeUnmount(() => {
    cancelAnimationFrame(frame)
    window.removeEventListener('resize', wake)
    document.removeEventListener('transitionrun', wake, true)
    document.removeEventListener('transitionend', wake, true)
    show(owner, undefined)
  })

  // Registered with the host at their steps of the slide.
  return { anchor, look, note, steps: computed(() => cueSteps(range).map(scope.step)) }
}

function boxOf(element: Element): string {
  const { x, y, width, height } = element.getBoundingClientRect()
  return `${x} ${y} ${width} ${height}`
}
