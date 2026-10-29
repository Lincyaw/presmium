import { d3Scene } from '@lincyaw/addon-motion/scene'
import type { ScaleBand } from 'd3'
import { defId, phaser, stage } from '../../../lengths/scenes/kit/d3-fx.ts'

// Chart story, with D3: one small chart builds from its data in reading order and lands on one accented value.
// `kind` picks the form: `bars` (default), `line`, `donut` or `progress`. Three states, 5 s by default.
// `frame` (1 s): the title, then the encoding: the zero baseline and gridlines draw left to right (0.5 s), the
// category labels fade in left to right (or top to bottom), so the reader knows how to read before any value moves.
// `build` (1.8 s): the values arrive in reading order, 80 ms apart, each in about one second (cubic in-out, no
// overshoot: data never overshoots). Bars grow from zero with their number counting on top (one clock, two
// readouts); a line is drawn by a head that carries the value, and each point pops as the head passes it; donut
// segments sweep one after another around the ring; progress bars fill from the left with their percentages.
// `emphasis` (2.2 s): every other datum steps back to a light grey, the chosen one takes the accent (colour on
// landing) and its value appears in a callout above it, 0.45 s; at least 1.5 s of rest on the result.
// Bars and areas start at zero; the source line under the chart says "示意数据" unless real data is given with its
// source. Numbers are tabular so they do not jitter while counting. Merges HyperFrames animated-bar-chart,
// data-chart and mk-line-graph (a bar or line card with value labels). Adapted from HyperFrames chart-story.
type Kind = 'bars' | 'line' | 'donut' | 'progress'
const W = 1280, H = 720

