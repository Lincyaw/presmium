import { remotionScene } from '@lincyaw/addon-motion/scene'

// SVG path drawing: pathLength={1} plus strokeDasharray 1 and strokeDashoffset 1 - p draws any path
// without measuring it. The point and its tangent are computed from the function, not read from the DOM.
const W = 1000, H = 440, X0 = 140, Y0 = 140
const f = (x: number) => Math.sin(x) * 0.8 + 0.3 * Math.sin(3 * x)
const df = (x: number) => Math.cos(x) * 0.8 + 0.9 * Math.cos(3 * x)
const sx = (x: number) => X0 + x / (2 * Math.PI) * W
const sy = (y: number) => Y0 + H / 2 - y * H / 2.4
const CURVE = 'M' + Array.from({ length: 201 }, (_, i) => { const x = i / 200 * 2 * Math.PI; return `${sx(x).toFixed(1)},${sy(f(x)).toFixed(1)}` }).join(' L')

export default remotionScene(({ React, remotion, at, durations, color }) => {
  const { AbsoluteFill, interpolate, Easing, useCurrentFrame } = remotion
  const h = React.createElement
  const fps = 30
  const F = (ms: number) => Math.round(ms * fps / 1000)
  const C = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
  const ink = color('ink'), muted = color('muted'), accent = color('accent'), warn = color('warn'), line = color('line-strong'), bg = color('bg')

  function Draw() {
    const frame = useCurrentFrame()
    const a0 = F(at(0)), a1 = F(at(1))
    const axes = interpolate(frame, [a0, a0 + 10], [0, 1], C)
    const curve = interpolate(frame, [a0 + 6, F(at(0) + durations[0]! * 0.95)], [0, 1], { ...C, easing: Easing.inOut(Easing.cubic) })
    const x = interpolate(frame, [a1, F(at(1) + durations[1]! * 0.95)], [0.3, 2 * Math.PI - 0.3], { ...C, easing: Easing.inOut(Easing.sin) })
    const show = interpolate(frame, [a1, a1 + 6], [0, 1], C)
    const slope = df(x), len = 0.6
    const t1 = [sx(x - len), sy(f(x) - slope * len)], t2 = [sx(x + len), sy(f(x) + slope * len)]
    const draw = (p: number) => ({ pathLength: 1, strokeDasharray: 1, strokeDashoffset: 1 - p })
    return h(AbsoluteFill, { style: { background: bg } },
      h('svg', { viewBox: '0 0 1280 720', width: 1280, height: 720, style: { fontFamily: 'var(--pm-font-mono)' } },
        h('path', { d: `M${X0},${Y0 + H / 2} H${X0 + W}`, stroke: line, strokeWidth: 3, fill: 'none', ...draw(axes) }),
        h('path', { d: `M${X0},${Y0 + H} V${Y0}`, stroke: line, strokeWidth: 3, fill: 'none', ...draw(axes) }),
        h('path', { d: CURVE, stroke: accent, strokeWidth: 6, fill: 'none', strokeLinecap: 'round', ...draw(curve) }),
        h('g', { opacity: show },
          h('line', { x1: t1[0], y1: t1[1], x2: t2[0], y2: t2[1], stroke: warn, strokeWidth: 4 }),
          h('circle', { cx: sx(x), cy: sy(f(x)), r: 12, fill: warn }),
          h('text', { x: 1280 / 2, y: 660, textAnchor: 'middle', fontSize: 34, fill: ink }, `斜率 f′(x) = ${slope.toFixed(2)}`)),
        h('text', { x: X0 + W + 16, y: Y0 + H / 2 + 10, fontSize: 28, fill: muted, opacity: axes }, 'x')))
  }

  return { component: Draw, fps, width: 1280, height: 720 }
})
