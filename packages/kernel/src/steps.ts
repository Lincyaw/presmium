import type { StepRange, StepState } from './contracts/steps.ts'

export function stepStateAt(range: StepRange, step: number): StepState {
  const reached = step >= range.from
  const done = range.to !== undefined && step >= range.to
  return { active: reached && !done, reached, done }
}
