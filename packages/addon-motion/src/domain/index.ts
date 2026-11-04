export const MOTION_ID = 'presmium.motion'

/** The directory of a deck's scenes, as `components/` holds its components. */
export const SCENES_DIR = 'scenes'

// Not .tsx nor .jsx: the file does not tell which runtime its JSX is for (React's, Vue's).
export const SCENE_EXTENSIONS = ['.ts', '.js', '.mjs'] as const

/** The scene names a deck can use: the path under `scenes/` without its extension, `/` between folders. */
export const SCENE_NAME = /^[\w-]+(?:\/[\w-]+)*$/

/** Where each step starts on a scene's timeline (ms), and its end. */
export function stepStarts(durations: readonly number[]): number[] {
  const starts = [0]
  for (const ms of durations) starts.push(starts.at(-1)! + ms)
  return starts
}

/**
 * The scene's place on its timeline (ms) at block step `step` (from 0), `time` ms into it: step k
 * plays the k-th part of the timeline, `durations[k]` long. Before the block's first step the scene
 * is at its start; after the last, at its end; `time` is `Infinity` when the step is settled.
 */
export function timelinePosition(durations: readonly number[], step: number, time: number): number {
  const starts = stepStarts(durations)
  if (step < 0) return 0
  if (step >= durations.length) return starts.at(-1)!
  return starts[step]! + Math.min(Math.max(0, time), durations[step]!)
}

/**
 * The durations a scene plays with while a narrated lecture paces its steps: state k lasts as long as `voiced(k)`, the
 * voice of the first step that shows it, and never less than its authored duration. A state no step voices keeps its own.
 */
export function voicedDurations(durations: readonly number[], voiced: (state: number) => number | undefined): number[] {
  return durations.map((ms, k) => Math.max(ms, voiced(k) ?? 0))
}

export { MOTION_MESSAGES } from './messages.ts'
export type { MotionMessages } from './messages.ts'
