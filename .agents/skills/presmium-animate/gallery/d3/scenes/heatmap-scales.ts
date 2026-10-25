import { d3Scene } from '@lincyaw/addon-motion/scene'
import { H, W, axisStyle, phase, stage } from './kit/stage.ts'

// Colour scales: the same matrix through d3.scaleSequential (viridis), d3.scaleDiverging (RdBu, centred on 0)
// and d3.scaleQuantize (seven classes). Cells blend between scales with d3.interpolateLab; the legend is a strip of
// rects plus an axis. Seek-safe: every cell's colour at `ms` is computed from the two scales around it.
export default d3Scene(({ root, d3, at, color }) => {
  const cols = 28, rows = 12
  const cells = d3.cross(d3.range(rows), d3.range(cols)).map(([r, c]) => ({ r, c, v: Math.sin(c / 4.2) * Math.cos(r / 3.1) + 0.35 * Math.sin((c + r) / 6) }))
  const ext = d3.extent(cells, d => d.v) as [number, number]
  const lim = Math.max(-ext[0], ext[1])
  const seq = d3.scaleSequential(d3.interpolateViridis).domain(ext)
  const div = d3.scaleDiverging(d3.interpolateRdBu).domain([lim, 0, -lim])
  const qua = d3.scaleQuantize<string>().domain([-lim, lim]).range([...d3.schemeRdBu[7]!].reverse())
  const scales = [seq, div, qua] as ((v: number) => string)[]
  const NAMES = ['scaleSequential · interpolateViridis', 'scaleDiverging · interpolateRdBu', 'scaleQuantize · schemeRdBu[7]']
  const m = { l: 30, t: 40 }
  const size = 20
  const svg = stage(d3, root)
  const rects = svg.append('g').selectAll('rect').data(cells).join('rect')
    .attr('x', d => m.l + d.c * size).attr('y', d => m.t + d.r * size).attr('width', size - 1).attr('height', size - 1).attr('rx', 2)
  const title = svg.append('text').attr('x', m.l).attr('y', 26).attr('font-family', 'var(--pm-font-mono)').attr('font-size', 14).attr('fill', color('muted'))
  const lx = d3.scaleLinear([-lim, lim], [m.l + 140, m.l + cols * size - 140])
  const stops = d3.range(-lim, lim, (2 * lim) / 120)
  const legend = svg.append('g').attr('transform', `translate(0,${m.t + rows * size + 16})`)
  const strip = legend.selectAll('rect').data(stops).join('rect').attr('x', d => lx(d)).attr('width', (lx.range()[1]! - lx.range()[0]!) / 120 + 0.5).attr('height', 14)
  legend.append('g').attr('transform', 'translate(0,14)').call(d3.axisBottom(lx).ticks(7, '+.1f')).call(axisStyle)
  const blend = (a: number, b: number, t: number, v: number) => (t <= 0 ? scales[a]!(v) : t >= 1 ? scales[b]!(v) : d3.interpolateLab(scales[a]!(v), scales[b]!(v))(t))
  const blank = color('sunk')
  return (ms: number) => {
    const p = phase(at, ms)
    const fill = p(0)
    const t1 = d3.easeCubicInOut(p(1)), t2 = d3.easeCubicInOut(p(2))
    const now = (v: number) => (t2 > 0 ? blend(1, 2, t2, v) : blend(0, 1, t1, v))
    // Step 0: the cells fill along a diagonal sweep.
    rects.attr('fill', d => {
      const local = Math.max(0, Math.min(1, fill * 1.6 - ((d.c + d.r) / (cols + rows)) * 0.6) * 1)
      return local <= 0 ? blank : d3.interpolateLab(blank, now(d.v))(Math.min(1, local * 3))
    })
    strip.attr('fill', d => now(d))
    title.text(NAMES[t2 >= 0.5 ? 2 : t1 >= 0.5 ? 1 : 0]!)
  }
})
