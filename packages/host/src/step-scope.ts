import { createContext, createElement, useContext, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { StepRange } from '@lincyaw/kernel/contracts'
export const STEP_SCOPE = createContext<StepRange>({ from: 0 })
export function StepScope({ at, until, children }: { at: number, until?: number, children?: ReactNode }) {
  const parent = useContext(STEP_SCOPE)
  const end = until === undefined ? parent.to : parent.to === undefined ? until : Math.min(until, parent.to)
  const value = useMemo(() => ({ from: Math.max(at, parent.from), to: end }), [at, parent.from, end])
  return createElement(STEP_SCOPE.Provider, { value }, children)
}
export interface StepScope { readonly at: number, step(k: number): number }
export function useStepScope(): StepScope { const { from } = useContext(STEP_SCOPE); return { at: from, step: k => from + k } }
export function useBlockStepRange(): StepRange { const { from, to } = useContext(STEP_SCOPE); return { from: 0, to: to === undefined ? undefined : to - from } }
