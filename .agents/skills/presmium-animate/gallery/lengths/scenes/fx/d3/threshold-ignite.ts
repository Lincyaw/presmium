import { d3Scene } from '@lincyaw/addon-motion/scene'
import { defId, phaser, stage } from '../../kit/d3-fx.ts'
import { isDark } from '../../kit/fx/theme.ts'

// "Beats the previous best", with D3, in one second (`ignite`). 0–0.15 s: a row of grey bars, the models' BLEU
// from zero. 0.15–0.6 s: the dashed "previous best" line falls from the top of the axis, overshoots a little and
// settles on the best earlier score; every part of a bar above the line lights up in the accent as the line passes
// it, so cause and effect are one gesture. 0.55–0.75 s: the margin appears over each lit cap ("+0.9", "+2.0") and
// only there. 0.75–1 s: rest.
// The lit caps are a second, accent copy of each bar that beats the line, clipped by a rect from the top down to
// the line (clip-the-copy). The clip follows the line but never goes below the best score, so the overshoot does
// not light a bar for a moment that did not beat it; bars at or under the line get no copy at all. Bars start at
// zero (a cut axis would make a 4% gain look like 50%); the source is on screen. Clip ids are per instance.
interface Bar { name: [string, string?], bleu: number }
const BARS: Bar[] = [
  { name: ['ConvS2S'], bleu: 25.16 },
  { name: ['MoE'], bleu: 26.03 },
  { name: ['GNMT + RL'], bleu: 24.6 },
  { name: ['ConvS2S', '集成'], bleu: 26.36 },
  { name: ['GNMT + RL', '集成'], bleu: 26.3 },
  { name: ['Transformer', 'base'], bleu: 27.3 },
  { name: ['Transformer', 'big'], bleu: 28.4 },
]

