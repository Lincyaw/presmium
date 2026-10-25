import { d3Scene } from '@lincyaw/addon-motion/scene'
import { H, W, clamp, phase, stage } from './kit/stage.ts'
import { FIELDS } from './kit/fields.ts'

// d3.pack nests circles by value, and d3.interpolateZoom flies the view [cx, cy, width] from one circle to another
// (zooming out and back in, as in the "zoomable circle packing"). Seek-safe: the view is interpolateZoom(t)
// with t from `ms`; the interpolator's own suggested duration is ignored, the step's duration is used.
export default d3Scene(({ root, d3, at, color }) => {
  const rootNode = d3.pack<typeof FIELDS>().size([H, H]).padding(4)(d3.hierarchy(FIELDS).sum(d => d.value ?? 0).sort((a, b) => b.value! - a.value!))
  const nodes = rootNode.descendants()
  const find = (name: string) => nodes.find(d => d.data.name === name)!
  const views = [rootNode, find('人工智能'), find('系统')].map(d => [d.x, d.y, d.r * 2.1] as [number, number, number])
  const zoom1 = d3.interpolateZoom(views[0]!, views[1]!), zoom2 = d3.interpolateZoom(views[1]!, views[2]!)
  const shade = d3.scaleLinear<string>().domain([0, 3]).range([color('accent-soft'), color('accent')]).interpolate(d3.interpolateLab)
  const svg = stage(d3, root)
  const g = svg.append('g').attr('transform', `translate(${W / 2},${H / 2})`)
  const circles = g.selectAll('circle').data(nodes).join('circle')
    .attr('fill', d => (d.children ? shade(d.depth) : color('surface'))).attr('fill-opacity', d => (d.children ? 0.55 : 1))
    .attr('stroke', d => (d.children ? 'none' : color('line-strong')))
  const labels = g.append('g').attr('text-anchor', 'middle').attr('fill', color('ink')).selectAll('text').data(nodes).join('text').attr('dy', '0.35em').text(d => d.data.name)
  return (ms: number) => {
    const p = phase(at, ms)
    const view = p(2) > 0 ? zoom2(d3.easeCubicInOut(p(2))) : zoom1(d3.easeCubicInOut(p(1)))
    const k = H / view[2]
    const grow = p(0)
    const local = (d: { depth: number }) => d3.easeBackOut(clamp(grow * (rootNode.height + 1) - d.depth))
    circles.attr('transform', d => `translate(${(d.x - view[0]) * k},${(d.y - view[1]) * k})`).attr('r', d => d.r * k * local(d))
    // Labels: a circle shows its name when it is big enough on screen and its parent is the one in view.
    labels.attr('transform', d => `translate(${(d.x - view[0]) * k},${(d.y - view[1]) * k + (d.children ? -d.r * k + 14 : 0)})`)
      .attr('font-size', d => (d.children ? 14 : Math.min(14, d.r * k / 3)))
      .attr('opacity', d => {
        const size = d.r * k
        if (d.depth === 0) return 0
        return clamp((size - 24) / 20) * clamp(grow * (rootNode.height + 1) - d.depth) * (d.children && size > H * 0.8 ? clamp((H * 1.1 - size) / (H * 0.3)) : 1)
      })
  }
})
