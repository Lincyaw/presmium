import { remotionScene } from '@lincyaw/addon-motion/scene'

// Freeze: its children see one fixed frame while it is active. The projectile flies in step 0; in step 1
// Freeze (active from that step) holds it at the apex while velocity arrows draw over the still picture.
const G = 9.8, VX = 6, VY = 9.8, TFLIGHT = 2 * VY / G

export default remotionScene(({ React, remotion, at, durations, color }) => {
  const { AbsoluteFill, Freeze, interpolate, useCurrentFrame } = remotion
  const h = React.createElement
  const fps = 30
  const F = (ms: number) => Math.round(ms * fps / 1000)
  const C = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const
  const ink = color('ink'), muted = color('muted'), accent = color('accent'), warn = color('warn'), line = color('line-strong'), bg = color('bg')
  const flight = [F(at(0)), F(at(0) + durations[0]! * 0.95)] as const
  const apexFrame = Math.round((flight[0] + flight[1]) / 2)
  const sx = (x: number) => 140 + x * 80, sy = (y: number) => 600 - y * 80
  const pos = (t: number) => ({ x: VX * t, y: VY * t - G * t * t / 2 })

  function Projectile() {
    const frame = useCurrentFrame() // the frozen frame inside <Freeze>
    const t = interpolate(frame, flight, [0, TFLIGHT], C)
    const trail = Array.from({ length: 41 }, (_, i) => pos(t * i / 40)).map(p => `${sx(p.x)},${sy(p.y)}`).join(' ')
    const p = pos(t)
    return h('svg', { viewBox: '0 0 1280 720', width: 1280, height: 720, style: { position: 'absolute' } },
      h('polyline', { points: trail, fill: 'none', stroke: muted, strokeWidth: 3, strokeDasharray: '10 10' }),
      h('circle', { cx: sx(p.x), cy: sy(p.y), r: 22, fill: accent }))
  }

  function Scene() {
    const frame = useCurrentFrame()
    const arrows = interpolate(frame, [F(at(1)) + 4, F(at(1)) + 20], [0, 1], C)
    const apex = pos(TFLIGHT / 2)
    const ax = sx(apex.x), ay = sy(apex.y)
    return h(AbsoluteFill, { style: { background: bg, fontFamily: 'var(--pm-font-sans)', color: ink } },
      h('div', { style: { position: 'absolute', left: 100, right: 100, top: 600, height: 4, background: line } }),
      h(Freeze, { frame: apexFrame, active: (f: number) => f >= F(at(1)) }, h(Projectile)),
      h('svg', { viewBox: '0 0 1280 720', width: 1280, height: 720, style: { position: 'absolute', opacity: arrows } },
        h('defs', null, h('marker', { id: 'rm-head', viewBox: '0 0 10 10', refX: 8, refY: 5, markerWidth: 6, markerHeight: 6, orient: 'auto' }, h('path', { d: 'M0,0 L10,5 L0,10 z', fill: warn }))),
        h('line', { x1: ax, y1: ay, x2: ax + 200 * arrows, y2: ay, stroke: warn, strokeWidth: 6, markerEnd: 'url(#rm-head)' }),
        h('text', { x: ax + 70, y: ay - 30, fontSize: 34, fill: ink }, 'vₓ = 6 m/s'),
        h('text', { x: ax - 60, y: ay + 80, fontSize: 34, fill: ink }, 'v_y = 0（最高点）')),
      h('div', { style: { position: 'absolute', top: 40, right: 60, fontSize: 30, color: muted, fontFamily: 'var(--pm-font-mono)' } }, frame >= F(at(1)) ? `<Freeze frame={${apexFrame}}>` : `frame ${frame}`))
  }

  return { component: Scene, fps, width: 1280, height: 720 }
})
