import { d3Scene } from '@lincyaw/addon-motion/scene'

// One chart insight in ten seconds, with D3: score against training cost (Vaswani et al. 2017, table 2, English to
// German). `axes`: the encoding first, the axes drawn and named. `baselines`: the earlier models appear from
// cheapest to dearest, in grey. `frontier`: a dashed line marks the best of them. `ours`: the two Transformers drop
// in, in the accent color, above the line and to the left of it. `insight`: an arrow from the previous best to the
// base model and one short sentence; then the chart rests. Up is better and left is cheaper, for the whole piece.
// `at` places each label clear of its neighbours: [dx, dy, anchor].
interface Model { name: string, flops: number, bleu: number, ours?: boolean, at?: [number, number, 'start' | 'middle' | 'end'] }
const MODELS: Model[] = [
  { name: 'ConvS2S', flops: 9.6e18, bleu: 25.16 },
  { name: 'MoE', flops: 2.0e19, bleu: 26.03 },
  { name: 'GNMT + RL', flops: 2.3e19, bleu: 24.6, at: [0, 40, 'middle'] },
  { name: 'ConvS2S 集成', flops: 7.7e19, bleu: 26.36, at: [0, 40, 'middle'] },
  { name: 'GNMT + RL 集成', flops: 1.8e20, bleu: 26.3, at: [14, -18, 'start'] },
  { name: 'Transformer base', flops: 3.3e18, bleu: 27.3, ours: true, at: [-12, 48, 'start'] },
  { name: 'Transformer big', flops: 2.3e19, bleu: 28.4, ours: true },
]
const BEST = 26.36

