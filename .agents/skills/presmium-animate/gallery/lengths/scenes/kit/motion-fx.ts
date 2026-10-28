// Motion-only helpers for the fx scenes: curves baked into keyframes and springs that follow a moving target,
// both computed once at build, so a segment holds plain numbers and every frame is a function of the time.
// A segment of many keyframes eases every interval with its one `ease`; baked keyframes go in a segment with
// `ease: 'linear'`, and the easing is already in the samples.

/** `f` sampled at `n + 1` even times over [0, duration] (seconds): keyframes for a segment with `ease: 'linear'`. */
export function bake(f: (t: number) => number, duration: number, n: number): number[] {
  return Array.from({ length: n + 1 }, (_, i) => f((i / n) * duration))
}

/**
 * A damped spring (`stiffness`, `damping`, unit mass) chasing `target(t)` from rest at `target(0)`, integrated at
 * build with a fixed step: the lag and overshoot of something that follows a hand. Returns the spring's value as a
 * function of time, for `bake`. The same inputs give the same curve on every build.
 */
export function follow(target: (t: number) => number, duration: number, { stiffness = 170, damping = 22, dt = 1 / 960 } = {}): (t: number) => number {
  const steps = Math.ceil(duration / dt)
  const table = new Float64Array(steps + 1)
  let x = target(0), v = 0
  table[0] = x
  for (let i = 1; i <= steps; i++) {
    // Semi-implicit Euler: stable for these stiffnesses at this step.
    v += (stiffness * (target(i * dt) - x) - damping * v) * dt
    x += v * dt
    table[i] = x
  }
  return t => {
    const s = Math.max(0, Math.min(steps, t / dt)), i = Math.min(steps - 1, Math.floor(s))
    return table[i]! + (table[i + 1]! - table[i]!) * (s - i)
  }
}

/** Smoothstep from 0 at `a` to 1 at `b` (a > b counts down). */
export function smooth(a: number, b: number, x: number): number {
  const u = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return u * u * (3 - 2 * u)
}

/** A cubic Bézier ease (CSS `cubic-bezier(x1, y1, x2, y2)`) as a function, for baking the same curve Motion would use. */
export function bezier(x1: number, y1: number, x2: number, y2: number): (p: number) => number {
  const at = (a: number, b: number, s: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3
  return p => {
    if (p <= 0) return 0
    if (p >= 1) return 1
    let lo = 0, hi = 1
    for (let i = 0; i < 32; i++) {
      const mid = (lo + hi) / 2
      if (at(x1, x2, mid) < p) lo = mid
      else hi = mid
    }
    return at(y1, y2, (lo + hi) / 2)
  }
}
