import { d3Scene } from '@lincyaw/addon-motion/scene'
import { H, W, axisStyle, phase, stage } from './kit/stage.ts'

// A time series with d3.scaleTime, d3.line and d3.area: the line draws itself (pathLength=1 and a dash offset,
// so no getTotalLength at build), a cursor reads values with d3.bisector, then the area fills in.
// Seek-safe: the cursor's value is interpolated from the data at `ms`, never from a mouse event.
export default d3Scene(({ root, d3, at, color }) => {
  const walk = d3.randomNormal.source(d3.randomLcg(3))(0.35, 2.2)
  const start = new Date(2024, 0, 1)
  let v = 40
  const data = d3.range(120).map(i => ({ date: d3.timeDay.offset(start, i * 3), value: (v = Math.max(5, v + walk())) }))
  const m = { l: 48, r: 24, t: 24, b: 36 }
  const x = d3.scaleTime(d3.extent(data, d => d.date) as [Date, Date], [m.l, W - m.r])
  const y = d3.scaleLinear([0, d3.max(data, d => d.value)!], [H - m.b, m.t]).nice()
  const svg = stage(d3, root)
  svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(6).tickFormat(d3.timeFormat('%b') as never)).call(axisStyle)
  svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(5)).call(axisStyle)
    .call(g => g.selectAll('.tick line').clone().attr('x2', W - m.l - m.r).attr('stroke-opacity', 0.15))
  const area = svg.append('path').datum(data).attr('fill', color('accent')).attr('d', d3.area<typeof data[0]>().x(d => x(d.date)).y0(y(0)).y1(d => y(d.value)).curve(d3.curveMonotoneX))
  const line = svg.append('path').datum(data).attr('fill', 'none').attr('stroke', color('accent')).attr('stroke-width', 2.5)
    .attr('stroke-linejoin', 'round').attr('pathLength', 1).attr('stroke-dasharray', '1 1')
    .attr('d', d3.line<typeof data[0]>().x(d => x(d.date)).y(d => y(d.value)).curve(d3.curveMonotoneX))
  const cursor = svg.append('g')
  const rule = cursor.append('line').attr('y1', m.t).attr('y2', H - m.b).attr('stroke', color('muted')).attr('stroke-dasharray', '3 3')
  const dot = cursor.append('circle').attr('r', 5).attr('fill', color('bg')).attr('stroke', color('accent')).attr('stroke-width', 2.5)
  const tip = cursor.append('g')
  const box = tip.append('rect').attr('rx', 6).attr('fill', color('surface')).attr('stroke', color('line-strong')).attr('height', 44).attr('width', 112)
  const label = tip.append('text').attr('font-size', 13).attr('fill', color('ink'))
  const l1 = label.append('tspan').attr('x', 10).attr('y', 18).attr('fill', color('muted'))
  const l2 = label.append('tspan').attr('x', 10).attr('y', 36).attr('font-family', 'var(--pm-font-mono)').attr('font-weight', 600)
  const bisect = d3.bisector((d: typeof data[0]) => d.date).center
  const fmtDate = d3.timeFormat('%Y-%m-%d'), fmtValue = d3.format('.1f')
  return (ms: number) => {
    const p = phase(at, ms)
    line.attr('stroke-dashoffset', 1 - d3.easeCubicInOut(p(0)))
    // The cursor sweeps the time axis; the date comes from x.invert, the point from the bisector.
    const s = d3.easeSinInOut(p(1))
    const date = x.invert(d3.interpolateNumber(x(data[8]!.date), x(data[110]!.date))(s))
    const d = data[bisect(data, date)]!
    cursor.attr('opacity', Math.min(p(1, 0, 0.15), 1 - p(2, 0.7, 1)))
    rule.attr('x1', x(d.date)).attr('x2', x(d.date))
    dot.attr('cx', x(d.date)).attr('cy', y(d.value))
    const left = x(d.date) > W - 150
    tip.attr('transform', `translate(${x(d.date) + (left ? -124 : 12)},${Math.max(m.t, y(d.value) - 60)})`)
    l1.text(fmtDate(d.date)); l2.text(fmtValue(d.value))
    box.attr('width', 112)
    area.attr('fill-opacity', 0.22 * d3.easeCubicOut(p(2)))
  }
})
