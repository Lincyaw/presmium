// Speed made visible: trails and smears are earlier poses of the same function of time, so they stay exact under
// seeking (nothing is accumulated between frames).

/** The `n` earlier times a trail draws behind `t`, each `dt` apart, with the opacity of that copy (newest first). */
export function trail(t: number, n: number, dt: number, opacity = 0.5): { t: number, alpha: number }[] {
  return Array.from({ length: n }, (_, i) => ({ t: t - (i + 1) * dt, alpha: opacity * (1 - (i + 1) / (n + 1)) }))
}

/** How much a moving thing stretches along its motion at normalized speed v (1 = average): never more than `max`. */
export const smearScale = (v: number, max = 0.35) => 1 + Math.min(max, Math.max(0, v - 1) * 0.25)