export default d3Scene(({ root, d3, at, color, parameters }) => {
  const bars = (parameters.bars as Bar[] | undefined) ?? BARS
  const best = (parameters.best as number | undefined) ?? 26.36
  const label = (parameters.label as string | undefined) ?? '此前最佳'
  const source = (parameters.source as string | undefined) ?? '数据：Vaswani et al., 2017，表 2（WMT 2014 英德翻译）'
  const W = 1280, H = 720, M = { l: 130, r: 220, t: 70, b: 150 }
  const top = Math.ceil(d3.max(bars, b => b.bleu)! / 10) * 10
  const x = d3.scaleBand<number>().domain(d3.range(bars.length)).range([M.l, W - M.r]).paddingInner(0.3).paddingOuter(0.25)
  const y = d3.scaleLinear().domain([0, top]).range([H - M.b, M.t])
  const ink = color('ink'), sheen = color('sheen'), muted = color('muted'), accent = color('accent'), grid = color('line')
  const grey = d3.interpolateRgb(color('line'), color('line-strong'))(0.3)
  const svg = stage(d3, root)

  // Gridlines below the top only: the margins over the lit caps stay clear of lines.
  const ay = svg.append('g').attr('transform', `translate(${M.l}, 0)`).call(d3.axisLeft(y).tickValues(d3.range(0, top, 10)).tickSize(0).tickPadding(14))
  ay.attr('font-size', 20).attr('font-family', 'var(--pm-font-mono)').style('color', muted).select('.domain').remove()
  ay.selectAll('.tick line').clone().attr('x2', W - M.r - M.l + 10).attr('stroke', grid).attr('stroke-width', 1.5)
  svg.append('text').attr('x', M.l - 14).attr('y', M.t - 30).attr('text-anchor', 'end').attr('font-size', 22).attr('fill', muted).text('BLEU')
  svg.append('line').attr('x1', M.l).attr('x2', W - M.r + 10).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', color('line-strong')).attr('stroke-width', 2)

  // A bar with rounded top corners, from zero to its value.
  const r = 8
  const shape = (b: Bar, i: number) => {
    const x0 = x(i)!, x1 = x0 + x.bandwidth(), y0 = y(0), y1 = y(b.bleu)
    return `M ${x0} ${y0} V ${y1 + r} Q ${x0} ${y1} ${x0 + r} ${y1} H ${x1 - r} Q ${x1} ${y1} ${x1} ${y1 + r} V ${y0} Z`
  }
  svg.append('g').selectAll('path').data(bars).join('path').attr('d', shape).attr('fill', grey)
  // The bars that beat the line, the highest first: it lights first, so its margin appears first.
  const lit = bars.map((b, i) => ({ b, i })).filter(d => d.b.bleu > best).sort((a, b) => b.b.bleu - a.b.bleu)
  const clipId = defId('ignite-clip'), heatId = defId('ignite-heat')
  const clip = svg.append('clipPath').attr('id', clipId).append('rect').attr('x', 0).attr('width', W).attr('y', 0)
  // On a dark page the edge just lit is hot (toward the sheen) and cools to the accent above it and once the line
  // has settled; on a light page a lighter edge would read as fading, so the cap stays the accent.
  const hot = isDark(color('bg')) ? 0.6 : 0
  const heat = svg.append('defs').append('linearGradient').attr('id', heatId).attr('gradientUnits', 'userSpaceOnUse').attr('x1', 0).attr('x2', 0)
  heat.append('stop').attr('offset', 0).attr('stop-color', accent)
  const edge = heat.append('stop').attr('offset', 1)
  svg.append('g').attr('clip-path', `url(#${clipId})`).selectAll('path').data(lit).join('path').attr('d', d => shape(d.b, d.i)).attr('fill', `url(#${heatId})`)

  const names = svg.append('g').attr('text-anchor', 'middle').attr('font-size', 20).selectAll('text').data(bars).join('text')
    .attr('transform', (_, i) => `translate(${x(i)! + x.bandwidth() / 2}, ${y(0) + 34})`)
  names.append('tspan').attr('x', 0).text(b => b.name[0])
  names.append('tspan').attr('x', 0).attr('dy', 25).text(b => b.name[1] ?? '')
  const deltas = svg.append('g').attr('text-anchor', 'middle').attr('font-family', 'var(--pm-font-mono)').attr('font-weight', 500).attr('font-size', 30).attr('fill', accent)
    .selectAll('text').data(lit).join('text').text(d => d3.format('+.1f')(d.b.bleu - best))

  const rule = svg.append('g')
  rule.append('line').attr('x1', M.l).attr('x2', W - M.r + 10).attr('stroke', ink).attr('stroke-width', 3).attr('stroke-dasharray', '12 8')
  const tag = rule.append('text').attr('x', W - M.r + 26).attr('font-size', 22).attr('fill', ink)
  tag.append('tspan').attr('x', W - M.r + 26).attr('dy', -6).text(label)
  tag.append('tspan').attr('x', W - M.r + 26).attr('dy', 28).attr('font-family', 'var(--pm-font-mono)').attr('fill', muted).text(d3.format('.2f')(best))
  svg.append('text').attr('x', M.l).attr('y', H - 22).attr('font-size', 19).attr('fill', muted).text(source)

  const ph = phaser(at)
  const fall = d3.easeBackOut.overshoot(1.4)
  return (ms: number) => {
    const p = ph(ms, 0, 0.15, 0.6)
    const v = top + (best - top) * fall(p)
    rule.attr('transform', `translate(0, ${y(v)})`).attr('opacity', ph(ms, 0, 0.12, 0.22))
    const cut = y(Math.max(v, best))
    clip.attr('height', p > 0 ? cut : 0)
    heat.attr('y1', cut - 34).attr('y2', cut)
    edge.attr('stop-color', d3.interpolateRgb(accent, sheen)(hot * (1 - d3.easeCubicInOut(ph(ms, 0, 0.55, 0.85)))))
    // A name takes the accent as much of its bar's margin as is lit.
    names.attr('fill', b => b.bleu > best ? d3.interpolateRgb(muted, accent)(Math.max(0, Math.min(1, (b.bleu - v) / (b.bleu - best)))) : muted)
    deltas.attr('x', d => x(d.i)! + x.bandwidth() / 2)
      .attr('y', (d, k) => y(d.b.bleu) - 16 + 12 * (1 - d3.easeCubicOut(ph(ms, 0, 0.55 + k * 0.04, 0.71 + k * 0.04))))
      .attr('opacity', (_, k) => ph(ms, 0, 0.55 + k * 0.04, 0.68 + k * 0.04))
  }
})
