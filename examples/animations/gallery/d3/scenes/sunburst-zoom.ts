import { d3Scene } from '@lincyaw/addon-motion/scene'
import { H, W, clamp, phase, stage } from './kit/stage.ts'
import { FIELDS } from './kit/fields.ts'

// d3.partition laid out in polar coordinates and drawn with d3.arc: the rings sweep in ring by ring, then the
// "zoomable sunburst": the angle scale's domain narrows to one node's [x0, x1] and the radius scale shifts by one ring.
// Seek-safe: the arcs are re-run from the scales at `ms` (never tween the path string of an arc).
export default d3Scene(({ root, d3, at, color }) => {
  const R = 170
  const part = d3.partition<typeof FIELDS>().size([2 * Math.PI, 4])(d3.hierarchy(FIELDS).sum(d => d.value ?? 0).sort((a, b) => b.value! - a.value!))
  const nodes = part.descendants().filter(d => d.depth > 0)
  const groups = part.children!.map(d => d.data.name)
  const hue = d3.scaleOrdinal(groups, d3.schemeSet3.slice(2))
  const top = (d: (typeof nodes)[number]) => d.ancestors().find(a => a.depth === 1)!.data.name
  const angle = d3.scaleLinear([0, 2 * Math.PI], [0, 2 * Math.PI])
  const radius = d3.scaleLinear([0, 4], [0, R])
  const svg = stage(d3, root)
  const g = svg.append('g').attr('transform', `translate(${W / 2},${H / 2})`)
  const arcs = g.append('g').selectAll('path').data(nodes).join('path').attr('fill', d => d3.interpolateLab(hue(top(d)), 'white')(0.18 * (d.depth - 1))).attr('stroke', color('bg')).attr('stroke-width', 1)
  const labels = g.append('g').attr('text-anchor', 'middle').attr('font-size', 11).attr('fill', 'black').selectAll('text').data(nodes).join('text').attr('dy', '0.35em').text(d => d.data.name)
  const centre = g.append('text').attr('text-anchor', 'middle').attr('dy', '0.35em').attr('font-size', 16).attr('font-weight', 700).attr('fill', color('ink'))
  const ai = part.children!.find(d => d.data.name === '人工智能')!
  const arc = d3.arc<(typeof nodes)[number]>()
    .startAngle(d => clamp(angle(d.x0) / (2 * Math.PI)) * 2 * Math.PI).endAngle(d => clamp(angle(d.x1) / (2 * Math.PI)) * 2 * Math.PI)
    .innerRadius(d => Math.max(0, radius(d.y0))).outerRadius(d => Math.max(0, radius(d.y1) - 1)).padAngle(0.004).padRadius(R)
  return (ms: number) => {
    const p = phase(at, ms)
    const z = d3.easeCubicInOut(p(1)) - d3.easeCubicInOut(p(2))
    angle.domain([d3.interpolateNumber(0, ai.x0)(z), d3.interpolateNumber(2 * Math.PI, ai.x1)(z)])
    radius.domain([d3.interpolateNumber(0, 1)(z), 4]).range([d3.interpolateNumber(0, 40)(z), R])
    const grow = p(0)
    arcs.attr('d', d => {
      // Step 0: ring d sweeps round during its slice of the step.
      const s = d3.easeCubicInOut(clamp(grow * 3 - (d.depth - 1)))
      const a0 = angle(d.x0), a1 = angle(d.x1)
      return s <= 0 ? null : arc({ ...d, x0: d.x0, x1: s >= 1 ? d.x1 : angle.invert(a0 + (a1 - a0) * s) } as never)
    }).attr('fill-opacity', d => (d.ancestors().includes(ai) || z < 0.01 ? 0.9 : 0.9 - 0.6 * z))
    labels.attr('transform', d => {
      const a = (clamp(angle(d.x0) / (2 * Math.PI)) + clamp(angle(d.x1) / (2 * Math.PI))) * Math.PI
      const r = (Math.max(0, radius(d.y0)) + radius(d.y1)) / 2
      const deg = a * 180 / Math.PI
      return `rotate(${deg - 90}) translate(${r},0) rotate(${deg < 180 ? 0 : 180})`
    }).attr('opacity', d => {
      const span = (clamp(angle(d.x1) / (2 * Math.PI)) - clamp(angle(d.x0) / (2 * Math.PI))) * 2 * Math.PI * (radius(d.y0) + radius(d.y1)) / 2
      return clamp((span - 26) / 12) * clamp(grow * 3 - d.depth + 0.2) * (radius(d.y0) >= -0.5 ? 1 : 0)
    })
    centre.text(z > 0.5 ? ai.data.name : '计算机').attr('opacity', Math.abs(z - 0.5) * 2 * clamp(grow * 3))
  }
})
