import type * as D3 from 'd3'
import { d3Scene } from '@lincyaw/addon-motion/scene'
import { H, W, axisStyle, phase, stage } from './kit/stage.ts'

// d3.bin turns samples into a histogram: samples arrive and the bins are recomputed from the first n of them,
// the bin width changes, then a kernel density estimate (computed with d3.mean) is drawn over it.
// Seek-safe: samples come from d3.randomLcg with a fixed seed, and n is a function of `ms`.
export default d3Scene(({ root, d3, at, color }) => {
  const src = d3.randomLcg(42)
  const a = d3.randomNormal.source(src)(38, 9), b = d3.randomNormal.source(src)(68, 6)
  const samples = d3.range(500).map(() => (src() < 0.62 ? a() : b()))
  const m = { l: 44, r: 24, t: 24, b: 36 }
  const x = d3.scaleLinear([0, 100], [m.l, W - m.r])
  const svg = stage(d3, root)
  svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x)).call(axisStyle)
  const gy = svg.append('g').attr('transform', `translate(${m.l},0)`).call(axisStyle)
  const fine = d3.bin().domain([0, 100]).thresholds(d3.range(0, 100, 2.5))
  const coarse = d3.bin().domain([0, 100]).thresholds(d3.range(0, 100, 10))
  const y = d3.scaleLinear([0, 1], [H - m.b, m.t])
  const fineBars = svg.append('g').attr('fill', color('accent')).selectAll('rect').data(fine(samples)).join('rect')
  const coarseBars = svg.append('g').attr('fill', color('accent')).selectAll('rect').data(coarse(samples)).join('rect')
  const rug = svg.append('g').attr('stroke', color('ink')).selectAll('line').data(samples).join('line')
    .attr('x1', d => x(d)).attr('x2', d => x(d)).attr('y1', H - m.b + 2).attr('y2', H - m.b + 8)
  const count = svg.append('text').attr('x', W - m.r).attr('y', m.t + 4).attr('text-anchor', 'end').attr('font-family', 'var(--pm-font-mono)').attr('font-size', 14).attr('fill', color('muted'))
  // Gaussian kernel density, scaled to counts per 10-unit bin.
  const kde = (bw: number) => (v: number) => d3.mean(samples, s => Math.exp(-0.5 * ((v - s) / bw) ** 2) / (bw * Math.sqrt(2 * Math.PI)))! * samples.length * 10
  const density = d3.range(0, 100.5, 1).map(v => [v, kde(4)(v)] as const)
  const curve = svg.append('path').datum(density).attr('fill', 'none').attr('stroke', color('danger')).attr('stroke-width', 2.5).attr('pathLength', 1).attr('stroke-dasharray', '1 1')
  const yMaxFine = d3.max(fine(samples), d => d.length)!, yMaxCoarse = d3.max(coarse(samples), d => d.length)!
  return (ms: number) => {
    const p = phase(at, ms)
    const n = Math.round(samples.length * d3.easeQuadIn(p(0)))
    const shown = samples.slice(0, n)
    const mix = d3.easeCubicInOut(p(1))
    y.domain([0, d3.interpolateNumber(yMaxFine, yMaxCoarse)(mix) * 1.1])
    gy.call(d3.axisLeft(y).ticks(5))
    const place = (bars: typeof fineBars, bins: D3.Bin<number, number>[], opacity: number) => bars.data(bins)
      .attr('x', d => x(d.x0!) + 1).attr('width', d => Math.max(0, x(d.x1!) - x(d.x0!) - 2))
      .attr('y', d => y(d.length)).attr('height', d => y(0) - y(d.length)).attr('fill-opacity', opacity)
    place(fineBars, fine(shown), 0.75 * (1 - mix))
    place(coarseBars, coarse(shown), 0.55 * mix)
    rug.attr('stroke-opacity', (_, i) => (i < n ? 0.35 : 0))
    count.text(`n = ${n}`)
    curve.attr('d', d3.line().x(d => x(d[0])).y(d => y(d[1])).curve(d3.curveBasis)(density as [number, number][]))
      .attr('stroke-dashoffset', 1 - d3.easeCubicInOut(p(2)))
  }
})
