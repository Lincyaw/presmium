import { createContext } from 'react'
import type { StepState } from '@lincyaw/kernel'
export function markLine(container: HTMLElement | null | undefined, line: number | undefined, className: string): void {
  container?.querySelectorAll('code .line').forEach((el, i) => el.classList.toggle(className, i + 1 === line))
}
export type RegisterStepMark = (step: number, state: StepState) => () => void
export const STEP_MARKS = createContext<RegisterStepMark | undefined>(undefined)
