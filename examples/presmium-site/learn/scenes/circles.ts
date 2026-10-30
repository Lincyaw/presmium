import { defineScene } from '@lincyaw/addon-motion/scene'
import { joints, pathData, trace } from './epicycles.ts'
import type { Point, Series } from './epicycles.ts'
import { chain, easeInOut, easeOut, element, english, pop, stage, timeline } from './drawing.ts'

// One circle, then a second riding on it. `one`: a circle turning once per loop; its pen draws a circle. `two`: a
// smaller circle on its rim turning twice the other way pops out, the first curve dims to a ghost, and the pen now
// draws a rounded triangle: two circles already make corners begin. Each state turns the chain exactly once and
// rests on the whole curve. The legend beside the drawing names each circle by its turns per loop.
const WORDS = {
  zh: { unit: (_n: number) => '个圆', label: '一个圆画出圆，两个圆画出带角的曲线', turns: (n: number) => `${n > 0 ? '顺' : '逆'}时针转 ${Math.abs(n)} 圈` },
  en: { unit: (n: number) => (n === 1 ? 'circle' : 'circles'), label: 'One circle draws a circle; two draw a curve with corners', turns: (n: number) => `${Math.abs(n)} ${Math.abs(n) === 1 ? 'turn' : 'turns'} ${n > 0 ? 'clockwise' : 'anticlockwise'}` },
}
const TRACE = 900
const GROW = 0.12, TURN = 0.78

// The two circles as a series: radius in stage units, turns per loop (positive is clockwise on the y-down stage),
// starting at the top.
const SERIES: Series = {
  center: [400, 365],
  terms: [{ n: 1, r: 190, phase: -Math.PI / 2 }, { n: -2, r: 68, phase: -Math.PI / 2 }],
  scale: 1,
  points: [],
}

export default defineScene(({ root, durations, at }) => {
  const words = english() ? WORDS.en : WORDS.zh
  const rounds = [1, 2].slice(0, durations.length)
  const traces = rounds.map(K => trace(SERIES, K, TRACE))

  const svg = stage(root, words.label)
  const ghost = element(svg, 'path', { class: 'fz-ghost' })
  const drawn = element(svg, 'path', { class: 'fz-trace' })
  const circles = chain(svg, 2)

  const L = 820
  const heading = element(svg, 'text', { class: 'fz-count', x: L - 6, y: 220 })
  const count = element(heading, 'tspan')
  const unit = element(heading, 'tspan', { class: 'fz-unit', dx: 18 })
  // The legend: a small copy of each circle and how it turns.
  const legend = SERIES.terms.map((term, i) => {
    const row = element(svg, 'g', { transform: `translate(${L} ${330 + i * 90})` })
    element(row, 'circle', { class: 'fz-circle', cx: 24, cy: 0, r: (24 * term.r) / SERIES.terms[0]!.r + 4 })
    element(row, 'text', { class: 'fz-label', x: 76, y: 10 }).textContent = words.turns(term.n)
    return row
  })

  const clock = timeline(durations, at)
  return (ms: number) => {
    const r = clock.state(ms)
    const K = rounds[r]!
    const grow = (i: number) => (i < r ? 1 : pop(clock.phase(ms, r, 0, GROW)))
    const p = easeInOut(clock.phase(ms, r, GROW, TURN))
    const now = joints(SERIES, K, 2 * Math.PI * p, grow)
    circles.draw(now, SERIES.terms.slice(0, K).map((term, i) => term.r * grow(i)), r > 0 ? 1 : clock.phase(ms, 0, 0, GROW))
    const done = Math.floor(p * TRACE)
    drawn.setAttribute('d', p > 0 ? pathData([...traces[r]!.slice(0, done + 1), ...(p < 1 ? [now.at(-1)! as Point] : [])]) : '')
    ghost.setAttribute('d', r > 0 ? pathData(traces[r - 1]!) : '')
    ghost.setAttribute('opacity', r > 0 ? (1 - 0.7 * easeOut(clock.phase(ms, r, 0, GROW))).toFixed(3) : '0')
    count.textContent = String(K)
    unit.textContent = words.unit(K)
    legend.forEach((row, i) => row.setAttribute('opacity', String(i < r ? 1 : i === r ? clock.phase(ms, r, 0, GROW) : 0)))
  }
})
