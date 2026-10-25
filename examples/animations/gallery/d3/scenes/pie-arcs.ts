import { d3Scene } from '@lincyaw/addon-motion/scene'
import { H, W, phase, stage } from './kit/stage.ts'

// d3.pie computes the angles, d3.arc draws them: the pie sweeps in, opens into a donut (innerRadius, padAngle,
// cornerRadius), then the data change and every arc tweens its start and end angle (the classic "arcTween").
// Pitfall: interpolating the path string of an arc distorts it; interpolate the angles and re-run d3.arc.
const LABELS = ['训练', '推理', '存储', '网络', '其他']
const BEFORE = [42, 23, 15, 12, 8]
const AFTER = [18, 47, 12, 9, 14]

export default d3Scene(({ root, d3, at, color }) => {
  const pie = d3.pie<number>().sort(null)
  const A = pie(BEFORE), B = pie(AFTER)
  const R = 150
  const colors = d3.quantize(t => d3.interpolateWarm(0.1 + 0.8 * t), LABELS.length)
  const svg = stage(d3, root)
  const g = svg.append('g').attr('transform', `translate(${W / 2 - 90},${H / 2})`)
  const arcs = g.append('g').selectAll('path').data(LABELS).join('path').attr('fill', (_, i) => colors[i]!).attr('stroke', color('bg')).attr('stroke-width', 1.5)
  const texts = g.append('g').attr('text-anchor', 'middle').attr('font-size', 13).attr('font-weight', 600).attr('fill', 'black')
    .selectAll('text').data(LABELS).join('text')
  const center = g.append('text').attr('text-anchor', 'middle').attr('dy', '0.35em').attr('font-size', 24).attr('font-family', 'var(--pm-font-mono)').attr('fill', color('ink'))
  const legend = svg.append('g').attr('transform', `translate(${W / 2 + 110},${H / 2 - 70})`).attr('font-size', 15)
  legend.selectAll('g').data(LABELS).join('g').attr('transform', (_, i) => `translate(0,${i * 30})`)
    .call(r => r.append('rect').attr('width', 16).attr('height', 16).attr('y', -8).attr('rx', 3).attr('fill', (_, i) => colors[i]!))
    .call(r => r.append('text').attr('x', 24).attr('dy', '0.35em').attr('fill', color('ink')).text(d => d))
  const arc = d3.arc<{ startAngle: number, endAngle: number }>()
  const pct = d3.format('.0%')
  return (ms: number) => {
    const p = phase(at, ms)
    const sweep = d3.easeCubicInOut(p(0))
    const donut = d3.easeCubicInOut(p(1))
    const change = d3.easeCubicInOut(p(2))
    arc.innerRadius(R * 0.55 * donut).outerRadius(R).padAngle(0.03 * donut).cornerRadius(6 * donut)
    const angles = LABELS.map((_, i) => ({
      startAngle: d3.interpolateNumber(A[i]!.startAngle, B[i]!.startAngle)(change) * sweep,
      endAngle: d3.interpolateNumber(A[i]!.endAngle, B[i]!.endAngle)(change) * sweep,
    }))
    arcs.attr('d', (_, i) => arc(angles[i]!))
    const label = d3.arc<{ startAngle: number, endAngle: number }>().innerRadius(R * 0.78).outerRadius(R * 0.78)
    texts.attr('transform', (_, i) => `translate(${label.centroid(angles[i]!)})`).attr('dy', '0.35em')
      .attr('opacity', p(1)).text((_, i) => pct(d3.interpolateNumber(BEFORE[i]!, AFTER[i]!)(change) / 100))
    center.attr('opacity', donut).text(change < 0.5 ? '2024' : '2026')
  }
})
