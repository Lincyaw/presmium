import { remotionScene } from '@lincyaw/addon-motion/scene'

// A wipe between two panels, written by hand (no @remotion/transitions): two stacked AbsoluteFills, the top
// one revealed with clip-path inset(...) driven by interpolate with Easing.bezier; a bright edge rides the cut.
const BEFORE = [5, 1, 4, 2, 8, 3], AFTER = [...BEFORE].sort((a, b) => a - b)

export default remotionScene(({ React, remotion, at, durations, color }) => {
  const { AbsoluteFill, interpolate, Easing, useCurrentFrame } = remotion
  const h = React.createElement
  const fps = 30
  const F = (ms: number) => Math.round(ms * fps / 1000)
  const C = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
  const ink = color('ink'), muted = color('muted'), accent = color('accent'), ok = color('ok'), surface = color('surface'), sunk = color('sunk'), bg = color('bg')

  const Panel = (title: string, values: number[], fill: string, back: string) =>
    h(AbsoluteFill, { style: { background: back, alignItems: 'center', justifyContent: 'center', gap: 48, fontFamily: 'var(--pm-font-sans)', color: ink } },
      h('div', { style: { fontSize: 48, fontWeight: 700 } }, title),
      h('div', { style: { display: 'flex', gap: 24, alignItems: 'flex-end', height: 320 } },
        values.map((v, i) => h('div', { key: i, style: { width: 100, height: v * 38, borderRadius: 12, background: fill, color: bg, fontSize: 36, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 8, boxSizing: 'border-box' } }, String(v)))))

  function Wipe() {
    const frame = useCurrentFrame()
    const enter = interpolate(frame, [F(at(0)), F(at(0)) + 12], [0, 1], C)
    const p = interpolate(frame, [F(at(1)), F(at(1) + durations[1]! * 0.85)], [0, 100], { ...C, easing: Easing.bezier(0.65, 0, 0.35, 1) })
    return h(AbsoluteFill, { style: { background: bg } },
      h(AbsoluteFill, { style: { opacity: enter } }, Panel('排序前', BEFORE, muted, surface)),
      h(AbsoluteFill, { style: { clipPath: `inset(0 ${100 - p}% 0 0)` } }, Panel('排序后', AFTER, ok, sunk)),
      p > 0 && p < 100 && h('div', { style: { position: 'absolute', top: 0, bottom: 0, left: `${p}%`, width: 8, marginLeft: -4, background: accent } }))
  }

  return { component: Wipe, fps, width: 1280, height: 720 }
})
