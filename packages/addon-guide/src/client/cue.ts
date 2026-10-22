import { useHost, usePrefersReducedMotion, useStepScope, useStepState, useViewRole } from '@lincyaw/host'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { cueRange, cueSteps } from '../domain/index.ts'
import { useIsOnStage } from './stage.ts'
import { resolveTarget, useTargetMark } from './targets.ts'

export interface CueProps {
  target: string
  at?: number | string
  until?: number | string
  title?: string
  text?: string
}

export interface CueRequest {
  element: HTMLElement
  title?: string
  text?: string
  animate: boolean
}

export type ShowCue = (owner: object, request: CueRequest | undefined) => void

export function sameCue(a: CueRequest | undefined, b: CueRequest | undefined): boolean {
  return !!a && !!b && a.element === b.element && a.title === b.title && a.text === b.text && a.animate === b.animate
}

export type CueLook = 'stage' | 'inline'

const STILL_FRAMES = 30

export function useCue(props: CueProps, attribute: string, show: ShowCue) {
  const range = cueRange(props.at, props.until)
  const state = useStepState(range)
  const scope = useStepScope()
  const onStage = useIsOnStage()
  const reduced = usePrefersReducedMotion()
  const role = useViewRole()
  const step = useHost().useStep()
  const anchor = ref<HTMLElement>()
  const look = computed((): CueLook | undefined => (state.value.active ? (onStage.value ? 'stage' : 'inline') : undefined))
  const note = computed((): 'shown' | 'hidden' | undefined => {
    if (role.value !== 'reader') return undefined
    return state.value.active || step.value === Number.POSITIVE_INFINITY ? 'shown' : 'hidden'
  })

  useTargetMark(anchor, () => props.target, attribute, look)

  const owner = {}
  let request: CueRequest | undefined
  let frame = 0
  let box = ''
  let still = 0
  const trackBox = () => {
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
    if (still < STILL_FRAMES) frame = requestAnimationFrame(trackBox)
  }
  const wake = () => {
    still = 0
    if (request && !frame) frame = requestAnimationFrame(trackBox)
  }
  function draw() {
    cancelAnimationFrame(frame)
    frame = 0
    const element = look.value === 'stage' ? resolveTarget(anchor.value, props.target) : undefined
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

  return { anchor, look, note, steps: computed(() => cueSteps(range).map(scope.step)) }
}

function boxOf(element: Element): string {
  const { x, y, width, height } = element.getBoundingClientRect()
  return `${x} ${y} ${width} ${height}`
}
