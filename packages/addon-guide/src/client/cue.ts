import { usePrefersReducedMotion, useStep, useStepScope, useStepState, useViewRole } from '@lincyaw/host'
import { useLayoutEffect, useRef } from 'react'
import { cueRange, cueSteps } from '../domain/index.ts'
import { useIsOnStage } from './stage.ts'
import { resolveTarget, useTargetMark } from './targets.ts'
export interface CueProps { target: string, at?: number | string, until?: number | string, title?: string, text?: string }
export interface CueRequest { element: HTMLElement, title?: string, text?: string, animate: boolean }
export type ShowCue = (owner: object, request: CueRequest | undefined) => void
export function sameCue(a: CueRequest | undefined, b: CueRequest | undefined): boolean { return !!a && !!b && a.element === b.element && a.title === b.title && a.text === b.text && a.animate === b.animate }
export type CueLook = 'stage' | 'inline'
export function useCue(props: CueProps, attribute: string, show: ShowCue) {
  const range = cueRange(props.at, props.until), state = useStepState(range), scope = useStepScope(), onStage = useIsOnStage(), reduced = usePrefersReducedMotion(), role = useViewRole(), step = useStep()
  const anchor = useRef<HTMLSpanElement>(null), owner = useRef({})
  const look: CueLook | undefined = state.active ? onStage ? 'stage' : 'inline' : undefined
  const note = role !== 'reader' ? undefined : state.active || step === Infinity ? 'shown' as const : 'hidden' as const
  useTargetMark(anchor, props.target, attribute, look)
  useLayoutEffect(() => {
    const element = look === 'stage' ? resolveTarget(anchor.current ?? undefined, props.target) : undefined
    const request = element ? { element, title: props.title, text: props.text, animate: !reduced } : undefined
    show(owner.current, request)
    let frame = 0, still = 0, box = ''
    const track = () => { frame = 0; if (!request) return; const rect = request.element.getBoundingClientRect(); const next = `${rect.x} ${rect.y} ${rect.width} ${rect.height}`; if (next !== box) { show(owner.current, request); box = next; still = 0 } else still++; if (still < 30) frame = requestAnimationFrame(track) }
    const wake = () => { still = 0; if (request && !frame) frame = requestAnimationFrame(track) }
    wake(); window.addEventListener('resize', wake); document.addEventListener('transitionrun', wake, true); document.addEventListener('transitionend', wake, true)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', wake); document.removeEventListener('transitionrun', wake, true); document.removeEventListener('transitionend', wake, true); show(owner.current, undefined) }
  }, [look, reduced, props.target, props.title, props.text, show])
  return { anchor, look, note, steps: cueSteps(range).map(scope.step) }
}
