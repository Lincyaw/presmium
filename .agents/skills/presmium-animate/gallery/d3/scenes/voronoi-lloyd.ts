import { d3Scene } from '@lincyaw/addon-motion/scene'
import { H, W, clamp, phase, stage } from './kit/stage.ts'

// d3.Delaunay: points, their Delaunay triangulation (delaunay.render), the Voronoi diagram (voronoi.cellPolygon),
// then Lloyd relaxation, each point moving to its cell's d3.polygonCentroid. The relaxation is iterated at build
// and each frame lerps between two iterations, then rebuilds the diagram from those points (cheap for 70 points).
export default d3Scene(({ root, d3, at, color }) => {
  const rnd = d3.randomLcg(21)
  const N = 70
  const first = d3.range(N).map(() => [W * 0.5 + (rnd() - 0.5) * W * 0.55 * (0.4 + rnd()), H * 0.5 + (rnd() - 0.5) * H * 0.55 * (0.4 + rnd())] as [number, number])
  const box = [6, 6, W - 6, H - 6] as const
  const iterations = [first]
  for (let k = 0; k < 40; k++) {
    const v = d3.Delaunay.from(iterations[k]!).voronoi(box)
    iterations.push(iterations[k]!.map((pt, i) => { const c = v.cellPolygon(i); return c ? d3.polygonCentroid(c as [number, number][]) : pt }))
  }
  const hue = (i: number) => d3.interpolateRainbow(i / N)
  const svg = stage(d3, root)
  const cells = svg.append('g').attr('stroke', color('bg')).attr('stroke-width', 1.5).selectAll('path').data(d3.range(N)).join('path').attr('fill', i => hue(i))
  const tri = svg.append('path').attr('fill', 'none').attr('stroke', color('muted')).attr('stroke-width', 1).attr('pathLength', 1).attr('stroke-dasharray', '1 1')
  const dots = svg.append('g').attr('fill', color('ink')).selectAll('circle').data(d3.range(N)).join('circle')
  const sinceTri = d3.Delaunay.from(first)
  tri.attr('d', sinceTri.render())
  return (ms: number) => {
    const p = phase(at, ms)
    const f = d3.easeCubicInOut(p(3)) * (iterations.length - 1)
    const a = iterations[Math.floor(f)]!, b = iterations[Math.min(iterations.length - 1, Math.floor(f) + 1)]!
    const pts = a.map((pt, i) => d3.interpolate(pt, b[i]!)(f % 1) as [number, number])
    const delaunay = d3.Delaunay.from(pts)
    const voronoi = delaunay.voronoi(box)
    dots.attr('cx', i => pts[i]![0]).attr('cy', i => pts[i]![1]).attr('r', i => 3.5 * d3.easeBackOut(clamp(p(0) * 2 - i / N)))
    tri.attr('stroke-dashoffset', 1 - p(1)).attr('opacity', 1 - p(2) * 0.85)
    if (p(3) > 0) tri.attr('d', delaunay.render())
    else tri.attr('d', sinceTri.render())
    // Step 2: the cells fade in, in index order.
    cells.attr('d', i => voronoi.renderCell(i)).attr('fill-opacity', i => 0.55 * clamp(p(2) * 2 - i / N))
  }
})