export default d3Scene(({ root, d3, at, color, parameters }) => {
  const kind = (['bars', 'line', 'donut', 'progress'].includes(parameters.kind as string) ? parameters.kind : 'bars') as Kind
  const data = (Array.isArray(parameters.data) ? (parameters.data as number[]) : [62, 71, 78, 86]).map(Number)
  const labels = Array.isArray(parameters.labels) ? (parameters.labels as string[]) : ['第 1 章', '第 2 章', '第 3 章', '第 4 章']
  const title = typeof parameters.title === 'string' ? parameters.title : '各章测验平均分'
  const unit = typeof parameters.unit === 'string' ? parameters.unit : (kind === 'bars' ? '分' : '')
  const source = typeof parameters.source === 'string' ? parameters.source : '示意数据'
  const hi = Math.max(0, Math.min(data.length - 1, Math.round(Number(parameters.emphasize ?? data.length - 1))))
  const decimals = Math.max(0, ...data.map(v => (String(v).split('.')[1] ?? '').length))
  const fmt = (v: number) => v.toFixed(decimals)

  const ink = color('ink'), muted = color('muted'), accent = color('accent'), line = color('line')
  const neutral = color('line-strong')
  const faded = d3.interpolateRgb(line, color('line-strong'))(0.35)
  const svg = stage(d3, root).style('font-variant-numeric', 'tabular-nums')
  const ph = phaser(at)
  const ease = d3.easeCubicInOut
  const n = data.length
  const M = { l: 150, r: 120, t: 150, b: 120 }
  const titleEl = svg.append('text').attr('x', M.l).attr('y', 78).attr('font-size', 38).attr('font-weight', 600).attr('fill', ink).text(title)
  const sourceEl = svg.append('text').attr('x', M.l).attr('y', H - 34).attr('font-size', 20).attr('fill', muted).text(source)
  const MONO = 'var(--pm-font-mono)'

  // Each datum's progress in `build`: staggered 80 ms, about one second each, eased.
  const grow = (ms: number, i: number) => ease(Math.max(0, Math.min(1, (ms - at(1) - i * 80) / Math.min(1000, at(2) - at(1) - (n - 1) * 80 - 100))))
  const emph = (ms: number) => d3.easeCubicOut(ph(ms, 2, 0, 0.25))
  const pop = (ms: number) => d3.easeBackOut.overshoot(1.6)(ph(ms, 2, 0.1, 0.3))
  const tint = (i: number, ms: number, base = neutral) => i === hi ? d3.interpolateRgb(base, accent)(emph(ms)) : d3.interpolateRgb(base, faded)(emph(ms))

  // The callout: the emphasized value with its unit, in a pill.
  const callout = svg.append('g').attr('opacity', 0)
  const pillW = 36 + (fmt(data[hi]!) + unit).length * 22
  callout.append('rect').attr('x', -pillW / 2).attr('y', -58).attr('width', pillW).attr('height', 50).attr('rx', 25).attr('fill', accent)
  callout.append('text').attr('y', -24).attr('text-anchor', 'middle').attr('font-family', MONO).attr('font-size', 28).attr('font-weight', 500).attr('fill', color('on-accent')).text(fmt(data[hi]!) + unit)
  const showCallout = (ms: number, x: number, y: number) => {
    const p = pop(ms)
    callout.attr('opacity', ph(ms, 2, 0.1, 0.2)).attr('transform', `translate(${x}, ${y}) scale(${0.6 + 0.4 * p})`)
  }

  if (kind === 'bars' || kind === 'line') {
    const top = d3.scaleLinear().domain([0, d3.max(data)! * 1.1]).nice()
    const y = top.range([H - M.b, M.t])
    const x = kind === 'bars'
      ? d3.scaleBand<number>().domain(d3.range(n)).range([M.l, W - M.r]).paddingInner(0.35).paddingOuter(0.2)
      : d3.scalePoint<number>().domain(d3.range(n)).range([M.l + 40, W - M.r - 40])
    const bw = kind === 'bars' ? (x as ScaleBand<number>).bandwidth() : 0
    const cx = (i: number) => x(i)! + bw / 2
    const ticks = y.ticks(4)
    const grid = svg.append('g').selectAll('line').data(ticks).join('line').attr('x1', M.l).attr('y1', d => y(d)).attr('y2', d => y(d))
      .attr('stroke', (d) => (d === 0 ? color('line-strong') : line)).attr('stroke-width', d => (d === 0 ? 2.5 : 1.5))
    const tickText = svg.append('g').selectAll('text').data(ticks).join('text').attr('x', M.l - 18).attr('y', d => y(d) + 7)
      .attr('text-anchor', 'end').attr('font-family', MONO).attr('font-size', 20).attr('fill', muted).text(d => String(d))
    const names = svg.append('g').selectAll('text').data(labels.slice(0, n)).join('text').attr('x', (_, i) => cx(i)).attr('y', H - M.b + 42)
      .attr('text-anchor', 'middle').attr('font-size', 24).attr('fill', muted).text(d => d)
    const marks = kind === 'bars'
      ? svg.append('g').selectAll('rect').data(data).join('rect').attr('x', (_, i) => x(i)!).attr('width', bw).attr('rx', 6)
      : null
    const values = svg.append('g').selectAll('text').data(data).join('text')
      .attr('text-anchor', 'middle').attr('font-family', MONO).attr('font-size', 26).attr('font-weight', 500)
    // The line: drawn with pathLength 1, a head dot riding its tip, a soft area under it that fades in after.
    const pts = data.map((v, i) => [cx(i), y(v)] as [number, number])
    const areaId = defId('chart-area')
    const area = kind === 'line' ? svg.insert('path', 'g').attr('d', d3.area<[number, number]>().x(p => p[0]).y0(y(0)).y1(p => p[1]).curve(d3.curveMonotoneX)(pts)).attr('fill', `url(#${areaId})`) : null
    if (kind === 'line') {
      const g = svg.append('defs').append('linearGradient').attr('id', areaId).attr('x1', 0).attr('x2', 0).attr('y1', 0).attr('y2', 1)
      g.append('stop').attr('offset', 0).attr('stop-color', neutral).attr('stop-opacity', 0.25)
      g.append('stop').attr('offset', 1).attr('stop-color', neutral).attr('stop-opacity', 0)
    }
    const path = kind === 'line' ? svg.append('path').attr('d', d3.line().curve(d3.curveMonotoneX)(pts)).attr('fill', 'none').attr('stroke', neutral)
      .attr('stroke-width', 5).attr('stroke-linecap', 'round').attr('pathLength', 1).attr('stroke-dasharray', '1 1') : null
    const dots = kind === 'line' ? svg.append('g').selectAll('circle').data(pts).join('circle').attr('cx', p => p[0]).attr('cy', p => p[1]) : null
    // Where the head is at progress p: the drawn length along x, read back from the points (monotone in x).
    const headX = d3.scaleLinear().domain([0, 1]).range([pts[0]![0], pts[n - 1]![0]])

    return (ms: number) => {
      titleEl.attr('opacity', ph(ms, 0, 0, 0.3))
      sourceEl.attr('opacity', ph(ms, 0, 0.5, 0.8))
      grid.attr('x2', M.l + (W - M.r - M.l) * d3.easeCubicInOut(ph(ms, 0, 0.1, 0.6)))
      tickText.attr('opacity', ph(ms, 0, 0.3, 0.6))
      names.attr('opacity', (_, i) => ph(ms, 0, 0.45 + i * 0.06, 0.75 + i * 0.06))
      if (marks) {
        marks.attr('y', (v, i) => y(v * grow(ms, i))).attr('height', (v, i) => y(0) - y(v * grow(ms, i))).attr('fill', (_, i) => tint(i, ms))
        values.attr('x', (_, i) => cx(i)).attr('y', (v, i) => y(v * grow(ms, i)) - 14).text((v, i) => fmt(v * grow(ms, i)))
          .attr('opacity', (_, i) => Math.min(grow(ms, i) * 4, 1) * (i === hi ? 1 - ph(ms, 2, 0.05, 0.15) : 1)).attr('fill', muted)
        showCallout(ms, cx(hi), y(data[hi]!) - 4)
      } else {
        const p = d3.easeCubicInOut(ph(ms, 1, 0, 0.85))
        path!.attr('stroke-dashoffset', 1 - p)
        area!.attr('opacity', ph(ms, 1, 0.75, 1))
        const hx = headX(p)
        dots!.attr('r', (pt, i) => (pt[0] <= hx + 0.5 ? 7 * d3.easeBackOut(Math.min(1, (hx - pt[0]) / 60 + 0.4)) : 0) * (i === hi ? 1 + 0.6 * emph(ms) : 1))
          .attr('fill', (_, i) => tint(i, ms)).attr('stroke', color('bg')).attr('stroke-width', 3)
        values.attr('x', (_, i) => cx(i)).attr('y', (_, i) => pts[i]![1] - 22).text(v => fmt(v)).attr('fill', muted)
          .attr('opacity', (_, i) => (pts[i]![0] <= hx + 0.5 ? 1 : 0) * (i === hi ? 1 - ph(ms, 2, 0.05, 0.15) : 1 - 0.5 * emph(ms)))
        showCallout(ms, cx(hi), pts[hi]![1] - 14)
      }
    }
  }

  if (kind === 'donut') {
    const total = d3.sum(data), cx = W / 2 - 160, cy = H / 2 + 30, r0 = 150, r1 = 220
    const pie = d3.pie<number>().sort(null).value(v => v)(data)
    const arc = d3.arc<{ startAngle: number, endAngle: number }>().innerRadius(r0).outerRadius(r1).padAngle(0.012).cornerRadius(4)
    const g = svg.append('g').attr('transform', `translate(${cx}, ${cy})`)
    const track = g.append('circle').attr('r', (r0 + r1) / 2).attr('fill', 'none').attr('stroke', line).attr('stroke-width', r1 - r0)
    const shades = (i: number) => d3.interpolateRgb(color('line-strong'), ink)(0.15 + 0.5 * (i / Math.max(1, n - 1)))
    const segs = g.selectAll('path').data(pie).join('path')
    const center = g.append('text').attr('text-anchor', 'middle').attr('y', 18).attr('font-family', MONO).attr('font-size', 56).attr('font-weight', 500)
    const legend = svg.append('g').attr('transform', `translate(${W / 2 + 140}, ${cy - (n - 1) * 30})`)
    const rows = legend.selectAll('g').data(data).join('g').attr('transform', (_, i) => `translate(0, ${i * 60})`)
    const sw = rows.append('rect').attr('x', 0).attr('y', -16).attr('width', 24).attr('height', 24).attr('rx', 5)
    rows.append('text').attr('x', 40).attr('y', 4).attr('font-size', 26).attr('fill', ink).text((_, i) => labels[i] ?? '')
    const pct = rows.append('text').attr('x', 300).attr('y', 4).attr('text-anchor', 'end').attr('font-family', MONO).attr('font-size', 26)
    return (ms: number) => {
      titleEl.attr('opacity', ph(ms, 0, 0, 0.3))
      sourceEl.attr('opacity', ph(ms, 0, 0.5, 0.8))
      track.attr('opacity', ph(ms, 0, 0.2, 0.6))
      rows.attr('opacity', (_, i) => ph(ms, 0, 0.45 + i * 0.06, 0.75 + i * 0.06))
      // One clock for the sweep: the segments fill one after another around the ring.
      const sweep = d3.easeCubicInOut(ph(ms, 1, 0, 0.85)) * 2 * Math.PI
      segs.attr('d', d => arc({ startAngle: d.startAngle, endAngle: Math.max(d.startAngle, Math.min(d.endAngle, sweep)) })!)
        .attr('fill', (_, i) => tint(i, ms, shades(i)))
        .attr('transform', (d, i) => { if (i !== hi) return ''; const a = (d.startAngle + d.endAngle) / 2, o = 14 * emph(ms); return `translate(${Math.sin(a) * o}, ${-Math.cos(a) * o})` })
      sw.attr('fill', (_, i) => tint(i, ms, shades(i)))
      pct.text((v, i) => fmt(100 * v / total * Math.max(0, Math.min(1, (sweep - pie[i]!.startAngle) / (pie[i]!.endAngle - pie[i]!.startAngle)))) + '%')
        .attr('fill', (_, i) => (i === hi ? d3.interpolateRgb(muted, accent)(emph(ms)) : muted))
      center.text(fmt(100 * data[hi]! / total) + '%').attr('fill', accent).attr('opacity', ph(ms, 2, 0.1, 0.25))
    }
  }

  // progress: one horizontal bar per datum, values in percent (0–100).
  const x = d3.scaleLinear().domain([0, 100]).range([M.l + 220, W - M.r - 120])
  const band = d3.scaleBand<number>().domain(d3.range(n)).range([M.t + 20, H - M.b]).paddingInner(0.45)
  const rows = svg.append('g').selectAll('g').data(data).join('g').attr('transform', (_, i) => `translate(0, ${band(i)})`)
  const name = rows.append('text').attr('x', M.l + 200).attr('y', band.bandwidth() / 2 + 9).attr('text-anchor', 'end').attr('font-size', 26).attr('fill', ink).text((_, i) => labels[i] ?? '')
  const trackR = rows.append('rect').attr('x', x(0)).attr('height', band.bandwidth()).attr('rx', band.bandwidth() / 2).attr('fill', line)
  const fill = rows.append('rect').attr('x', x(0)).attr('height', band.bandwidth()).attr('rx', band.bandwidth() / 2)
  const val = rows.append('text').attr('y', band.bandwidth() / 2 + 9).attr('font-family', MONO).attr('font-size', 26).attr('font-weight', 500)
  return (ms: number) => {
    titleEl.attr('opacity', ph(ms, 0, 0, 0.3))
    sourceEl.attr('opacity', ph(ms, 0, 0.5, 0.8))
    trackR.attr('width', (x(100) - x(0)) * d3.easeCubicInOut(ph(ms, 0, 0.1, 0.6)))
    name.attr('opacity', (_, i) => ph(ms, 0, 0.45 + i * 0.06, 0.75 + i * 0.06))
    fill.attr('width', (v, i) => (x(v) - x(0)) * grow(ms, i)).attr('fill', (_, i) => tint(i, ms))
    val.attr('x', (v, i) => x(v * grow(ms, i)) + 16).text((v, i) => fmt(v * grow(ms, i)) + '%')
      .attr('opacity', (_, i) => Math.min(grow(ms, i) * 4, 1)).attr('fill', (_, i) => (i === hi ? d3.interpolateRgb(muted, accent)(emph(ms)) : muted))
  }
})
