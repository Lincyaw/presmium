import { remotionScene } from '@lincyaw/addon-motion/scene'

// Easing: the same interpolate with seven easing functions. Each row draws its curve (sampled from the easing)
// and a dot that follows it; back and elastic leave [0, 1], so they overshoot the finish line.
export default remotionScene(({ React, remotion, at, durations, color }) => {
  const { AbsoluteFill, interpolate, Easing, useCurrentFrame } = remotion
  const h = React.createElement
  const fps = 30
  const F = (ms: number) => Math.round(ms * fps / 1000)
  const C = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
  const ink = color('ink'), muted = color('muted'), accent = color('accent'), line = color('line'), bg = color('bg')
  const ROWS: { label: string, ease: (t: number) => number, step: number }[] = [
    { label: 'linear', ease: Easing.linear, step: 0 },
    { label: 'inOut(cubic)', ease: Easing.inOut(Easing.cubic), step: 0 },
    { label: 'out(exp)', ease: Easing.out(Easing.exp), step: 0 },
    { label: 'bezier(.7,0,.3,1)', ease: Easing.bezier(0.7, 0, 0.3, 1), step: 0 },
    { label: 'back(1.7)', ease: Easing.out(Easing.back(1.7)), step: 1 },
    { label: 'elastic(1)', ease: Easing.out(Easing.elastic(1)), step: 1 },
    { label: 'bounce', ease: Easing.bounce, step: 1 },
  ]
  const X0 = 520, X1 = 1140

  function Curves() {
    const frame = useCurrentFrame()
    return h(AbsoluteFill, { style: { background: bg, fontFamily: 'var(--pm-font-mono)', color: ink } },
      h('div', { style: { position: 'absolute', left: X1, top: 40, bottom: 40, width: 3, background: line } }),
      ROWS.map((row, i) => {
        const k = row.step
        const window = [F(at(k)) + 2, F(at(k) + durations[k]! * 0.9)] as const
        const t = interpolate(frame, window, [0, 1], C)
        const v = interpolate(frame, window, [0, 1], { ...C, easing: row.ease })
        const y = 70 + i * 90
        const curve = 'M' + Array.from({ length: 41 }, (_, j) => `${130 + j * 2.5},${y + 30 - row.ease(j / 40) * 50}`).join(' L')
        const active = frame >= window[0]
        return h(React.Fragment, { key: i },
          h('div', { style: { position: 'absolute', left: 260, top: y - 6, fontSize: 26, color: active ? ink : muted } }, row.label),
          h('svg', { viewBox: '0 0 1280 720', width: 1280, height: 720, style: { position: 'absolute', left: 0, top: 0, overflow: 'visible' } },
            h('path', { d: curve, fill: 'none', stroke: active ? accent : muted, strokeWidth: 3 }),
            h('circle', { cx: 130 + t * 100, cy: y + 30 - row.ease(t) * 50, r: 5, fill: ink, opacity: active ? 1 : 0 })),
          h('div', { style: { position: 'absolute', left: X0 + (X1 - X0) * v - 22, top: y - 2, width: 44, height: 44, borderRadius: '50%', background: active ? accent : line } }))
      }))
  }

  return { component: Curves, fps, width: 1280, height: 720 }
})
