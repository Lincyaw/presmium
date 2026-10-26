import { createContext, createElement, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { StepRange } from '@lincyaw/kernel/contracts'
import type { IRBlock } from '@lincyaw/kernel'
type States = NonNullable<IRBlock['stepStates']>
interface Scope extends StepRange { states?: States, current?: number }
export const STEP_SCOPE = createContext<Scope>({ from: 0 })
const stateAt = (states: States, step: number) => states[Math.max(0, Math.min(states.length - 1, Number.isFinite(step) ? Math.floor(step) : states.length - 1))]
export function StepScope({ at, until, states, step, children }: { at: number, until?: number, states?: States, step?: number, children?: ReactNode }) {
  const parent = useContext(STEP_SCOPE)
  const end = until === undefined ? parent.to : parent.to === undefined ? until : Math.min(until, parent.to)
  const value = useMemo(() => ({ from: states ? at : Math.max(at, parent.from), to: end, states, current: step }), [at, states, step, parent.from, end])
  return createElement(STEP_SCOPE.Provider, { value }, children)
}
export interface StepScope {
  readonly at: number
  readonly state?: string
  readonly parameters?: Record<string, unknown>
  localStepAt(globalStep: number): number
  /** First authored visible occurrence; -1 when this local state is not in the section. */
  step(k: number): number
}
export function useStepScope(): StepScope {
  const { from, states, current } = useContext(STEP_SCOPE)
  const selected = states && stateAt(states, current ?? Infinity)
  return { at: from, state: selected?.state, parameters: selected?.parameters,
    localStepAt: k => !Number.isFinite(k) ? k : states ? stateAt(states, k)?.localStep ?? 0 : k - from,
    step: k => states ? states.findIndex(value => value.visible && value.localStep === k) : from + k }
}
export function useBlockStepRange(): StepRange {
  const { from, to, states } = useContext(STEP_SCOPE)
  return { from: 0, to: states ? Math.max(0, ...states.map(state => state.localStep)) : to === undefined ? undefined : to - from }
}
