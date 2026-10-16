import type { StepState } from '@presmium/kernel'
import type { InjectionKey, Ref } from 'vue'

/**
 * Marks the line rendered for `line` (1-based) in the wrapped code block, which
 * the host renders (Shiki in both forms); undefined clears the mark.
 */
export function markLine(container: HTMLElement | undefined, line: number | undefined, className: string): void {
  container?.querySelectorAll('code .line').forEach((el, i) => el.classList.toggle(className, i + 1 === line))
}

/** Lets step marks report the state of their internal step to the component that renders them. */
export type RegisterStepMark = (step: number, state: Readonly<Ref<StepState>>) => () => void

export const STEP_MARKS: InjectionKey<RegisterStepMark> = Symbol('presmium.exec.stepMarks')
