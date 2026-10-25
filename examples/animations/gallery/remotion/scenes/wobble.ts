import { remotionScene } from '@lincyaw/addon-motion/scene'

// Sine wobble without a noise package: each atom moves by amp * sin(2πft + phase), with the phase from
// random(seed). The amplitude and color follow the "temperature" (interpolate + interpolateColors).
const COLS = 9, ROWS = 5

export default remotionScene(({ React, remotion, at, color }) => {
  const { AbsoluteFill, interpolate, interpolateColors, random, useCurrentFrame } = remotion
  const h = React.createElement
  const fps = 30
  const F = (ms: number) => Math.round(ms * fps / 1000)
  const C = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
  const ink = color('ink'), muted = color('muted'), accent = color('accent'), danger = color('danger'), line = color('line'), bg = color('bg')

  function Lattice() {
    const frame = useCurrentFrame()
    const t = frame / fps
    const heat = interpolate(frame, [F(at(1)), F(at(1)) + 20], [0, 1], C)
    const appear = interpolate(frame, [F(at(0)), F(at(0)) + 10], [0, 1], C)
    const amp = interpolate(heat, [0, 1], [4, 22])
    const fill = interpolateColors(heat, [0, 1], [accent, danger])
    const atoms = Array.from({ length: COLS * ROWS }, (_, i) => {
      const c = i % COLS, r = Math.floor(i / COLS)
      const fx = 1.5 + random(`f${i}`), px = random(`px${i}`) * 2 * Math.PI, py = random(`py${i}`) * 2 * Math.PI
      return { x: 200 + c * 110 + amp * Math.sin(2 * Math.PI * fx * t + px), y: 170 + r * 95 + amp * Math.sin(2 * Math.PI * fx * 1.3 * t + py) }
    })
    return h(AbsoluteFill, { style: { background: bg, fontFamily: 'var(--pm-font-sans)', color: ink } },
      h('svg', { viewBox: '0 0 1280 720', width: 1280, height: 720, opacity: appear },
        atoms.map((a, i) => i % COLS < COLS - 1 && h('line', { key: `h${i}`, x1: a.x, y1: a.y, x2: atoms[i + 1]!.x, y2: atoms[i + 1]!.y, stroke: line, strokeWidth: 3 })),
        atoms.map((a, i) => i + COLS < atoms.length && h('line', { key: `v${i}`, x1: a.x, y1: a.y, x2: atoms[i + COLS]!.x, y2: atoms[i + COLS]!.y, stroke: line, strokeWidth: 3 })),
        atoms.map((a, i) => h('circle', { key: i, cx: a.x, cy: a.y, r: 22, fill })),
      ),
      h('div', { style: { position: 'absolute', top: 40, width: '100%', textAlign: 'center', fontSize: 40 } },
        '温度 ', h('span', { style: { color: fill, fontWeight: 700, fontVariantNumeric: 'tabular-nums' } }, `${Math.round(interpolate(heat, [0, 1], [20, 800]))} K`),
        h('span', { style: { color: muted, fontSize: 30 } }, `  振幅 ${amp.toFixed(0)}`)))
  }

  return { component: Lattice, fps, width: 1280, height: 720 }
})
