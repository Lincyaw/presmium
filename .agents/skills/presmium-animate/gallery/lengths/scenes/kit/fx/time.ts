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

/**
 * A damped spring's step response 0 → 1 at tau (s), by damping ratio `zeta` (.4 bouncy … .8 firm, 1 critical) and
 * natural frequency `omega` (rad/s): the physical form, for moves tuned by feel rather than by duration.
 */
export function damped(tau: number, zeta = 0.6, omega = 20): number {
  if (tau <= 0) return 0
  if (zeta < 1) {
    const wd = omega * Math.sqrt(1 - zeta * zeta)
    return 1 - Math.exp(-zeta * omega * tau) * (Math.cos(wd * tau) + ((zeta * omega) / wd) * Math.sin(wd * tau))
  }
  if (zeta === 1) return 1 - Math.exp(-omega * tau) * (1 + omega * tau)
  const q = omega * Math.sqrt(zeta * zeta - 1), r1 = -zeta * omega + q, r2 = -zeta * omega - q
  return 1 - (r2 * Math.exp(r1 * tau) - r1 * Math.exp(r2 * tau)) / (r2 - r1)
}

/** d/dtau of `damped`, progress per second: squash from the speed of a spring. */
export function dampedVel(tau: number, zeta = 0.6, omega = 20): number {
  if (tau <= 0) return 0
  if (zeta < 1) {
    const s = Math.sqrt(1 - zeta * zeta)
    return (omega / s) * Math.exp(-zeta * omega * tau) * Math.sin(omega * s * tau)
  }
  if (zeta === 1) return omega * omega * tau * Math.exp(-omega * tau)
  const q = omega * Math.sqrt(zeta * zeta - 1), r1 = -zeta * omega + q, r2 = -zeta * omega - q
  return (omega * omega * (Math.exp(r1 * tau) - Math.exp(r2 * tau))) / (r1 - r2)
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

export const mix = (a: number, b: number, p: number) => a + (b - a) * p

/**
 * Eases as plain functions of p in [0, 1], named by their exponent: `out3` is GSAP's `power2.out` (GSAP's powerN is a
 * power of N + 1). A scene that draws every frame from the time (`defineScene`) needs no library for them.
 */
export const ease = {
  linear: (p: number) => p,
  in2: (p: number) => p * p,
  out2: (p: number) => 1 - (1 - p) ** 2,
  out3: (p: number) => 1 - (1 - p) ** 3,
  out4: (p: number) => 1 - (1 - p) ** 4,
  inOut2: (p: number) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2),
  inOut3: (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2),
  inOut5: (p: number) => (p < 0.5 ? 16 * p ** 5 : 1 - (-2 * p + 2) ** 5 / 2),
  /** smootherstep: a soft S for travel that starts and stops at rest. */
  smoother: (p: number) => p * p * p * (p * (p * 6 - 15) + 10),
  inOutSine: (p: number) => -(Math.cos(Math.PI * p) - 1) / 2,
  outExpo: (p: number) => (p >= 1 ? 1 : 1 - 2 ** (-10 * p)),
  /** Expo in-out: a whip, still at both ends and nearly all the travel in the middle. */
  inOutExpo: (p: number) => (p <= 0 ? 0 : p >= 1 ? 1 : p < 0.5 ? 2 ** (20 * p - 10) / 2 : (2 - 2 ** (-20 * p + 10)) / 2),
  /** back.out(s): passes 1 and comes back; s = 1.7 overshoots by about 10%. */
  backOut: (s = 1.7) => (p: number) => 1 + (s + 1) * (p - 1) ** 3 + s * (p - 1) ** 2,
}

/** A cubic-bezier(x1, y1, x2, y2) ease, solved for x by bisection, as CSS writes them. */
export function bezier(x1: number, y1: number, x2: number, y2: number): (p: number) => number {
  const at = (a: number, b: number, s: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3
  return p => {
    if (p <= 0) return 0
    if (p >= 1) return 1
    let lo = 0, hi = 1
    for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (at(x1, x2, mid) < p) lo = mid; else hi = mid }
    return at(y1, y2, (lo + hi) / 2)
  }
}
