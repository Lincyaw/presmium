import { d3Scene } from '@lincyaw/addon-motion/scene'
import { H, W, axisStyle, clamp, phase, stage } from './kit/stage.ts'

// Scales and axes: a linear scale maps the data into the box, the axes redraw from the scale every frame,
// and zooming is just a new domain, interpolated with d3.interpolate. Seek-safe because the axis is re-called
// with the scale as it is at `ms` (no axis transition, which would run on D3's own timer).
export default d3Scene(({ root, d3, at, color }) => {
  const normal = d3.randomNormal.source(d3.randomLcg(7))(0, 5)
  const data = d3.range(90).map(i => {
    const x = 2 + i * 96 / 89
    return { x, y: 52 + 28 * Math.sin(x / 11) + normal() }
  })
  const m = { l: 52, r: 24, t: 20, b: 40 }
  const x = d3.scaleLinear([0, 100], [m.l, W - m.r])
  const y = d3.scaleLinear([0, 100], [H - m.b, m.t])
  const svg = stage(d3, root)
  svg.append('clipPath').attr('id', 'd3-axis-zoom-clip').append('rect')
    .attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', H - m.t - m.b)
  const gx = svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(axisStyle)
  const gy = svg.append('g').attr('transform', `translate(${m.l},0)`).call(axisStyle)
  const dots = svg.append('g').attr('clip-path', 'url(#d3-axis-zoom-clip)')
    .selectAll('circle').data(data).join('circle')
  const xAxis = d3.axisBottom(x).ticks(8)
  const yAxis = d3.axisLeft(y).ticks(6)
  const zoomX = d3.interpolate([0, 100], [8, 42])
  const zoomY = d3.interpolate([0, 100], [55, 95])
  // A second channel: colour from a sequential scale (the dark end of viridis is left out so it reads on both themes).
  const heat = d3.scaleSequential((t: number) => d3.interpolateViridis(0.25 + 0.75 * t)).domain(d3.extent(data, d => d.y) as [number, number])
  const r = d3.scaleSqrt().domain(d3.extent(data, d => d.y) as [number, number]).range([2.5, 8])
  const accent = color('accent')
  return (ms: number) => {
    const p = phase(at, ms)
    const z = d3.easeCubicInOut(p(1))
    x.domain(zoomX(z))
    y.domain(zoomY(z))
    gx.call(xAxis).attr('opacity', p(0, 0, 0.3))
    gy.call(yAxis).attr('opacity', p(0, 0, 0.3))
    const enc = d3.easeCubicInOut(p(2))
    dots
      .attr('cx', d => x(d.x))
      .attr('cy', d => y(d.y))
      .attr('r', (d, i) => d3.interpolateNumber(4, r(d.y))(enc) * d3.easeBackOut(clamp(p(0, 0.2, 1) * 1.6 - i / data.length * 0.6)))
      .attr('fill', d => d3.interpolateLab(accent, heat(d.y))(enc))
      .attr('fill-opacity', 0.85)
  }
})
