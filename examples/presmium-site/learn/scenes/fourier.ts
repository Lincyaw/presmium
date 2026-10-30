import { defineScene } from '@lincyaw/addon-motion/scene'
import { error, joints, pathData, shapeSeries, SHAPES, trace } from './epicycles.ts'
import type { Point, ShapeName } from './epicycles.ts'
import { chain, easeInOut, easeOut, element, english, pop, stage, timeline } from './drawing.ts'

// An outline drawn by circles, one state per round. On the left the target outline (dashed) and the chain of the
// N largest circles of its Fourier series; on the right the number of circles, the error and a chart of error
// against N. In each state the new circles pop out at the tip of the chain while the last round's curve dims to a
// ghost, the chain turns exactly once and its pen draws this round's curve, the error lands on the chart, and the
// state rests on the whole curve with the chain parked where it began. Parameters: `shape` (an outline from
// `epicycles.ts`) and `terms`, the number of circles of each state in order.
const WORDS = {
  zh: { unit: '个圆', error: '误差', axis: '圆的个数', label: (shape: string) => `用转动的圆画${shape}` , shapes: { note: '一个八分音符', star: '一颗五角星' } },
  en: { unit: 'circles', error: 'Error', axis: 'Circles', label: (shape: string) => `Rotating circles drawing ${shape}`, shapes: { note: 'an eighth note', star: 'a star' } },
}
const TRACE = 1200
// Within a state: the circles grow, the chain turns once, the error lands, then the state rests.
const GROW = 0.1, TURN = 0.72, LAND = 0.8

export default defineScene(({ root, parameters, durations, at }) => {
  const words = english() ? WORDS.en : WORDS.zh
  const name = (parameters.shape as ShapeName | undefined) ?? 'note'
  const shape: ShapeName = name in SHAPES ? name : 'note'
  const rounds = ((parameters.terms as number[] | undefined) ?? [1, 2, 4, 8, 16, 32, 64]).slice(0, durations.length)
  const s = shapeSeries(shape)
  const KMAX = rounds.at(-1)!

  // The outline in stage units: its longer side 600, centred left of the middle.
  const SIZE = 600, CX = 420, CY = 360
  const place = (p: Point): Point => [CX + p[0] * SIZE, CY + p[1] * SIZE]
  const traces = rounds.map(K => pathData(trace(s, K, TRACE), place))
  const points = rounds.map(K => trace(s, K, TRACE).map(place))
  const errors = rounds.map(K => error(s, K))

  const svg = stage(root, words.label(words.shapes[shape]))
  element(svg, 'path', { class: 'fz-shade', d: pathData(s.points, place, true) })
  element(svg, 'path', { class: 'fz-target', d: pathData(s.points, place, true) })
  const ghost = element(svg, 'path', { class: 'fz-ghost' })
  const drawn = element(svg, 'path', { class: 'fz-trace' })
  const circles = chain(svg, KMAX)

  // The readout: N, the error, and the chart of one against the other on log axes.
  const L = 820, R = 1200, T = 330, B = 590
  const heading = element(svg, 'text', { class: 'fz-count', x: L - 6, y: 150 })
  const count = element(heading, 'tspan')
  element(heading, 'tspan', { class: 'fz-unit', dx: 18 }).textContent = words.unit
  element(svg, 'text', { class: 'fz-label', x: L, y: 228 }).textContent = words.error
  const readout = element(svg, 'text', { class: 'fz-value', x: L + 90, y: 228 })
  const low = Math.min(...errors) * 0.7, high = Math.max(...errors) * 1.4
  const x = (K: number) => L + ((R - L) * Math.log2(K / rounds[0]!)) / Math.max(1, Math.log2(KMAX / rounds[0]!))
  const y = (e: number) => B - ((B - T) * Math.log(e / low)) / Math.log(high / low)
  for (const v of [0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 1].filter(v => v >= low && v <= high)) {
    element(svg, 'line', { class: 'fz-grid', x1: L, x2: R, y1: y(v), y2: y(v) })
    element(svg, 'text', { class: 'fz-tick', x: L - 14, y: y(v) + 8, 'text-anchor': 'end' }).textContent = `${+(v * 100).toPrecision(2)}%`
  }
  element(svg, 'line', { class: 'fz-axis', x1: L, x2: R, y1: B + 10, y2: B + 10 })
  for (const K of rounds) element(svg, 'text', { class: 'fz-tick', x: x(K), y: B + 44, 'text-anchor': 'middle' }).textContent = String(K)
  element(svg, 'text', { class: 'fz-label', x: (L + R) / 2, y: B + 92, 'text-anchor': 'middle' }).textContent = words.axis
  const series = element(svg, 'path', { class: 'fz-series' })
  const dots = rounds.map(() => element(svg, 'circle', { class: 'fz-dot' }))

  const clock = timeline(durations, at)
  const percent = (e: number) => `${(e * 100).toFixed(e < 0.01 ? 2 : e < 0.1 ? 1 : 0)}%`
  return (ms: number) => {
    const r = clock.state(ms)
    const K = rounds[r]!, before = r > 0 ? rounds[r - 1]! : 0
    // Circle i of this round grows in turn during the first part of the state; earlier rounds' circles stay.
    const grow = (i: number) => {
      if (i < before) return 1
      const start = (GROW * 0.6 * (i - before)) / Math.max(1, K - before)
      return pop(clock.phase(ms, r, start, start + GROW * 0.4))
    }
    const p = easeInOut(clock.phase(ms, r, GROW, TURN))
    const t = 2 * Math.PI * p
    const chainNow = joints(s, K, t, grow).map(place)
    circles.draw(chainNow, Array.from({ length: K }, (_, i) => s.terms[i]!.r * grow(i) * SIZE), clock.phase(ms, r, 0, GROW * 0.5))

    // The curve up to the pen; the last round's curve as a ghost that dims while the circles grow and is gone by the rest.
    const done = Math.floor(p * TRACE)
    drawn.setAttribute('d', p >= 1 ? traces[r]! : p > 0 ? pathData([...points[r]!.slice(0, done + 1), chainNow.at(-1)!]) : '')
    const dim = clock.phase(ms, r, 0, GROW), fade = clock.phase(ms, r, TURN, LAND)
    ghost.setAttribute('d', r > 0 ? traces[r - 1]! : '')
    ghost.setAttribute('opacity', r > 0 ? ((1 - 0.7 * easeOut(dim)) * (1 - fade)).toFixed(3) : '0')

    // N changes as its circles appear; the error follows the pen and lands with this round's point on the chart. With no
    // circles the pen sits at the centre, an error of exactly 100%.
    count.textContent = `N = ${K}`
    const from = r > 0 ? errors[r - 1]! : 1
    const shown = from + (errors[r]! - from) * p
    readout.textContent = percent(shown)
    const land = clock.phase(ms, r, TURN, LAND)
    const marks = rounds.map((k, i): Point | undefined => (i < r ? [x(k), y(errors[i]!)] : i === r && land > 0 ? [x(k), y(errors[i]!)] : undefined))
    series.setAttribute('d', pathData(marks.filter((m): m is Point => !!m)))
    dots.forEach((dot, i) => {
      const m = marks[i]
      dot.setAttribute('display', m ? 'inline' : 'none')
      if (!m) return
      dot.setAttribute('cx', m[0].toFixed(1))
      dot.setAttribute('cy', m[1].toFixed(1))
      dot.setAttribute('r', (9 * (i === r ? pop(land) : 1)).toFixed(2))
    })
  }
})
