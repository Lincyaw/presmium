// Timing shared by the annotation scenes, on top of the kit's time maths (kit/fx/time.ts): an eased interval, a
// button press, typing, and the seconds at which the states start. Every scene paints each frame from the time alone.
import { ease, mix, phase } from '../../../../lengths/scenes/kit/fx/time.ts'

/** Progress of an interval: 0 before `a`, 1 after `a + d`, eased in between. */
export const seg = (t: number, a: number, d: number, e: (p: number) => number = ease.linear) => e(phase(t, a, d))

/** A press: down fast to `depth`, back with a little overshoot; 1 outside [a, a + 0.35]. */
export function press(t: number, a: number, depth = 0.86): number {
  if (t < a || t > a + 0.35) return 1
  const p = t - a
  return p < 0.09 ? mix(1, depth, ease.out2(p / 0.09)) : mix(depth, 1, ease.backOut(2.4)((p - 0.09) / 0.26))
}

/** Characters of `text` typed by time t from a start `a` at `cps` characters a second. */
export const typed = (text: string, t: number, a: number, cps = 13) => [...text].slice(0, Math.max(0, Math.floor((t - a) * cps))).join('')

/** The times (s) at which each step starts, and the scene's end, from `at(k)` and `total` (ms). */
export function steps(at: (k: number) => number, durations: readonly number[], total: number) {
  const starts = durations.map((_, k) => at(k) / 1000)
  return { starts, end: total / 1000, n: durations.length }
}
