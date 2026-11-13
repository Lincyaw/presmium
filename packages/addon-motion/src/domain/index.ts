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

/** Map a driven step's playback time into the independent state timeline used to build the shown scene. */
export function pacedTimelinePosition(durations: readonly number[], playback: readonly number[], step: number, time: number): number {
  const length = playback[step], timeline = durations[step]
  return timelinePosition(durations, step, Number.isFinite(time) && length !== undefined && length > 0 && timeline !== undefined && timeline > 0 ? time * timeline / length : time)
}

/**
 * The durations a scene plays with while a narrated lecture paces its steps: state k lasts as long as `voiced(k)`, the
 * voice of the first step that shows it. The authored duration is the fallback when that step has no paced voice.
 */
export function voicedDurations(durations: readonly number[], voiced: (state: number) => number | undefined): number[] {
  return durations.map((ms, k) => {
    const duration = voiced(k)
    return duration !== undefined && Number.isFinite(duration) && duration > 0 ? duration : ms
  })
}

export { MOTION_MESSAGES } from './messages.ts'
export type { MotionMessages } from './messages.ts'
