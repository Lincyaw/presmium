import { d3Scene } from '@lincyaw/addon-motion/scene'
import { H, W, clamp, phase, stage } from './kit/stage.ts'
import { FIELDS } from './kit/fields.ts'

// D3 computes, the scene moves: d3.hierarchy laid out three times (d3.tree, d3.cluster, d3.tree in polar
// coordinates with d3.pointRadial); each frame lerps the node positions between two layouts. Links: d3.linkHorizontal
// and d3.linkRadial both write "M … C …", so d3.interpolateString blends their path strings exactly.
export default d3Scene(({ root, d3, at, color }) => {
  const R = 118
  const make = () => d3.hierarchy(FIELDS)
  const tidy = d3.tree<typeof FIELDS>().size([H - 40, W - 220])(make())
  const clus = d3.cluster<typeof FIELDS>().size([H - 40, W - 220])(make())
  const rad = d3.tree<typeof FIELDS>().size([2 * Math.PI, R]).separation((a, b) => (a.parent === b.parent ? 1 : 2) / a.depth)(make())
  const nodes = tidy.descendants()
  const index = new Map(nodes.map((d, i) => [d, i]))
  const C = clus.descendants(), Q = rad.descendants()
  // Horizontal layouts: x is the breadth, y the depth, so a point is [y, x].
  const flatAt = (L: typeof C, i: number) => [50 + L[i]!.y, 20 + L[i]!.x] as [number, number]
  const radAt = (i: number) => { const [px, py] = d3.pointRadial(Q[i]!.x, Q[i]!.y); return [W / 2 + px, H / 2 + py] as [number, number] }
  const links = tidy.links().map(l => [index.get(l.source)!, index.get(l.target)!] as const)
  const hLink = d3.linkHorizontal<unknown, [number, number]>().source(d => (d as { s: [number, number] }).s).target(d => (d as { t: [number, number] }).t)
  const rLink = d3.linkRadial<unknown, [number, number]>().angle(d => d[0]).radius(d => d[1]).source(d => (d as { s: [number, number] }).s).target(d => (d as { t: [number, number] }).t)
  // linkRadial's points are relative to the centre: shift its path by translating the d string's numbers is not
  // possible, so the radial links are drawn in a group translated to the centre and lerped in the same frame of
  // reference by subtracting the centre from the flat ones.
  const shift = ([x, y]: [number, number]) => [x - W / 2, y - H / 2] as [number, number]
  const svg = stage(d3, root)
  const g = svg.append('g').attr('transform', `translate(${W / 2},${H / 2})`)
  const linkPaths = g.append('g').attr('fill', 'none').attr('stroke', color('line-strong')).attr('stroke-width', 1.5).selectAll('path').data(links).join('path')
  const dots = g.append('g').selectAll('circle').data(nodes).join('circle').attr('r', d => (d.children ? 4.5 : 3.5))
    .attr('fill', d => (d.children ? color('accent') : color('bg'))).attr('stroke', color('accent')).attr('stroke-width', 1.5)
  const labels = g.append('g').attr('font-size', 12).attr('fill', color('ink')).selectAll('text').data(nodes).join('text').attr('dy', '0.32em').text(d => d.data.name)
  const curves = links.map(([s, t]) => ({
    tidy: hLink({ s: shift(flatAt(nodes as typeof C, s)), t: shift(flatAt(nodes as typeof C, t)) } as never)!,
    clus: hLink({ s: shift(flatAt(C, s)), t: shift(flatAt(C, t)) } as never)!,
    rad: rLink({ s: [Q[s]!.x, Q[s]!.y], t: [Q[t]!.x, Q[t]!.y] } as never)!,
  }))
  const maxDepth = tidy.height
  return (ms: number) => {
    const p = phase(at, ms)
    const grow = p(0), toClus = d3.easeCubicInOut(p(1)), toRad = d3.easeCubicInOut(p(2))
    const pos = (i: number) => {
      const a = flatAt(nodes as typeof C, i), b = flatAt(C, i), c = radAt(i)
      const ab = d3.interpolate(a, b)(toClus) as number[]
      return shift((toRad > 0 ? d3.interpolate(ab, c)(toRad) : ab) as [number, number])
    }
    // Step 0: depth d grows during its own slice of the step, from its parent's place.
    const local = (d: { depth: number }) => d3.easeCubicOut(clamp(grow * (maxDepth + 1) - d.depth))
    const shown = nodes.map((d, i) => {
      const own = pos(i)
      if (!d.parent) return own
      const from = pos(index.get(d.parent)!)
      return d3.interpolate(from, own)(local(d)) as [number, number]
    })
    dots.attr('cx', (_, i) => shown[i]![0]).attr('cy', (_, i) => shown[i]![1]).attr('opacity', d => (d.depth === 0 ? clamp(grow * 6) : local(d)))
    linkPaths.attr('opacity', (_, j) => local(nodes[links[j]![1]]!)).attr('d', (_, j) => {
      const c = curves[j]!
      if (local(nodes[links[j]![1]]!) < 1) {
        const [s, t] = links[j]!
        return hLink({ s: shown[s], t: shown[t] } as never)!
      }
      const flat = toClus > 0 ? d3.interpolateString(c.tidy, c.clus)(toClus) : c.tidy
      return toRad > 0 ? d3.interpolateString(flat, c.rad)(toRad) : flat
    })
    labels.each(function (d, i) {
      const [x, y] = shown[i]!
      const angle = Q[i]!.x * 180 / Math.PI - 90
      const flip = Q[i]!.x > Math.PI
      const rot = d3.interpolateNumber(0, flip ? angle + 180 : angle)(toRad)
      const leaf = !d.children
      // Flat: leaves label on the right, inner nodes above. Radial: along the ray, outward.
      const anchor = toRad < 0.5 ? (leaf ? 'start' : 'middle') : (flip ? 'end' : 'start')
      const dx = toRad < 0.5 ? (leaf ? 7 : 0) : (flip ? -7 : 7)
      const dy = toRad < 0.5 && !leaf ? -11 : 0
      d3.select(this).attr('transform', `translate(${x},${y + dy * (1 - toRad)}) rotate(${rot})`).attr('text-anchor', anchor).attr('x', dx)
        .attr('opacity', (leaf ? 1 : 1 - toRad) * local(d))
    })
  }
})
