// Time maths for effects computed from the time: phases, velocity, closed-form springs and wobbles.

export const clamp01 = (t: number) => Math.max(0, Math.min(1, t))

/** Progress 0..1 of an interval that starts at `start` and lasts `duration` (same unit as `t`). */
export const phase = (t: number, start: number, duration: number) => clamp01((t - start) / duration)

/** The normalized velocity of an ease at p (1 = the average speed): drives smear, blur and stretch. */
export function speed(ease: (p: number) => number, p: number, h = 1e-3): number {
  const a = Math.max(0, p - h), b = Math.min(1, p + h)
  return (ease(b) - ease(a)) / (b - a)
}

/** The p at which a monotonic ease reaches y (bisection): when does the moving thing pass a mark. */
export function invertEase(ease: (p: number) => number, y: number): number {
  let lo = 0, hi = 1
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (ease(mid) < y) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/**
 * A spring from 0 to 1 at time t (s), in the convention Motion and SwiftUI use: `duration` is the perceptual
 * duration, `bounce` 0 is critically damped and 0.3 overshoots by about 10%. Closed form, so any t can be shown.
 */
export function spring01(t: number, { duration = 0.5, bounce = 0.2 } = {}): number {
  if (t <= 0) return 0
  const zeta = 1 - Math.max(0, Math.min(0.95, bounce))
  const w0 = (2 * Math.PI) / duration
  if (zeta >= 1) return 1 - Math.exp(-w0 * t) * (1 + w0 * t)
  const wd = w0 * Math.sqrt(1 - zeta * zeta)
  return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t))
}

/** A damped oscillation: amplitude `a`, frequency `f` (Hz), decay time `tau` (s); 0 before t = 0. */
export const wobble = (t: number, a: number, f: number, tau: number) => (t <= 0 ? 0 : a * Math.exp(-t / tau) * Math.sin(2 * Math.PI * f * t))

/** A camera shake from layered sines with fixed phases, fading over `duration`: [dx, dy] in the units of `a`. */
export function shake(t: number, a: number, duration: number, seed = 1): [number, number] {
  if (t <= 0 || t >= duration) return [0, 0]
  const fade = (1 - t / duration) ** 2
  const s = (k: number, f: number) => Math.sin(2 * Math.PI * f * t + seed * (k + 1) * 1.7)
  return [a * fade * (0.6 * s(0, 23) + 0.4 * s(1, 37)), a * fade * (0.6 * s(2, 29) + 0.4 * s(3, 41))]
}
