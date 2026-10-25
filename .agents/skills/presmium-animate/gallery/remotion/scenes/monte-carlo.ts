import { remotionScene } from '@lincyaw/addon-motion/scene'

// Seeded particles: random(seed) from remotion returns the same number on every frame, so 600 sample points
// stay put when you seek back (Math.random would reshuffle them each frame). Points appear in index order.
const N = 600

export default remotionScene(({ React, remotion, at, durations, color }) => {
  const { AbsoluteFill, interpolate, random, useCurrentFrame } = remotion
  const h = React.createElement
  const fps = 30
  const F = (ms: number) => Math.round(ms * fps / 1000)
  const C = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
  const ink = color('ink'), muted = color('muted'), accent = color('accent'), warn = color('warn'), line = color('line-strong'), surface = color('surface'), bg = color('bg')
  const POINTS = Array.from({ length: N }, (_, i) => { const x = random(`x${i}`), y = random(`y${i}`); return { x, y, inside: x * x + y * y <= 1 } })
  const S = 560, X0 = 120, Y0 = 80

  function MonteCarlo() {
    const frame = useCurrentFrame()
    const shown = Math.floor(interpolate(frame, [F(at(0)), F(at(0) + durations[0]! * 0.92)], [0, N], C))
    const inside = POINTS.slice(0, shown).filter(p => p.inside).length
    const estimate = shown ? 4 * inside / shown : 0
    const arc = interpolate(frame, [F(at(1)), F(at(1)) + 15], [0, 1], C)
    return h(AbsoluteFill, { style: { background: bg, fontFamily: 'var(--pm-font-sans)', color: ink } },
      h('svg', { viewBox: '0 0 1280 720', width: 1280, height: 720 },
        h('rect', { x: X0, y: Y0, width: S, height: S, fill: surface, stroke: line, strokeWidth: 3 }),
        POINTS.slice(0, shown).map((p, i) => h('circle', { key: i, cx: X0 + p.x * S, cy: Y0 + S - p.y * S, r: 5, fill: p.inside ? accent : muted, opacity: 0.85 })),
        h('path', { d: `M${X0 + S},${Y0 + S} A${S},${S} 0 0 0 ${X0},${Y0}`, fill: 'none', stroke: warn, strokeWidth: 6, pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - arc })),
      h('div', { style: { position: 'absolute', left: 760, top: 200, fontSize: 36, lineHeight: 1.7 } },
        h('div', null, `样本 ${shown}`),
        h('div', { style: { color: accent } }, `圆内 ${inside}`),
        h('div', { style: { fontSize: 56, fontWeight: 700, fontVariantNumeric: 'tabular-nums' } }, `π ≈ ${estimate.toFixed(3)}`),
        h('div', { style: { color: muted, fontSize: 30, opacity: arc } }, `4 × 圆内 / 样本，真值 3.142`)))
  }

  return { component: MonteCarlo, fps, width: 1280, height: 720 }
})
