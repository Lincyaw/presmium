import type * as D3 from 'd3'
import { d3Scene } from '@lincyaw/addon-motion/scene'
import { H, W, clamp, phase, stage } from './kit/stage.ts'
import { FIELDS } from './kit/fields.ts'

// d3.treemap with two tiling methods (treemapSquarify and treemapSliceDice): both layouts are computed at build
// and each rectangle lerps between them (pitfall: paddingOuter sets all four sides, so it goes before paddingTop); then the view zooms into one group by changing the domains of two linear
// scales. Seek-safe: every rectangle is placed from the layouts and scales at `ms`.
export default d3Scene(({ root, d3, at, color }) => {
  const make = (tile: D3.RatioSquarifyTilingFactory | typeof D3.treemapSliceDice) => d3.treemap<typeof FIELDS>().size([W, H]).paddingInner(2).paddingOuter(3).paddingTop(18).tile(tile)(
    d3.hierarchy(FIELDS).sum(d => d.value ?? 0).sort((a, b) => b.value! - a.value!))
  const A = make(d3.treemapSquarify).descendants(), B = make(d3.treemapSliceDice).descendants()
  const groups = A.filter(d => d.depth === 1).map(d => d.data.name)
  const hue = d3.scaleOrdinal(groups, d3.schemeSet3.slice(2))
  const top = (d: (typeof A)[number]) => d.ancestors().find(a => a.depth === 1)?.data.name ?? ''
  const x = d3.scaleLinear([0, W], [0, W]), y = d3.scaleLinear([0, H], [0, H])
  const svg = stage(d3, root)
  svg.append('clipPath').attr('id', 'd3-treemap-clip').append('rect').attr('width', W).attr('height', H)
  const cells = svg.append('g').attr('clip-path', 'url(#d3-treemap-clip)').selectAll('g').data(A.filter(d => d.depth > 0)).join('g')
  const rects = cells.append('rect').attr('fill', d => hue(top(d))).attr('fill-opacity', d => (d.children ? 0.3 : 1)).attr('rx', 2)
  const texts = cells.append('text').attr('x', 4).attr('y', 13).attr('font-size', 12).attr('fill', d => (d.children ? color('ink') : 'black'))
    .attr('font-weight', d => (d.children ? 700 : 400)).text(d => d.data.name)
  const index = new Map(A.map((d, i) => [d, i]))
  const target = A.find(d => d.data.name === '机器学习')!
  const target2 = B[index.get(target)!]!
  return (ms: number) => {
    const p = phase(at, ms)
    const grow = p(0), tile = d3.easeCubicInOut(p(1)), zoom = d3.easeCubicInOut(p(2))
    const box = (i: number) => {
      const a = A[i]!, b = B[i]!
      return [a.x0, a.y0, a.x1, a.y1].map((v, j) => d3.interpolateNumber(v, [b.x0, b.y0, b.x1, b.y1][j]!)(tile))
    }
    // Step 2 zooms into the group: the scales' domains go from the whole box to the group's box.
    const tb = [target.x0, target.y0, target.x1, target.y1].map((v, j) => d3.interpolateNumber(v, [target2.x0, target2.y0, target2.x1, target2.y1][j]!)(tile))
    x.domain([d3.interpolateNumber(0, tb[0]!)(zoom), d3.interpolateNumber(W, tb[2]!)(zoom)])
    y.domain([d3.interpolateNumber(0, tb[1]!)(zoom), d3.interpolateNumber(H, tb[3]!)(zoom)])
    cells.each(function (d) {
      const [x0, y0, x1, y1] = box(index.get(d)!)
      const local = d3.easeCubicOut(clamp(grow * 3 - (d.depth - 1)))
      const w = (x(x1!) - x(x0!)) * local, h = (y(y1!) - y(y0!)) * local
      const el = d3.select(this).attr('transform', `translate(${x(x0!)},${y(y0!)})`).attr('opacity', local)
      el.select('rect').attr('width', Math.max(0, w)).attr('height', Math.max(0, h))
      el.select('text').attr('opacity', w > 46 && h > 18 ? 1 : 0)
    })
    void rects; void texts
  }
})
