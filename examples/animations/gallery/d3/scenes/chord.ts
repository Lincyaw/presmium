import type * as D3 from 'd3'
import { d3Scene } from '@lincyaw/addon-motion/scene'
import { H, W, clamp, phase, stage } from './kit/stage.ts'

// d3.chord lays out a flow matrix as group arcs and ribbons (d3.ribbon): the groups sweep in, the ribbons grow from
// their sources, then one group is singled out. Seek-safe: every arc and ribbon is drawn from the layout and the
// progress at `ms`; ribbons grow by scaling their target angles toward the source.
const NAMES = ['北京', '上海', '广州', '成都', '武汉']
const MATRIX = [
  [0, 52, 31, 18, 22],
  [48, 0, 40, 15, 27],
  [25, 37, 0, 20, 9],
  [21, 12, 17, 0, 14],
  [26, 30, 11, 16, 0],
]

export default d3Scene(({ root, d3, at, color }) => {
  const R = 140
  const chords = d3.chord().padAngle(0.05).sortSubgroups(d3.descending)(MATRIX)
  const hue = d3.scaleOrdinal(d3.range(NAMES.length), d3.schemeTableau10)
  const arc = d3.arc<D3.ChordGroup>().innerRadius(R).outerRadius(R + 16)
  const ribbon = d3.ribbon<D3.Chord, D3.ChordSubgroup>().radius(R - 1)
  const svg = stage(d3, root)
  const g = svg.append('g').attr('transform', `translate(${W / 2},${H / 2})`)
  const groups = g.append('g').selectAll('path').data(chords.groups).join('path').attr('fill', d => hue(d.index))
  const names = g.append('g').attr('font-size', 15).attr('fill', color('ink')).selectAll('text').data(chords.groups).join('text').attr('dy', '0.35em').text(d => NAMES[d.index]!)
  const ribbons = g.append('g').attr('fill-opacity', 0.7).selectAll('path').data(chords).join('path').attr('fill', d => hue(d.source.index)).attr('stroke', color('bg')).attr('stroke-width', 0.5)
  const FOCUS = 1
  return (ms: number) => {
    const p = phase(at, ms)
    const sweep = d3.easeCubicInOut(p(0))
    groups.attr('d', d => arc({ ...d, startAngle: d.startAngle * sweep, endAngle: d.endAngle * sweep }))
    names.attr('transform', d => {
      const a = (d.startAngle + d.endAngle) / 2
      return `rotate(${a * 180 / Math.PI - 90}) translate(${R + 26}) ${a > Math.PI ? 'rotate(180)' : ''}`
    }).attr('text-anchor', d => ((d.startAngle + d.endAngle) / 2 > Math.PI ? 'end' : 'start')).attr('opacity', p(0, 0.6, 1))
    ribbons.attr('d', (d, i) => {
      const s = d3.easeCubicInOut(clamp(p(1) * 2 - i / chords.length))
      if (s <= 0) return null
      const mid = (x: D3.ChordSubgroup) => (x.startAngle + x.endAngle) / 2
      // The target end opens from the source's middle toward its own place.
      const lerp = (a: number, b: number) => a + (b - a) * s
      const t = { ...d.target, startAngle: lerp(mid(d.source), d.target.startAngle), endAngle: lerp(mid(d.source), d.target.endAngle) }
      return ribbon({ source: d.source, target: t } as never) as unknown as string
    }).attr('fill-opacity', d => (d.source.index === FOCUS || d.target.index === FOCUS ? 0.75 : 0.75 - 0.65 * p(2)))
    groups.attr('fill-opacity', d => (d.index === FOCUS ? 1 : 1 - 0.6 * p(2)))
  }
})
