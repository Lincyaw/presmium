import { d3Scene } from '@lincyaw/addon-motion/scene'
import { H, W, clamp, phase, stage } from './kit/stage.ts'

// d3.quadtree: points are added one by one and the tree's squares (quadtree.visit) split; then a probe moves and
// quadtree.find draws a line to its nearest neighbour. Seek-safe: the tree is rebuilt from the first n points
// at `ms` (addAll on a fresh tree), never added to across frames.
export default d3Scene(({ root, d3, at, color }) => {
  const rnd = d3.randomLcg(4)
  const N = 90
  const pts = d3.range(N).map(() => [20 + rnd() * (W - 40), 20 + rnd() * (H - 40)] as [number, number])
  const svg = stage(d3, root)
  const squares = svg.append('g').attr('fill', 'none').attr('stroke', color('line-strong'))
  const dots = svg.append('g').selectAll('circle').data(pts).join('circle').attr('cx', d => d[0]).attr('cy', d => d[1])
  const link = svg.append('line').attr('stroke', color('danger')).attr('stroke-width', 2.5)
  const probe = svg.append('circle').attr('r', 7).attr('fill', 'none').attr('stroke', color('danger')).attr('stroke-width', 2.5)
  const ring = svg.append('circle').attr('fill', 'none').attr('stroke', color('danger')).attr('stroke-dasharray', '4 4')
  const accent = color('accent'), danger = color('danger')
  return (ms: number) => {
    const p = phase(at, ms)
    const n = Math.round(N * p(0))
    const tree = d3.quadtree<[number, number]>().extent([[0, 0], [W, H]]).addAll(pts.slice(0, n))
    const boxes: [number, number, number, number][] = []
    tree.visit((_, x0, y0, x1, y1) => { boxes.push([x0, y0, x1, y1]); return false })
    squares.selectAll('rect').data(boxes).join('rect').attr('x', d => d[0]).attr('y', d => d[1]).attr('width', d => d[2] - d[0]).attr('height', d => d[3] - d[1]).attr('stroke-opacity', 0.6)
    // Step 1: the probe moves on a Lissajous curve; find() gives the nearest point.
    const t = p(1)
    const q: [number, number] = [W / 2 + (W / 2 - 60) * Math.sin(t * Math.PI * 2), H / 2 + (H / 2 - 50) * Math.sin(t * Math.PI * 3)]
    const near = t > 0 ? tree.find(q[0], q[1]) : undefined
    const on = t > 0 && t < 1 && near ? 1 : 0
    probe.attr('cx', q[0]).attr('cy', q[1]).attr('opacity', on)
    link.attr('x1', q[0]).attr('y1', q[1]).attr('x2', near?.[0] ?? q[0]).attr('y2', near?.[1] ?? q[1]).attr('opacity', on)
    ring.attr('cx', q[0]).attr('cy', q[1]).attr('r', near ? Math.hypot(near[0] - q[0], near[1] - q[1]) : 0).attr('opacity', on * 0.7)
    dots.attr('r', (_, i) => (i < n ? (on && pts[i] === near ? 6 : 3.5) : 0) * clamp(1))
      .attr('fill', (_, i) => (on && pts[i] === near ? danger : accent))
  }
})
