import { d3Scene } from '@lincyaw/addon-motion/scene'
import { phaser, stage, textOn } from '../../kit/d3-fx.ts'
import type { XY } from '../../kit/d3-fx.ts'

// From amounts to shares, with D3, in one and a half seconds (`bend`). 0–0.15 s: five category bars, the amounts.
// 0.15–0.55 s: the bars slide end to end (first along, so they never cross, then together) into one 100% strip,
// and the numbers become percentages. 0.6–1.25 s: the strip bends until its ends meet and it is a donut; each
// segment becomes its own wedge, nothing fades. 1.25–1.5 s: rest, the shares read.
// The bend is a curvature κ from 0 to 2π/L: a point s along the strip and n across it goes to angle κs and radius
// 1/κ + n around a centre 1/κ below the strip, so lengths along the middle line and the thickness never change and
// at 2π/L the strip closes exactly. The formulas are written so κ = 0 is the straight strip itself (sin(κs)/κ → s),
// and each segment's outline is sampled and mapped, not drawn with `d3.arc`: at small κ the arc's radius would be
// in the millions, which the renderer cannot place precisely, and swapping rects for arcs at a threshold shows as a
// jump. The whole shape is kept centred on the frame while it bends. The colours run from the accent (the first
// category) toward the soft accent, in both themes; labels take ink or the page colour, whichever reads on their
// segment. The numbers count from the amount to the share. Illustrative data, labelled as such.
const LABELS = ['训练', '推理', '存储', '网络', '其他']
const VALUES = [42, 23, 15, 12, 8]

export default d3Scene(({ root, d3, at, color, parameters }) => {
  const labels = (parameters.labels as string[] | undefined) ?? LABELS
  const values = (parameters.values as number[] | undefined) ?? VALUES
  const caption = (parameters.caption as string | undefined) ?? '示意数据'
  const W = 1280, H = 720, L = 1000, w = 76, gap = 4, rc = 7, xs = (W - L) / 2, xm = W / 2
  const n = values.length, shares = values.map(v => (100 * v) / d3.sum(values))
  // d3.stack with the expand offset gives each segment's [start, end] share of the strip.
  const stacked = d3.stack<number[], number>().keys(d3.range(n)).value((d, key) => d[key]!).offset(d3.stackOffsetExpand)([values])
  const spans = stacked.map(layer => [layer[0]![0] * L - L / 2, layer[0]![1] * L - L / 2] as [number, number])
  // The bars start from one baseline, the chart centred on the frame; the strip is centred too.
  const ox = (W - (d3.max(spans, ([a, b]) => b - a) ?? 0)) / 2 - xs
  const rows = d3.scalePoint<number>().domain(d3.range(n)).range([H / 2 - ((n - 1) / 2) * (w + 18), H / 2 + ((n - 1) / 2) * (w + 18)])
  const ramp = d3.quantize(d3.interpolateLab(color('accent'), color('accent-soft')), n + 1).slice(0, n)
  const ink = color('ink'), bg = color('bg'), muted = color('muted')
  const svg = stage(d3, root)

  // A point s along the strip and m across it (m > 0 outward), bent to curvature k; `top` is where the strip's
  // middle sits. Stable at k = 0, where it is the straight strip.
  const bend = (s: number, m: number, k: number, top: number): XY => {
    const a = k * s, dx = Math.abs(a) < 1e-9 ? s : Math.sin(a) / k
    const sag = Math.abs(k) < 1e-12 ? 0 : (2 / k) * Math.sin(a / 2) ** 2
    return [xm + dx + m * Math.sin(a), top - m * Math.cos(a) + sag]
  }
  // A segment's outline in strip space, sampled every few units so the bent edges stay smooth: the outer edge left
  // to right, the right end, the inner edge back, the left end, with round corners.
  const shapeOf = ([s0, s1]: [number, number]): XY[] => {
    const a = s0 + gap / 2, b = s1 - gap / 2, h = w / 2, pts: XY[] = []
    const run = (s0_: number, m0: number, s1_: number, m1: number) => {
      const k = Math.max(1, Math.ceil(Math.hypot(s1_ - s0_, m1 - m0) / 5))
      for (let i = 0; i < k; i++) pts.push([s0_ + ((s1_ - s0_) * i) / k, m0 + ((m1 - m0) * i) / k])
    }
    const arc = (cs: number, cm: number, from: number) => {
      for (let i = 0; i < 4; i++) { const t = from - (i / 4) * (Math.PI / 2); pts.push([cs + rc * Math.cos(t), cm + rc * Math.sin(t)]) }
    }
    run(a + rc, h, b - rc, h); arc(b - rc, h - rc, Math.PI / 2)
    run(b, h - rc, b, -h + rc); arc(b - rc, -h + rc, 0)
    run(b - rc, -h, a + rc, -h); arc(a + rc, -h + rc, -Math.PI / 2)
    run(a, -h + rc, a, h - rc); arc(a + rc, h - rc, Math.PI)
    return pts
  }
  const shapes = spans.map(shapeOf)

  const baseline = svg.append('line').attr('x1', xs + ox).attr('x2', xs + ox).attr('y1', rows(0)! - w / 2 - 14).attr('y2', rows(n - 1)! + w / 2 + 14)
    .attr('stroke', color('line-strong')).attr('stroke-width', 2)
  const segs = svg.append('g').selectAll('g').data(d3.range(n)).join('g')
  const paths = segs.append('path').attr('fill', i => ramp[i]!)
  const tags = segs.append('g').attr('text-anchor', 'middle').attr('fill', i => textOn(ramp[i]!, ink, bg))
  tags.append('text').attr('y', -6).attr('font-size', 24).attr('font-weight', 600).text(i => labels[i]!)
  // One number per segment that goes from the amount to the share while its "%" fades in; the text is shifted by
  // half a mono character (0.6 em wide) until then, so the digits stay centred.
  const fs = 22
  const number = tags.append('text').attr('y', 22).attr('font-size', fs).attr('font-family', 'var(--pm-font-mono)')
  const digits = number.append('tspan')
  const percent = number.append('tspan').text('%')
  svg.append('text').attr('x', W - 40).attr('y', H - 24).attr('text-anchor', 'end').attr('font-size', 19).attr('fill', muted).text(caption)

  const line = d3.line()
  const ph = phaser(at)
  const ease = d3.easeCubicInOut
  return (ms: number) => {
    const along = ease(ph(ms, 0, 0.1, 0.29)), together = ease(ph(ms, 0, 0.23, 0.37))
    const k = ((2 * Math.PI) / L) * ease(ph(ms, 0, 0.4, 0.833))
    // Keep the shape's vertical middle on the frame's: the strip's ends drop by (1 − cos θ)/κ as it bends.
    const top = H / 2 - (Math.abs(k) < 1e-12 ? 0 : Math.sin((k * L) / 4) ** 2 / k)
    segs.attr('transform', i => `translate(${(ox - spans[i]![0] - L / 2) * (1 - along)}, ${(rows(i)! - H / 2) * (1 - together)})`)
    paths.attr('d', i => `${line(shapes[i]!.map(([s, m]) => bend(s, m, k, top)))!}Z`)
    tags.attr('transform', i => `translate(${bend((spans[i]![0] + spans[i]![1]) / 2, 0, k, top).join(', ')})`)
    number.attr('x', 0.3 * fs * (1 - together))
    digits.text(i => Math.round(values[i]! + (shares[i]! - values[i]!) * together))
    percent.attr('fill-opacity', together)
    baseline.attr('opacity', 1 - along)
  }
})
