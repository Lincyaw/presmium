import { d3Scene } from '@lincyaw/addon-motion/scene'
import { alpha, along, defId, hatch, phaser, power10, stage } from '../../kit/d3-fx.ts'
import type { XY } from '../../kit/d3-fx.ts'

// "Better and cheaper", with D3, in one and a half seconds (`push`): score against training cost (Vaswani et al.
// 2017, table 2). 0–0.15 s: the models as points. 0.15–0.55 s: the staircase of the best score for the cost (the
// Pareto frontier) draws through the earlier models that nothing beats, and each model under it dims as the line
// passes it. 0.55–0.85 s: the two Transformers drop in, above the staircase and to its left. 0.85–1.25 s: a new
// staircase draws through them, the ground between the old and the new one fills with a hatch as the line passes
// (the hatch is the territory won), and the old leaders dim a little, as they no longer lead. 1.25–1.5 s: rest.
// The frontiers are computed at build (sorted by cost, the running maximum of the score) and drawn with
// `curveStepAfter` from the floor at the cheapest model to the right edge, so the area between them is closed.
// They are drawn with pathLength="1"; the staircases are straight segments, so the drawn tip is known exactly
// (`along`) without measuring, and the dimming and the hatch follow the tip. Labels are placed off the lines and
// off the hatch (a halo would need the colour behind the scene, which differs between a page and a slide).
// Pattern and clip ids are per instance.
interface Model { name: string, flops: number, bleu: number, ours?: boolean, at?: [number, number, 'start' | 'middle' | 'end'] }
const MODELS: Model[] = [
  { name: 'ConvS2S', flops: 9.6e18, bleu: 25.16, at: [16, 38, 'start'] },
  { name: 'MoE', flops: 2.0e19, bleu: 26.03, at: [-16, 40, 'end'] },
  { name: 'GNMT + RL', flops: 2.3e19, bleu: 24.6, at: [0, 42, 'middle'] },
  { name: 'ConvS2S 集成', flops: 7.7e19, bleu: 26.36, at: [16, 40, 'start'] },
  { name: 'GNMT + RL 集成', flops: 1.8e20, bleu: 26.3, at: [14, 40, 'start'] },
  { name: 'Transformer base', flops: 3.3e18, bleu: 27.3, ours: true, at: [-14, -26, 'start'] },
  { name: 'Transformer big', flops: 2.3e19, bleu: 28.4, ours: true, at: [22, -24, 'start'] },
]

