import { d3Scene } from '@lincyaw/addon-motion/scene'
import { alpha, curveAt, defId, glow, phaser, stage } from '../../kit/d3-fx.ts'
import { isDark } from '../../kit/fx/theme.ts'
import type { XY } from '../../kit/d3-fx.ts'

// A line drawn by a glowing pen, with D3, in one second (`draw`). 0–0.15 s: the axes at rest, the encoding first.
// 0.15–0.75 s: the line draws from left to right; a glowing head sits exactly on its tip, a tail behind it
// brightens toward the head, and the value at the tip rides above the head, so the eye follows one point and the
// number arrives with the line. 0.75–1 s: the glow and the tail go out and the head settles into a plain end dot.
// The whole curve is drawn once and clipped by a rect at the tip's x, and the head's y is read from the same
// curve (replayed into a recorder), so head and line never part: slicing the data and re-running
// `curveMonotoneX` would change the last segment as points enter. The tail is the same path stroked with a
// horizontal gradient in user space from x = tip − tail to x = tip, which for a series that advances in x is a
// gradient along the line (an objectBoundingBox gradient on a flat stretch would have no height and vanish). The
// glow is wider on a dark page and fainter on a light one. The data is illustrative and says so.
export default d3Scene(({ root, d3, at, color, parameters }) => {
  const caption = (parameters.caption as string | undefined) ?? '示意数据：种子固定的随机游走'
  const title = (parameters.title as string | undefined) ?? '指标'
  const walk = d3.randomNormal.source(d3.randomLcg(3))(0.35, 2.2)
  const start = new Date(2024, 0, 1)
  let v = 40
  const data = d3.range(120).map(i => ({ date: d3.timeDay.offset(start, i * 3), value: (v = Math.max(5, v + walk())) }))

  const W = 1280, H = 720, M = { l: 120, r: 140, t: 90, b: 110 }
  const x = d3.scaleTime(d3.extent(data, d => d.date) as [Date, Date], [M.l, W - M.r])
  const y = d3.scaleLinear(d3.extent(data, d => d.value) as [number, number], [H - M.b, M.t]).nice()
  const muted = color('muted'), accent = color('accent'), bg = color('bg'), surface = color('surface'), sheen = color('sheen')
  const svg = stage(d3, root)

  const ax = svg.append('g').attr('transform', `translate(0, ${H - M.b})`).call(d3.axisBottom(x).ticks(d3.timeMonth.every(2)).tickFormat(d => `${(d as Date).getMonth() + 1} 月`).tickSize(8).tickPadding(10))
  const ay = svg.append('g').attr('transform', `translate(${M.l}, 0)`).call(d3.axisLeft(y).ticks(5).tickSize(0).tickPadding(14))
  for (const g of [ax, ay]) g.attr('font-size', 20).attr('font-family', 'var(--pm-font-mono)').style('color', muted)
  ax.select('.domain').attr('stroke-width', 2)
  ay.select('.domain').remove()
  ay.selectAll('.tick line').clone().attr('x2', W - M.l - M.r).attr('stroke', color('line')).attr('stroke-width', 1.5)
  svg.append('text').attr('x', M.l - 14).attr('y', M.t - 34).attr('text-anchor', 'end').attr('font-size', 22).attr('fill', muted).text(title)
  svg.append('text').attr('x', W - M.r).attr('y', H - 22).attr('text-anchor', 'end').attr('font-size', 19).attr('fill', muted).text(caption)

  const points = data.map((d): XY => [x(d.date), y(d.value)])
  const curve = d3.curveMonotoneX
  const lineD = d3.line().curve(curve)(points)!
  const tipY = curveAt(d3, curve, points)
  const x0 = points[0]![0], x1 = points.at(-1)![0], tailMax = 0.14 * (x1 - x0)

  // Everything drawn so far lives under one clip that ends at the tip.
  const dark = isDark(bg)
  const clipId = defId('comet-clip'), fillId = defId('comet-fill'), tailId = defId('comet-tail'), coreId = defId('comet-core'), auraId = defId('comet-aura')
  const clip = svg.append('clipPath').attr('id', clipId).append('rect').attr('x', 0).attr('y', 0).attr('height', H)
  const defs = svg.append('defs')
  const gradient = (id: string, stops: [number, string][]) => {
    const g = defs.append('linearGradient').attr('id', id).attr('gradientUnits', 'userSpaceOnUse')
    for (const [offset, c] of stops) g.append('stop').attr('offset', offset).attr('stop-color', c)
    return g
  }
  gradient(fillId, [[0, alpha(accent, 0.2)], [1, alpha(accent, 0)]]).attr('x1', 0).attr('x2', 0).attr('y1', M.t).attr('y2', H - M.b)
  // The tail: a wide soft band of the accent, and on a dark page a hot core of the sheen inside it.
  const tails = [gradient(tailId, [[0, alpha(accent, 0)], [1, alpha(accent, dark ? 0.55 : 0.3)]]), gradient(coreId, [[0, alpha(sheen, 0)], [1, alpha(sheen, 0.85)]])]
  for (const g of tails) g.attr('y1', 0).attr('y2', 0)
  const aura = defs.append('radialGradient').attr('id', auraId)
  aura.append('stop').attr('offset', 0).attr('stop-color', alpha(accent, dark ? 0.6 : 0.32))
  aura.append('stop').attr('offset', 1).attr('stop-color', alpha(accent, 0))
  const drawn = svg.append('g').attr('clip-path', `url(#${clipId})`).attr('fill', 'none').attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round')
  drawn.append('path').attr('d', d3.area().curve(curve).y0(H - M.b)(points)!).attr('fill', `url(#${fillId})`).attr('stroke', 'none')
  const halo = drawn.append('g')
  halo.append('path').attr('d', lineD).attr('stroke', `url(#${tailId})`).attr('stroke-width', dark ? 15 : 12)
  drawn.append('path').attr('d', lineD).attr('stroke', accent).attr('stroke-width', 4.5)
  if (dark) halo.append('path').attr('d', lineD).attr('stroke', `url(#${coreId})`).attr('stroke-width', 2)

  const head = svg.append('g')
  const hot = head.append('g')
  hot.append('circle').attr('r', 34).attr('fill', `url(#${auraId})`)
  const core = hot.append('g').attr('filter', glow(svg, accent, bg, 6))
  core.append('circle').attr('r', 10).attr('fill', accent)
  if (dark) core.append('circle').attr('r', 4).attr('fill', sheen)
  const dot = head.append('circle').attr('r', 10).attr('fill', accent).attr('stroke', surface).attr('stroke-width', 3)
  const chip = svg.append('g')
  chip.append('rect').attr('x', 0).attr('y', -22).attr('height', 44).attr('rx', 10).attr('fill', accent)
  const value = chip.append('text').attr('x', 12).attr('dy', '0.36em').attr('font-family', 'var(--pm-font-mono)').attr('font-weight', 500).attr('font-size', 26).attr('fill', color('on-accent'))
  const fmt = d3.format('.1f')

  const ph = phaser(at)
  return (ms: number) => {
    const u = d3.easeCubicInOut(ph(ms, 0, 0.15, 0.75))
    const tx = x0 + (x1 - x0) * u, ty = tipY(tx)
    clip.attr('width', u > 0 ? tx : 0)
    // The glow and the tail go out after the stroke arrives; the plain dot takes the head's place.
    const out = d3.easeCubicInOut(ph(ms, 0, 0.75, 0.95))
    for (const g of tails) g.attr('x1', tx - Math.max(1, Math.min(tailMax, tx - x0))).attr('x2', tx)
    halo.attr('opacity', 1 - out)
    const shown = ph(ms, 0, 0.13, 0.2)
    head.attr('transform', `translate(${tx}, ${ty})`).attr('opacity', shown)
    hot.attr('opacity', 1 - out).attr('transform', `scale(${1 - 0.3 * out})`)
    dot.attr('opacity', out)
    const text = fmt(y.invert(ty))
    // Mono digits are 0.6 em wide, so the chip is sized by the character count, never measured.
    chip.attr('transform', `translate(${tx + 18}, ${ty - 34})`).attr('opacity', shown)
    chip.select('rect').attr('width', 24 + text.length * 26 * 0.6)
    value.text(text)
  }
})
