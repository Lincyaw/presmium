import type * as D3 from 'd3'
import { d3Scene } from '@lincyaw/addon-motion/scene'
import { H, W, phase, stage } from './kit/stage.ts'

// d3-geo without map data: a sphere, d3.geoGraticule and d3.geoCircle rings on d3.geoOrthographic, rotated by
// setting projection.rotate at `ms`; a great-circle route drawn with d3.geoInterpolate; then the globe unrolls into
// a flat map with d3.geoProjectionMutator blending two raw projections. Seek-safe: the projection is set from `ms`.
const CITIES: [string, number, number][] = [['北京', 116.4, 39.9], ['伦敦', -0.1, 51.5], ['旧金山', -122.4, 37.8], ['悉尼', 151.2, -33.9]]

export default d3Scene(({ root, d3, at, color }) => {
  // Blend of orthographic and equirectangular; the clip angle opens from 90° to 180° with it.
  const blend = (t: number) => (l: number, p: number) => {
    const [ax, ay] = d3.geoOrthographicRaw(l, p), [bx, by] = d3.geoEquirectangularRaw(l, p)
    return [ax + (bx - ax) * t, ay + (by - ay) * t] as [number, number]
  }
  const mutate = d3.geoProjectionMutator(blend)
  const projection = mutate(0)
  const path = d3.geoPath(projection)
  const svg = stage(d3, root)
  const sphere = svg.append('path').datum({ type: 'Sphere' } as D3.GeoPermissibleObjects).attr('fill', color('sunk')).attr('stroke', color('line-strong'))
  const grid = svg.append('path').datum(d3.geoGraticule10()).attr('fill', 'none').attr('stroke', color('line-strong')).attr('stroke-opacity', 0.6)
  const equator = svg.append('path').datum({ type: 'LineString', coordinates: d3.range(-180, 181, 5).map(l => [l, 0]) } as D3.GeoPermissibleObjects).attr('fill', 'none').attr('stroke', color('muted')).attr('stroke-width', 1.5)
  const rings = svg.append('g').selectAll('path').data(CITIES).join('path').attr('fill', color('accent')).attr('fill-opacity', 0.35).attr('stroke', color('accent'))
  const names = svg.append('g').attr('font-size', 13).attr('fill', color('ink')).selectAll('text').data(CITIES).join('text').text(d => d[0])
  const route = svg.append('path').attr('fill', 'none').attr('stroke', color('danger')).attr('stroke-width', 3).attr('stroke-linecap', 'round')
  const plane = svg.append('circle').attr('r', 5).attr('fill', color('danger'))
  const fly = d3.geoInterpolate([CITIES[0]![1], CITIES[0]![2]], [CITIES[1]![1], CITIES[1]![2]])
  const routeLine = (t: number) => ({ type: 'LineString', coordinates: d3.range(0, t + 1e-9, Math.max(t / 60, 1e-3)).map(fly) }) as D3.GeoPermissibleObjects
  return (ms: number) => {
    const p = phase(at, ms)
    const unroll = d3.easeCubicInOut(p(2))
    // Steps 0 and 1: the globe turns from the Americas to Asia and then toward Europe, following the route.
    const lambda = d3.interpolateNumber(100, -60)(d3.easeCubicInOut(p(0))) + d3.interpolateNumber(0, -15)(d3.easeCubicInOut(p(1)))
    const phi = d3.interpolateNumber(-20, -35)(d3.easeCubicInOut(p(1))) * (1 - unroll)
    const t = unroll
    mutate(t)
    const scaleGlobe = 160, scaleFlat = 100
    projection.rotate([lambda * (1 - unroll) + 0 * unroll - 20 * unroll, phi]).clipAngle(t < 0.999 ? 90 + 90 * t : null as unknown as number)
      .scale(scaleGlobe + (scaleFlat - scaleGlobe) * t).translate([W / 2, H / 2]).precision(0.3)
    sphere.attr('d', path)
    grid.attr('d', path).attr('opacity', p(0, 0, 0.3))
    equator.attr('d', path)
    rings.attr('d', d => path(d3.geoCircle().center([d[1], d[2]]).radius(4)()))
    const rot = projection.rotate()
    const centre: [number, number] = [-rot[0], -rot[1]]
    names.each(function (d) {
      const xy = projection([d[1], d[2]])
      // Hidden when the city is on the far side of the globe.
      const visible = xy && (t > 0.5 || d3.geoDistance([d[1], d[2]], centre) < Math.PI / 2)
      d3.select(this).attr('x', xy ? xy[0] + 8 : 0).attr('y', xy ? xy[1] - 6 : 0).attr('opacity', visible ? 1 : 0)
    })
    const r = d3.easeCubicInOut(p(1))
    route.attr('d', r > 0 ? path(routeLine(r)) : null)
    const at2 = projection(fly(r))
    const front = d3.geoDistance(fly(r), centre) < Math.PI / 2 || t > 0.5
    plane.attr('cx', at2 ? at2[0] : 0).attr('cy', at2 ? at2[1] : 0).attr('opacity', r > 0 && front ? 1 : 0)
  }
})
