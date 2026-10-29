// Time maths of the motion-showcase scenes beyond the kit's (`kit/fx/time.ts`: phases, eases, springs): a throw
// that overshoots and snaps back.

/**
 * A throw that loses speed, passes its target by `over` (a share of the whole travel) and comes back to it with
 * zero speed: f(p) = 1 − (1 − p)²(1 − a·p), `a` found by bisection. Starts at full speed, so it reads as a flick.
 */
export function throwEase(over: number): (p: number) => number {
  const peak = (a: number) => { const p = (2 + a) / (3 * a); return (1 - p) ** 2 * (a * p - 1) }
  let lo = 1, hi = 3
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (peak(mid) < over) lo = mid; else hi = mid }
  const a = (lo + hi) / 2
  return p => 1 - (1 - p) ** 2 * (1 - a * p)
}

