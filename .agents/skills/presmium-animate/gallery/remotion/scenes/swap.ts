import { remotionScene } from '@lincyaw/addon-motion/scene'

// A bubble-sort swap: interpolateColors marks the compared pair, the two boxes trade places along arcs
// (x eased, y = sin(πp) up for one and down for the other), and the settled pair turns "ok".
const VALUES = [5, 3, 8, 1, 6]
const I = 0, J = 1

export default remotionScene(({ React, remotion, at, durations, color }) => {
  const { AbsoluteFill, interpolate, interpolateColors, Easing, useCurrentFrame } = remotion
  const h = React.createElement
  const fps = 30
  const F = (ms: number) => Math.round(ms * fps / 1000)
  const C = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
  const ink = color('ink'), muted = color('muted'), accent = color('accent'), ok = color('ok'), surface = color('surface'), line = color('line-strong'), bg = color('bg')
  const X = (slot: number) => 200 + slot * 190

  function Swap() {
    const frame = useCurrentFrame()
    const appear = interpolate(frame, [F(at(0)), F(at(0)) + 8], [0, 1], C)
    const compare = interpolate(frame, [F(at(0)) + 6, F(at(0)) + 16], [0, 1], C)
    const p = interpolate(frame, [F(at(1)), F(at(1) + durations[1]! * 0.9)], [0, 1], { ...C, easing: Easing.inOut(Easing.cubic) })
    const settle = interpolate(frame, [F(at(2)), F(at(2)) + 10], [0, 1], C)
    const pair = interpolateColors(settle, [0, 1], [interpolateColors(compare, [0, 1], [surface, accent]), ok])
    return h(AbsoluteFill, { style: { background: bg, fontFamily: 'var(--pm-font-sans)', color: ink, opacity: appear } },
      h('div', { style: { position: 'absolute', top: 90, width: '100%', textAlign: 'center', fontSize: 40, color: muted } },
        settle > 0.5 ? '已交换：较大的 5 向右冒了一格' : p > 0 ? '交换' : `比较 ${VALUES[I]} 和 ${VALUES[J]}：${VALUES[I]} > ${VALUES[J]}`),
      VALUES.map((v, i) => {
        const inPair = i === I || i === J
        const to = i === I ? J : i === J ? I : i
        const x = interpolate(p, [0, 1], [X(i), X(to)])
        const y = inPair ? Math.sin(Math.PI * p) * 140 * (i === I ? -1 : 1) : 0
        return h('div', { key: i, style: { position: 'absolute', left: x, top: 300 + y, width: 150, height: 150, borderRadius: 20, background: inPair ? pair : surface, border: `3px solid ${inPair ? 'transparent' : line}`, color: inPair && (compare > 0.5) ? bg : ink, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 64, fontWeight: 700, fontFamily: 'var(--pm-font-mono)' } }, String(v))
      }))
  }

  return { component: Swap, fps, width: 1280, height: 720 }
})