export default d3Scene(({ root, d3, at, color, parameters }) => {
  const models = (parameters.models as Model[] | undefined) ?? MODELS
  const source = (parameters.source as string | undefined) ?? '数据：Vaswani et al., 2017，表 2（WMT 2014 英德翻译）'
  const W = 1280, H = 720, M = { l: 150, r: 150, t: 70, b: 120 }
  const x = d3.scaleLog().domain([2e18, 4e20]).range([M.l, W - M.r])
  const y = d3.scaleLinear().domain([24, 29]).range([H - M.b, M.t])
  const muted = color('muted'), accent = color('accent'), grey = color('line-strong'), surface = color('surface')
  const svg = stage(d3, root)

  const ax = svg.append('g').attr('transform', `translate(0, ${H - M.b})`).call(d3.axisBottom(x).tickValues([1e19, 1e20]).tickFormat(d => power10(+d)).tickSize(8).tickPadding(8))
  const ay = svg.append('g').attr('transform', `translate(${M.l}, 0)`).call(d3.axisLeft(y).ticks(5).tickSize(8))
  for (const g of [ax, ay]) g.attr('font-size', 22).attr('font-family', 'var(--pm-font-mono)').style('color', muted).select('.domain').attr('stroke-width', 2)
  svg.append('text').attr('x', x.range()[1]!).attr('y', H - 62).attr('text-anchor', 'end').attr('font-size', 22).attr('fill', muted).text('训练算力（FLOPs，对数）')
  svg.append('text').attr('x', M.l - 20).attr('y', M.t - 28).attr('font-size', 22).attr('fill', muted).text('BLEU')
  svg.append('text').attr('x', M.l).attr('y', H - 22).attr('font-size', 19).attr('fill', muted).text(source)

  // The staircase of the best score at each cost: from the floor at the cheapest model, up and right through every
  // model that beats all cheaper ones, then on to the right edge.
  const frontier = (set: Model[]) => {
    const sorted = [...set].sort((a, b) => a.flops - b.flops || b.bleu - a.bleu)
    const keep: Model[] = []
    for (const m of sorted) if (!keep.length || m.bleu > keep.at(-1)!.bleu) keep.push(m)
    const steps: XY[] = [[x(keep[0]!.flops), y.range()[0]!], ...keep.map((m): XY => [x(m.flops), y(m.bleu)]), [x.range()[1]!, y(keep.at(-1)!.bleu)]]
    const d = d3.line().curve(d3.curveStepAfter)(steps)!
    // The corners curveStepAfter draws, for the tip of the drawn line.
    const corners: XY[] = steps.flatMap((p, i) => (i ? [[p[0], steps[i - 1]![1]] as XY, p] : [p]))
    return { keep, d, path: along(corners), height: (px: number) => { let h = y.range()[0]!; for (const p of steps) if (p[0] <= px) h = p[1]; return h } }
  }
  const before = frontier(models.filter(m => !m.ours)), after = frontier(models)

  // The ground won: between the two staircases, sampled on a common x grid (every corner of either), hatched.
  const grid = [...new Set([...before.path.points, ...after.path.points].map(p => p[0]))].sort((a, b) => a - b)
  const won = d3.area<number>().x(px => px).y0(px => before.height(px)).y1(px => Math.min(before.height(px), after.height(px))).curve(d3.curveStepAfter)
  const clipId = defId('frontier-clip')
  const clip = svg.append('clipPath').attr('id', clipId).append('rect').attr('x', 0).attr('y', 0).attr('height', H)
  const ground = svg.append('g').attr('clip-path', `url(#${clipId})`)
  ground.append('path').attr('d', won(grid)!).attr('fill', alpha(accent, 0.07))
  ground.append('path').attr('d', won(grid)!).attr('fill', hatch(svg, alpha(accent, 0.55)))

  const lines = svg.append('g').attr('fill', 'none').attr('stroke-linejoin', 'round')
  const old = lines.append('path').attr('d', before.d).attr('stroke', grey).attr('stroke-width', 3.5).attr('pathLength', 1).attr('stroke-dasharray', 1)
  const now = lines.append('path').attr('d', after.d).attr('stroke', accent).attr('stroke-width', 4.5).attr('pathLength', 1).attr('stroke-dasharray', 1)
  // Each staircase is named past its right end.
  const tag = (text: string, f: typeof before, fill: string) => svg.append('text').attr('x', x.range()[1]! + 12).attr('y', f.height(x.range()[1]!)).attr('dy', '0.35em')
    .attr('font-size', 22).attr('font-weight', 600).attr('fill', fill).text(text)
  const oldTag = tag('此前前沿', before, muted), newTag = tag('新前沿', after, accent)

  const points = svg.append('g').selectAll('g').data(models).join('g').attr('transform', d => `translate(${x(d.flops)}, ${y(d.bleu)})`)
  const dots = points.append('circle').attr('r', d => (d.ours ? 15 : 11)).attr('fill', d => (d.ours ? accent : grey)).attr('stroke', surface).attr('stroke-width', 3)
  const place = (d: Model) => d.at ?? [20, 7, 'start']
  points.append('text').attr('x', d => place(d)[0]).attr('y', d => place(d)[1]).attr('text-anchor', d => place(d)[2])
    .attr('font-size', d => (d.ours ? 26 : 21)).attr('font-weight', d => (d.ours ? 600 : 400)).attr('fill', d => (d.ours ? accent : muted))
    .text(d => d.name)

  const ph = phaser(at)
  const ease = d3.easeCubicInOut
  const ours = models.filter(m => m.ours).sort((a, b) => a.flops - b.flops)
  // How far a staircase's tip has passed a model's x, 0..1 over 30 units.
  const passed = (tip: XY, m: Model) => Math.max(0, Math.min(1, (tip[0] - x(m.flops)) / 30))
  return (ms: number) => {
    const u1 = ease(ph(ms, 0, 0.1, 0.367)), u2 = ease(ph(ms, 0, 0.567, 0.833))
    const tip1 = before.path.at(u1), tip2 = after.path.at(u2)
    old.attr('stroke-dashoffset', 1 - u1)
    now.attr('stroke-dashoffset', 1 - u2)
    oldTag.attr('opacity', ph(ms, 0, 0.33, 0.4))
    newTag.attr('opacity', ph(ms, 0, 0.8, 0.87))
    clip.attr('width', u2 > 0 ? tip2[0] : 0)
    points.attr('opacity', d => {
      if (d.ours) return ph(ms, 0, 0.367 + ours.indexOf(d) * 0.07, 0.4 + ours.indexOf(d) * 0.07)
      // Under the first staircase: dim as its tip passes. On it: dim a little once the new one passes, as it no longer leads.
      return before.keep.includes(d) ? 1 - 0.35 * passed(tip2, d) : 1 - 0.62 * passed(tip1, d)
    })
    dots.attr('transform', d => {
      if (!d.ours) return null
      const p = d3.easeCubicOut(ph(ms, 0, 0.367 + ours.indexOf(d) * 0.07, 0.5 + ours.indexOf(d) * 0.07))
      return `translate(0, ${(1 - p) * -60}) scale(${0.4 + 0.6 * d3.easeBackOut.overshoot(2)(p)})`
    })
  }
})
