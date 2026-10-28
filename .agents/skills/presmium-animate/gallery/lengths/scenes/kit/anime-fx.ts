// Anime.js helpers for the fancy atoms (`fx/anime/`): a clock for pictures a tween cannot write, seeded spark bursts
// and colour mixing for per-element tints. Plain TypeScript: the timeline is typed by the one method it uses.
import { mulberry32 } from './fx/random.ts'

/** What `clock` needs of an Anime.js timeline (`anime.createTimeline()`). */
interface Timeline { add(target: object, params: Record<string, unknown>, position: number): unknown }

/**
 * A clock: a plain object whose `p` Anime tweens from 0 to 1, linearly, over `duration` from `start`, and whose
 * setter calls `draw(p)`. Callbacks are muted while a scene is sought, but a setter runs on every render, so the
 * picture `draw` makes is a function of the time. `draw(0)` runs once at build for the times before `start`.
 */
export function clock(tl: Timeline, start: number, duration: number, draw: (p: number) => void): void {
  let value = 0
  const proxy = {
    get p() { return value },
    set p(v: number) { value = v; draw(v) },
  }
  draw(0)
  tl.add(proxy, { p: [0, 1], duration, ease: 'linear' }, start)
}

export interface Spark { angle: number, length: number }

/**
 * `n` sparks around a circle: angles evenly spaced from 12 o'clock (radians, clockwise in SVG) plus up to `spread`
 * of a gap of seeded jitter, lengths seeded in [min, 1]; long and short alternate so the ring reads as a burst.
 */
export function burst(n: number, seed: number, { spread = 0.3, min = 0.5 } = {}): Spark[] {
  const rng = mulberry32(seed)
  const gap = (Math.PI * 2) / n
  return Array.from({ length: n }, (_, i) => {
    const jitter = (rng() * 2 - 1) * spread * gap
    const long = i % 2 === 0 ? 1 : 0.7
    return { angle: -Math.PI / 2 + i * gap + jitter, length: long * (min + (1 - min) * rng()) }
  })
}

/** `a` mixed towards `b` by `k` (0..1), both `rgb()`/`rgba()` strings as `color(name)` returns them. */
export function mix(a: string, b: string, k: number): string {
  const parse = (c: string) => (c.match(/[\d.]+/g) ?? ['0', '0', '0']).map(Number)
  const [r0 = 0, g0 = 0, b0 = 0, a0 = 1] = parse(a), [r1 = 0, g1 = 0, b1 = 0, a1 = 1] = parse(b)
  const l = (x: number, y: number) => x + (y - x) * k
  return `rgba(${Math.round(l(r0, r1))}, ${Math.round(l(g0, g1))}, ${Math.round(l(b0, b1))}, ${+l(a0, a1).toFixed(3)})`
}
