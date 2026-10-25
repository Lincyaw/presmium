import { d3Scene } from '@lincyaw/addon-motion/scene'
import { H, W, clamp, phase, stage } from './kit/stage.ts'

// d3.contourDensity estimates a 2-D density from points and returns iso-bands as GeoJSON, drawn with d3.geoPath();
// the bands appear from the outside in, then the kernel bandwidth sweeps from wide to narrow. Seek-safe: the
// density is recomputed from the bandwidth at `ms` (about 2 ms for 400 points), not tweened.
export default d3Scene(({ root, d3, at, color }) => {
  const src = d3.randomLcg(13)
  const CL = [[190, 150, 40, 30], [420, 120, 30, 26], [380, 255, 55, 22]] as const
  const pts = d3.range(420).map(() => {
    const c = CL[Math.floor(src() * 3)]!
    return [d3.randomNormal.source(src)(c[0], c[2])(), d3.randomNormal.source(src)(c[1], c[3])()] as [number, number]
  })
  const density = (bw: number) => d3.contourDensity().size([W, H]).bandwidth(bw).thresholds(12)(pts)
  const path = d3.geoPath()
  const svg = stage(d3, root)
  const bands = svg.append('g').attr('stroke-linejoin', 'round')
  const dots = svg.append('g').attr('fill', color('ink')).selectAll('circle').data(pts).join('circle').attr('cx', d => d[0]).attr('cy', d => d[1])
  const label = svg.append('text').attr('x', 20).attr('y', H - 20).attr('font-family', 'var(--pm-font-mono)').attr('font-size', 15).attr('fill', color('muted'))
  return (ms: number) => {
    const p = phase(at, ms)
    const bw = d3.interpolateNumber(26, 9)(d3.easeCubicInOut(p(2)))
    const contours = density(bw)
    const heat = d3.scaleSequential((t: number) => d3.interpolateMagma(0.25 + 0.7 * t)).domain([0, contours.length - 1])
    // Step 1: band j (outermost first) fades in during its slice of the step.
    bands.selectAll('path').data(contours).join('path').attr('d', path)
      .attr('fill', (_, j) => heat(j)).attr('fill-opacity', (_, j) => 0.75 * clamp(p(1) * (contours.length + 2) / 2 - j / 2))
      .attr('stroke', color('bg')).attr('stroke-opacity', 0.4)
    dots.attr('r', (_, i) => 1.8 * clamp(p(0) * 2 - i / pts.length)).attr('fill-opacity', 0.75 - 0.4 * p(1))
    label.text(`bandwidth = ${bw.toFixed(1)}`).attr('opacity', p(1))
  }
})
