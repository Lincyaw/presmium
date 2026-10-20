import type { StepState } from '@lincyaw/kernel'
import type { InjectionKey, Ref } from 'vue'

export function markLine(container: HTMLElement | undefined, line: number | undefined, className: string): void {
  container?.querySelectorAll('code .line').forEach((el, i) => el.classList.toggle(className, i + 1 === line))
}

export type RegisterStepMark = (step: number, state: Readonly<Ref<StepState>>) => () => void

export const STEP_MARKS: InjectionKey<RegisterStepMark> = Symbol('presmium.exec.stepMarks')
