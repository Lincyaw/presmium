import { d3Scene } from '@lincyaw/addon-motion/scene'
import { defId, phaser, stage, textOn } from '../../../lengths/scenes/kit/d3-fx.ts'

// Tile map, with D3: a choropleth on a grid of equal squares, one per region, so a small region counts as much as
// a large one and no map data has to ship. The default grid is China's 34 provincial regions. Three states, 6.5 s.
// `grid` (1.5 s): the tiles appear as a wave from the grid's centre (stagger capped at 0.6 s and eased), each with
// its short name; then the title and the empty legend. The reader learns the layout before any value.
// `fill` (2.5 s): a marker sweeps the legend from the lowest value to the highest (1.6 s, eased) and each tile takes
// its colour as the marker passes its value: one clock, two readouts, so the map fills from the low regions to the
// high ones and the distribution is seen being built. Then 0.9 s of rest.
// `focus` (2.5 s): all but the top `top` regions dim to a third; the leaders get an accent outline; a ranked list
// with their values rises beside the map, 70 ms apart. At least 1.5 s of rest on the result.
// A region without a value is drawn hatched, labelled "无数据" in the legend. Values default to illustrative data,
// labelled "示意数据" on screen; pass `values`, `unit`, `title` and `source`. Merges HyperFrames us-map (choropleth),
// spain-map and world-map (the same reveal, which here needs no geography) and us-map-hex. Adapted from HyperFrames
// us-map-hex.
type Tile = [name: string, col: number, row: number]
const CHINA: Tile[] = [
  ['黑龙江', 7, 0],
  ['内蒙古', 4, 1], ['北京', 5, 1], ['辽宁', 6, 1], ['吉林', 7, 1],
  ['新疆', 0, 2], ['宁夏', 3, 2], ['山西', 4, 2], ['河北', 5, 2], ['天津', 6, 2],
  ['西藏', 0, 3], ['青海', 1, 3], ['甘肃', 2, 3], ['陕西', 3, 3], ['河南', 4, 3], ['山东', 5, 3],
  ['四川', 1, 4], ['重庆', 2, 4], ['湖北', 3, 4], ['安徽', 4, 4], ['江苏', 5, 4], ['上海', 6, 4],
  ['云南', 1, 5], ['贵州', 2, 5], ['湖南', 3, 5], ['江西', 4, 5], ['浙江', 5, 5],
  ['广西', 2, 6], ['广东', 3, 6], ['福建', 4, 6], ['台湾', 5, 6],
  ['海南', 2, 7], ['澳门', 3, 7], ['香港', 4, 7],
]
const VALUES: Record<string, number> = {
  广东: 98, 江苏: 86, 山东: 80, 浙江: 78, 河南: 72, 四川: 70, 湖北: 62, 湖南: 58, 河北: 55, 福建: 52, 安徽: 50, 北京: 48,
  上海: 46, 陕西: 42, 江西: 38, 辽宁: 36, 重庆: 35, 广西: 34, 云南: 33, 山西: 30, 贵州: 28, 黑龙江: 26, 吉林: 22, 天津: 21,
  内蒙古: 18, 甘肃: 17, 新疆: 16, 海南: 12, 香港: 10, 宁夏: 8, 青海: 6, 西藏: 4, 澳门: 3,
}
const W = 1280, H = 720