export default d3Scene(({ root, d3, at, color, parameters }) => {
  const insight = (parameters.insight as string | undefined) ?? '分数更高，算力约为 1/23'
  const W = 1280, H = 720, M = { l: 150, r: 80, t: 70, b: 120 }
  const x = d3.scaleLog().domain([2e18, 4e20]).range([M.l, W - M.r])
  const y = d3.scaleLinear().domain([24, 29]).range([H - M.b, M.t])
  const ink = color('ink'), muted = color('muted'), accent = color('accent'), line = color('line-strong'), surface = color('surface')
  const svg = d3.select(root).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('height', '100%')
    .style('display', 'block').style('font-family', 'var(--pm-font-sans)')
  const ax = svg.append('g').attr('transform', `translate(0, ${H - M.b})`).call(d3.axisBottom(x).tickValues([1e19, 1e20]).tickFormat(d => `10${[...String(Math.log10(+d))].map(c => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c]).join('')}`).tickSize(8))
  const ay = svg.append('g').attr('transform', `translate(${M.l}, 0)`).call(d3.axisLeft(y).ticks(5).tickSize(8))
  for (const g of [ax, ay]) {
    g.attr('font-size', 22).attr('font-family', 'var(--pm-font-mono)').style('color', muted)
    g.select('.domain').attr('pathLength', 1).attr('stroke-dasharray', 1).attr('stroke-width', 2)
  }
  const ticks = svg.selectAll<SVGGElement, unknown>('.tick')
  const xTitle = svg.append('text').attr('x', W - M.r).attr('y', H - 40).attr('text-anchor', 'end').attr('font-size', 24).attr('fill', muted).text('训练算力（FLOPs）')
  const yTitle = svg.append('text').attr('x', M.l - 20).attr('y', M.t - 28).attr('font-size', 24).attr('fill', muted).text('BLEU')
  const best = svg.append('line').attr('x1', M.l).attr('x2', W - M.r).attr('y1', y(BEST)).attr('y2', y(BEST))
    .attr('stroke', line).attr('stroke-width', 2.5).attr('stroke-dasharray', '10 8')
  const bestClip = svg.append('clipPath').attr('id', 'ds-best').append('rect').attr('x', M.l).attr('y', 0).attr('height', H)
  best.attr('clip-path', 'url(#ds-best)')
  const points = svg.append('g').selectAll('g').data(MODELS).join('g').attr('transform', d => `translate(${x(d.flops)}, ${y(d.bleu)})`)
  const dots = points.append('circle').attr('r', d => (d.ours ? 15 : 11)).attr('fill', d => (d.ours ? accent : line)).attr('stroke', surface).attr('stroke-width', 3)
  const place = (d: Model) => d.at ?? (d.ours ? [20, -22, 'start'] : [20, 7, 'start'])
  points.append('text').attr('x', d => place(d)[0]).attr('y', d => place(d)[1]).attr('text-anchor', d => place(d)[2]).attr('font-size', d => (d.ours ? 26 : 21)).attr('font-weight', d => (d.ours ? 600 : 400))
    .attr('fill', d => (d.ours ? accent : muted)).text(d => d.name)
  const base = MODELS.find(m => m.name === 'Transformer base')!, prev = MODELS.find(m => m.bleu === BEST)!
  const arrow = svg.append('path').attr('d', `M ${x(prev.flops) - 18} ${y(prev.bleu) - 14} Q ${(x(prev.flops) + x(base.flops)) / 2} ${y(base.bleu) - 90} ${x(base.flops) + 24} ${y(base.bleu) - 8}`)
    .attr('fill', 'none').attr('stroke', accent).attr('stroke-width', 3.5).attr('pathLength', 1).attr('stroke-dasharray', 1)
  const head = svg.append('path').attr('d', 'M 0 -9 L 16 0 L 0 9 Z').attr('fill', accent)
    .attr('transform', `translate(${x(base.flops) + 24}, ${y(base.bleu) - 8}) rotate(160)`)
  const say = svg.append('text').attr('x', 930).attr('y', y(27.9)).attr('text-anchor', 'middle').attr('font-size', 30).attr('font-weight', 600).attr('fill', ink).text(insight)

  const ph = (ms: number, k: number, from = 0, to = 1) => Math.max(0, Math.min(1, ((ms - at(k)) / (at(k + 1) - at(k)) - from) / (to - from)))
  const ease = d3.easeCubicOut
  const baselines = MODELS.filter(m => !m.ours).sort((a, b) => a.flops - b.flops)
  return (ms: number) => {
    const axes = d3.easeCubicInOut(ph(ms, 0, 0.1, 0.6))
    ax.select('.domain').attr('stroke-dashoffset', 1 - axes)
    ay.select('.domain').attr('stroke-dashoffset', 1 - axes)
    const labels = ph(ms, 0, 0.5, 0.9)
    ticks.attr('opacity', labels)
    xTitle.attr('opacity', labels)
    yTitle.attr('opacity', labels)
    points.attr('opacity', d => {
      if (d.ours) return ph(ms, 3, d.name.endsWith('base') ? 0 : 0.35, d.name.endsWith('base') ? 0.25 : 0.6) > 0 ? 1 : 0
      const i = baselines.indexOf(d)
      return ph(ms, 1, i * 0.14, i * 0.14 + 0.2)
    })
    dots.attr('transform', d => {
      if (!d.ours) return null
      const p = ease(ph(ms, 3, d.name.endsWith('base') ? 0 : 0.35, d.name.endsWith('base') ? 0.3 : 0.65))
      return `translate(0, ${(1 - p) * -60}) scale(${0.4 + 0.6 * d3.easeBackOut.overshoot(2)(p)})`
    })
    bestClip.attr('width', (W - M.l - M.r) * d3.easeCubicInOut(ph(ms, 2, 0, 0.7)))
    arrow.attr('stroke-dashoffset', 1 - d3.easeCubicInOut(ph(ms, 4, 0, 0.3)))
    head.attr('opacity', ph(ms, 4, 0.28, 0.32))
    say.attr('opacity', ph(ms, 4, 0.3, 0.45))
  }
})
