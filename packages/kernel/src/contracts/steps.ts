export interface StepRange {
  from: number
  to?: number
}

export interface StepState {
  active: boolean
  reached: boolean
  done: boolean
}

export interface Cursor {
  slide: number
  step: number
}