export default d3Scene(({ root, d3, at, color, parameters }) => {
  const tiles = (Array.isArray(parameters.tiles) ? parameters.tiles : CHINA) as Tile[]
  const values = (parameters.values as Record<string, number> | undefined) ?? VALUES
  const unit = typeof parameters.unit === 'string' ? parameters.unit : '万人'
  const title = typeof parameters.title === 'string' ? parameters.title : '在线课程注册人数'
  const source = typeof parameters.source === 'string' ? parameters.source : '示意数据'
  const top = Math.max(1, Number(parameters.top ?? 3))
  const cols = d3.max(tiles, t => t[1])! + 1, rows = d3.max(tiles, t => t[2])! + 1
  const size = Math.min(560 / rows, 600 / cols), gap = size * 0.08, cell = size - gap
  const ox = 90, oy = 120 + (560 - rows * size) / 2
  const known = tiles.filter(t => Number.isFinite(values[t[0]]))
  const max = d3.max(known, t => values[t[0]]!) ?? 1
  const ranked = [...known].sort((a, b) => values[b[0]]! - values[a[0]]!).slice(0, top)
  const lead = new Set(ranked.map(t => t[0]))

  const ink = color('ink'), muted = color('muted'), accent = color('accent'), empty = color('sunk')
  const scale = d3.scaleSequential(d3.interpolateRgb.gamma(1.4)(color('accent-soft'), accent)).domain([0, max])
  const svg = stage(d3, root).style('font-variant-numeric', 'tabular-nums')
  const hatchId = defId('tile-hatch')
  svg.append('defs').append('pattern').attr('id', hatchId).attr('width', 10).attr('height', 10).attr('patternUnits', 'userSpaceOnUse').attr('patternTransform', 'rotate(45)')
    .append('line').attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 10).attr('stroke', color('line-strong')).attr('stroke-width', 2)

  // Wave order: by distance from the grid's centre, normalised, so the total stagger is fixed.
  const cx = (cols - 1) / 2, cy = (rows - 1) / 2
  const far = d3.max(tiles, t => Math.hypot(t[1] - cx, t[2] - cy))!
  const g = svg.append('g').selectAll('g').data(tiles).join('g')
  const sq = g.append('rect').attr('x', -cell / 2).attr('y', -cell / 2).attr('width', cell).attr('height', cell).attr('rx', cell * 0.12)
  const nameText = g.append('text').attr('text-anchor', 'middle').attr('y', cell * 0.1).attr('font-weight', 500)
    .attr('font-size', t => Math.min(22, cell * 0.3) * (t[0].length > 2 ? 0.78 : 1)).text(t => t[0])

  const titleEl = svg.append('text').attr('x', ox).attr('y', 78).attr('font-size', 36).attr('font-weight', 600).attr('fill', ink).text(`${title}（${unit}）`)
  svg.append('text').attr('x', ox).attr('y', H - 26).attr('font-size', 20).attr('fill', muted).text(source)
  // The legend: a gradient bar from 0 to the maximum, a marker that sweeps it during `fill`, and the no-data swatch.
  const lx = 780, ly = 170, lw = 380
  const gradId = defId('tile-grad')
  const grad = svg.append('defs').append('linearGradient').attr('id', gradId)
  d3.range(0, 1.0001, 0.1).forEach(p => grad.append('stop').attr('offset', p).attr('stop-color', scale(p * max)))
  const legend = svg.append('g')
  legend.append('rect').attr('x', lx).attr('y', ly).attr('width', lw).attr('height', 18).attr('rx', 9).attr('fill', `url(#${gradId})`)
  legend.selectAll('text.tick').data([0, max]).join('text').attr('x', (_, i) => lx + i * lw).attr('y', ly + 50).attr('text-anchor', (_, i) => (i ? 'end' : 'start'))
    .attr('font-family', 'var(--pm-font-mono)').attr('font-size', 20).attr('fill', muted).text(d => String(d))
  const hasEmpty = tiles.length > known.length
  if (hasEmpty) {
    legend.append('rect').attr('x', lx).attr('y', ly + 76).attr('width', 26).attr('height', 26).attr('rx', 4).attr('fill', `url(#${hatchId})`).attr('stroke', color('line-strong'))
    legend.append('text').attr('x', lx + 38).attr('y', ly + 96).attr('font-size', 20).attr('fill', muted).text('无数据')
  }
  const marker = svg.append('path').attr('d', 'M -9 -14 L 9 -14 L 0 0 Z').attr('fill', ink)
  const list = svg.append('g').attr('transform', `translate(${lx}, ${ly + 170})`).selectAll('g').data(ranked).join('g')
  list.append('text').attr('x', 0).attr('y', 0).attr('font-size', 26).attr('fill', muted).attr('font-family', 'var(--pm-font-mono)').text((_, i) => `${i + 1}`)
  list.append('text').attr('x', 40).attr('y', 0).attr('font-size', 30).attr('font-weight', 600).attr('fill', ink).text(t => t[0])
  list.append('text').attr('x', lw).attr('y', 0).attr('text-anchor', 'end').attr('font-family', 'var(--pm-font-mono)').attr('font-size', 30).attr('font-weight', 500)
    .attr('fill', accent).text(t => `${values[t[0]]}`)
  list.append('line').attr('x1', 0).attr('x2', lw).attr('y1', 22).attr('y2', 22).attr('stroke', color('line'))

  const ph = phaser(at)
  const pop = d3.easeBackOut.overshoot(1.3)
  return (ms: number) => {
    const sweep = d3.easeCubicInOut(ph(ms, 1, 0, 0.64)) * max
    const focus = d3.easeCubicInOut(ph(ms, 2, 0, 0.2))
    g.attr('transform', t => {
      const delay = 0.6 * d3.easeQuadOut(Math.hypot(t[1] - cx, t[2] - cy) / far)
      const p = Math.max(0, Math.min(1, (ms / 1000 - delay) / 0.4))
      return `translate(${ox + t[1] * size + size / 2}, ${oy + t[2] * size + size / 2}) scale(${0.5 + 0.5 * pop(p)})`
    }).attr('opacity', t => {
      const delay = 0.6 * d3.easeQuadOut(Math.hypot(t[1] - cx, t[2] - cy) / far)
      return Math.max(0, Math.min(1, (ms / 1000 - delay) / 0.2)) * (lead.has(t[0]) ? 1 : 1 - 0.65 * focus)
    })
    // A tile takes its colour as the marker passes its value (a 0.25 s fade, so the fill reads as arriving).
    const lit = (t: Tile) => { const v = values[t[0]]; return v === undefined ? 0 : Math.max(0, Math.min(1, (sweep - v) / (0.08 * max) + (sweep >= max ? 1 : 0))) }
    sq.attr('fill', t => (values[t[0]] === undefined ? `url(#${hatchId})` : d3.interpolateRgb(empty, scale(values[t[0]]!))(lit(t))))
      .attr('stroke', t => (lead.has(t[0]) ? d3.interpolateRgb(color('line'), ink)(focus) : color('line'))).attr('stroke-width', t => (lead.has(t[0]) ? 1 + 3 * focus : 1))
    nameText.attr('fill', t => (values[t[0]] === undefined ? muted : lit(t) > 0.5 ? textOn(scale(values[t[0]]!), ink, color('bg')) : ink))
    titleEl.attr('opacity', ph(ms, 0, 0.45, 0.7))
    legend.attr('opacity', ph(ms, 0, 0.6, 0.85))
    marker.attr('transform', `translate(${lx + (sweep / max) * lw}, ${ly - 2})`).attr('opacity', ph(ms, 1, 0, 0.05) * (1 - ph(ms, 2, 0, 0.15)))
    list.attr('transform', (_, i) => `translate(0, ${i * 62 + 14 * (1 - d3.easeExpOut(ph(ms, 2, 0.12 + i * 0.028, 0.3 + i * 0.028)))})`)
      .attr('opacity', (_, i) => ph(ms, 2, 0.12 + i * 0.028, 0.24 + i * 0.028))
  }
})
