import type * as D3 from 'd3'
import { d3Scene } from '@lincyaw/addon-motion/scene'
import { H, W, phase, stage } from './kit/stage.ts'

// d3.stack with two offsets: stacked areas (stackOffsetNone) become a streamgraph (stackOffsetWiggle with
// stackOrderInsideOut). Both layouts are computed at build; each frame lerps every y0/y1 and re-runs d3.area.
// Pitfall: the two stacks order the series differently, so they are matched by key, not by index.
const KEYS = ['视觉', '语言', '语音', '推荐', '强化学习', '图网络']

export default d3Scene(({ root, d3, at, color }) => {
  const rnd = d3.randomLcg(5)
  const n = 60
  // Bostock's "bumps": a sum of random gaussian bumps per series.
  const bumps = () => {
    const a = d3.range(n).map(() => 0.1)
    for (let b = 0; b < 4; b++) {
      const c = rnd() * 1.2 - 0.1, h = 2 * rnd() + 0.4, w = 8 + rnd() * 10
      for (let i = 0; i < n; i++) a[i]! += h * Math.exp(-(((i / n - c) * n / w) ** 2))
    }
    return a
  }
  const series = KEYS.map(() => bumps())
  const rows = d3.range(n).map(i => Object.fromEntries(KEYS.map((k, j) => [k, series[j]![i]!])))
  const stacked = d3.stack().keys(KEYS)(rows)
  const stream = d3.stack().keys(KEYS).offset(d3.stackOffsetWiggle).order(d3.stackOrderInsideOut)(rows)
  const byKey = (s: D3.Series<Record<string, number>, string>[]) => new Map(s.map(d => [d.key, d]))
  const A = byKey(stacked), B = byKey(stream)
  const ext = (s: typeof stacked) => [d3.min(s, l => d3.min(l, d => d[0]))!, d3.max(s, l => d3.max(l, d => d[1]))!] as const
  const ea = ext(stacked), eb = ext(stream)
  const x = d3.scaleLinear([0, n - 1], [20, W - 20])
  const y = d3.scaleLinear().range([H - 24, 24])
  const colors = d3.scaleOrdinal(KEYS, d3.quantize(t => d3.interpolateCool(0.1 + 0.85 * t), KEYS.length))
  const svg = stage(d3, root)
  const paths = svg.append('g').selectAll('path').data(KEYS).join('path').attr('fill', d => colors(d))
  const label = svg.append('text').attr('font-size', 18).attr('font-weight', 600).attr('text-anchor', 'middle').attr('fill', color('ink'))
  const area = d3.area<[number, number]>().x((_, i) => x(i)).y0(d => y(d[0])).y1(d => y(d[1])).curve(d3.curveBasis)
  const FOCUS = KEYS[2]!
  return (ms: number) => {
    const p = phase(at, ms)
    const mix = d3.easeCubicInOut(p(1))
    y.domain([d3.interpolateNumber(ea[0], eb[0])(mix), d3.interpolateNumber(ea[1], eb[1])(mix)])
    // Step 0: each layer rises on top of the layers under it (KEYS order is the stacked order), one after the other.
    const g = KEYS.map((_, j) => d3.easeCubicOut(Math.max(0, Math.min(1, p(0) * 2 - j / KEYS.length))))
    paths.attr('d', (key, j) => {
      const a = A.get(key)!, b = B.get(key)!
      return area(a.map((d, i) => {
        const y0 = d3.interpolateNumber(d[0], b[i]![0])(mix), h = d[1] - d[0]
        const missing = d3.sum(KEYS.slice(0, j), (k, l) => (1 - g[l]!) * (A.get(k)![i]![1] - A.get(k)![i]![0]))
        return [y0 - missing, y0 - missing + h * g[j]!]
      }))
    }).attr('fill-opacity', key => (key === FOCUS ? 0.95 : 0.95 - 0.7 * p(2)))
    // The label sits at the widest point of the focused layer.
    const a = A.get(FOCUS)!, b = B.get(FOCUS)!
    const i = d3.maxIndex(a, d => d[1] - d[0])
    const mid = (d3.interpolateNumber(a[i]![0], b[i]![0])(mix) + d3.interpolateNumber(a[i]![1], b[i]![1])(mix)) / 2
    label.attr('x', x(i)).attr('y', y(mid)).attr('dy', '0.35em').attr('opacity', p(2)).text(FOCUS)
  }
})
