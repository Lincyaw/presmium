import { d3Scene } from '@lincyaw/addon-motion/scene'
import { H, W, axisStyle, phase, stage } from './kit/stage.ts'

// The bar chart race: between two keyframes both the values and the ranks are interpolated, the x axis follows
// the leader (scale domain set every frame), labels count with d3.format. Seek-safe: the keyframe and the
// fraction come from `ms`; there is no transition chain from one year to the next.
const NAMES = ['Python', 'JavaScript', 'Java', 'C++', 'Go', 'Rust', 'TypeScript', 'Kotlin', 'Swift', 'Julia']
const YEARS = [2018, 2020, 2022, 2024, 2026]
const TOP = 7

export default d3Scene(({ root, d3, at, color }) => {
  const rnd = d3.randomLcg(11)
  const growth = NAMES.map(() => 0.85 + rnd() * 0.9)
  const base = NAMES.map((_, i) => 100 - i * 8 + rnd() * 10)
  const frames = YEARS.map((_, k) => {
    const values = NAMES.map((_, i) => base[i]! * growth[i]! ** (k * 1.1))
    const order = d3.range(NAMES.length).sort((a, b) => values[b]! - values[a]!)
    const rank = new Array<number>(NAMES.length)
    order.forEach((i, r) => { rank[i] = r })
    return { values, rank }
  })
  const SUB = 8
  const ranks = (values: number[]) => {
    const rank = new Array<number>(values.length)
    d3.range(values.length).sort((x, y) => values[y]! - values[x]!).forEach((i, r) => { rank[i] = r })
    return rank
  }
  const m = { l: 110, r: 70, t: 34, b: 10 }
  const band = (H - m.t - m.b) / (TOP + 0.3)
  const x = d3.scaleLinear([0, 1], [m.l, W - m.r])
  const yOf = (rank: number) => m.t + rank * band
  const colors = d3.scaleOrdinal(NAMES, d3.schemeTableau10)
  const svg = stage(d3, root)
  const gx = svg.append('g').attr('transform', `translate(0,${m.t})`).call(axisStyle)
  const xAxis = d3.axisTop(x).ticks(5, 's').tickSizeInner(-(H - m.t - m.b))
  const rows = svg.append('g').selectAll('g').data(NAMES).join('g')
  const bars = rows.append('rect').attr('x', m.l).attr('height', band * 0.82).attr('rx', 3).attr('fill', d => colors(d)).attr('fill-opacity', 0.85)
  rows.append('text').attr('x', m.l - 8).attr('y', band * 0.41).attr('dy', '0.35em').attr('text-anchor', 'end').attr('font-size', 14).text(d => d)
  const values = rows.append('text').attr('y', band * 0.41).attr('dy', '0.35em').attr('font-size', 13).attr('font-family', 'var(--pm-font-mono)').attr('fill', color('muted'))
  const year = svg.append('text').attr('x', W - 24).attr('y', H - 24).attr('text-anchor', 'end').attr('font-size', 56).attr('font-weight', 700)
    .attr('font-family', 'var(--pm-font-mono)').attr('fill', color('muted')).attr('fill-opacity', 0.45)
  const fmt = d3.format(',.0f')
  return (ms: number) => {
    const p = phase(at, ms)
    // Step 0 grows the first year's bars; step k (1..4) races from year k-1 to year k.
    let k = 0
    while (k + 1 < YEARS.length && ms >= at(k + 1)) k++
    const t = k === 0 ? 1 : p(k)
    const a = frames[Math.max(0, k - 1)]!, b = frames[k]!
    const val = NAMES.map((_, i) => d3.interpolateNumber(a.values[i]!, b.values[i]!)(t))
    // As in Bostock's race: the interval is cut into SUB slices, ranks are taken from the values at each cut and
    // lerped inside a slice, so two bars swap within one short slice instead of drifting across the whole year.
    const j = Math.min(SUB - 1, Math.floor(t * SUB)), f = t * SUB - j
    const r0 = ranks(NAMES.map((_, i) => d3.interpolateNumber(a.values[i]!, b.values[i]!)(j / SUB)))
    const r1 = ranks(NAMES.map((_, i) => d3.interpolateNumber(a.values[i]!, b.values[i]!)((j + 1) / SUB)))
    const rank = NAMES.map((_, i) => d3.interpolateNumber(r0[i]!, r1[i]!)(d3.easeCubicInOut(f)))
    const grow = d3.easeCubicOut(p(0))
    x.domain([0, d3.max(val)! * 1.05])
    gx.call(xAxis).call(g => g.select('.domain').remove()).call(g => g.selectAll('.tick line').attr('stroke-opacity', 0.15))
    rows.attr('transform', (_, i) => `translate(0,${yOf(rank[i]!)})`).attr('opacity', (_, i) => Math.max(0, Math.min(1, TOP - 0.2 - rank[i]!)))
    bars.attr('width', (_, i) => (x(val[i]!) - m.l) * grow)
    values.attr('x', (_, i) => m.l + (x(val[i]!) - m.l) * grow + 6).text((_, i) => fmt(val[i]! * grow))
    const yr = k === 0 ? YEARS[0]! : d3.interpolateNumber(YEARS[k - 1]!, YEARS[k]!)(t)
    year.text(Math.floor(yr))
  }
})
