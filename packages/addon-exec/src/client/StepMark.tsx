import { useContext, useEffect } from 'react'
import { useStepState } from '@lincyaw/host'
import { STEP_MARKS } from './step-marks.ts'
export default function StepMark({ step }: { step: number }) {
  const register = useContext(STEP_MARKS)
  const state = useStepState({ from: step })
  useEffect(
    () => register?.(step, state),
    [register, step, state.reached, state.active],
  )
  return null
}
