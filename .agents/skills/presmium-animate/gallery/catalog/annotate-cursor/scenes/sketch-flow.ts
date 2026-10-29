import { defineScene } from '@lincyaw/addon-motion/scene'
import { frame, pick } from '../../../lengths/scenes/kit/frame.ts'
import { mulberry32, range } from '../../../lengths/scenes/kit/fx/random.ts'
import { ease } from '../../../lengths/scenes/kit/fx/time.ts'
import { seg, steps } from './lib/time.ts'
import { arrow, boil, frameBox, ink, type Box, type Ink } from './lib/ink.ts'

// Sketch flow, with defineScene: a hand-drawn flowchart that draws itself one node per step, in data order,
// as a teacher draws a pipeline on the board. One state per node (`node-1`, …, about 1.3 s each, the last longer).
// In each state: 0–0.45 s the arrow from the previous box draws (the flow arrives first: cause before effect); 0.35–0.9 s
// the box draws around the place where the node will be, in one wobbly stroke that overruns its start corner; 0.7 s
// the label rises in inside it. The key node (`key`, from 0) is drawn in the accent and hatched once its box closes,
// the only accent of the chart, so the eye knows which stage the lesson is about. Finished ink boils every 1/8 s, so
// the chart is alive while it is read. Nodes run left to right in one row up to five, in two rows (a snake) beyond.
// Every box, arrow and jitter is seeded: the same nodes draw the same chart. Adapted from HyperFrames hw-pipeline.

export default defineScene(({ root, at, durations, total, parameters }) => {
  const nodes = ((parameters.nodes as string[] | undefined) ?? ['分词', '词向量', '注意力 ×6', '前馈层', '下一个词']).slice(0, durations.length)
  const key = (parameters.key as number | undefined) ?? 2
  const { starts } = steps(at, durations, total)
  const perRow = nodes.length > 5 ? Math.ceil(nodes.length / 2) : nodes.length
  const rows = Math.ceil(nodes.length / perRow)
  const gap = 5, w = Math.min(16, (84 - gap * (perRow - 1)) / perRow), h = 14
  const rng = mulberry32(21)
  const boxes: Box[] = nodes.map((_, i) => {
    const r = Math.floor(i / perRow), c0 = i % perRow, c = r % 2 ? perRow - 1 - c0 : c0   // a snake: the second row runs back
    const left = 50 - (perRow * w + (perRow - 1) * gap) / 2
    return { x: left + c * (w + gap) + range(rng, -0.6, 0.6), y: (rows === 1 ? 43 : 30 + r * 30) + range(rng, -1.2, 1.2), w, h }
  })
  const parts = boxes.map((b, i) => {
    const outline: Ink = ink(frameBox(b, 40 + i), { width: [3.5, 8] })
    let link: Ink | undefined
    if (i > 0) {
      const a = boxes[i - 1]!, sameRow = Math.abs(a.y - b.y) < 8
      const from: [number, number] = sameRow ? (a.x < b.x ? [a.x + a.w + 1.2, a.y + a.h / 2] : [a.x - 1.2, a.y + a.h / 2]) : [a.x + a.w / 2, a.y + a.h + 2.4]
      const to: [number, number] = sameRow ? (a.x < b.x ? [b.x - 1.2, b.y + b.h / 2] : [b.x + b.w + 1.2, b.y + b.h / 2]) : [b.x + b.w / 2, b.y - 2.4]
      link = ink(arrow(from, to, sameRow ? 0.12 : 0.25, 16), { width: [3, 7] })
    }
    const hatch = i === key ? ink([u => { const k = u * 6, j = Math.floor(Math.min(5.999, k)), m = k - j; const y0 = b.y + 2 + (j / 6) * (b.h - 4), y1 = b.y + 2 + ((j + 1) / 6) * (b.h - 4); const xa = j % 2 ? b.x + b.w - 1.5 : b.x + 1.5, xb = j % 2 ? b.x + 1.5 : b.x + b.w - 1.5; return [(xa + (xb - xa) * m) * 16, (y0 + (y1 - y0) * m) * 9] }], { width: [3, 5], ease: u => u }) : undefined
    return { outline, link, hatch, t0: starts[i]! }
  })

  const f = frame(root, `
    .sf-ink { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
    .sf-ink path { fill: var(--pm-color-ink); }
    .sf-ink .is-key path { fill: var(--pm-color-accent); }
    .sf-ink .sf-hatch { fill: color-mix(in oklab, var(--pm-color-accent) 16%, transparent); }
    .sf-label { position: absolute; display: flex; align-items: center; justify-content: center; text-align: center; padding: 0 0.6cqw; font: 600 2.1cqw/1.2 var(--pm-font-sans); }
    .sf-label.is-key { color: var(--pm-color-accent); }
  `, `
    <svg class="sf-ink" viewBox="0 0 1600 900" aria-hidden="true">${parts.map((_, i) => `<g data-n="${i}" class="${i === key ? 'is-key' : ''}"><path class="sf-hatch" /><path data-o /><path data-l /></g>`).join('')}</svg>
    ${nodes.map((s, i) => `<div class="sf-label ${i === key ? 'is-key' : ''}" data-t="${i}" style="left:${boxes[i]!.x}%;top:${boxes[i]!.y}%;width:${boxes[i]!.w}%;height:${boxes[i]!.h}%">${s}</div>`).join('')}`)

  const paint = (t: number) => {
    parts.forEach((p, i) => {
      const g = pick(f, `g[data-n="${i}"]`), s = p.t0, b = boxes[i]!
      const o = i === 0 ? 0 : 0.35
      pick(g, '[data-l]').setAttribute('d', p.link ? p.link.d(seg(t, s, 0.45)) : '')
      pick(g, '[data-o]').setAttribute('d', p.outline.d(seg(t, s + o, 0.55)))
      pick(g, '.sf-hatch').setAttribute('d', p.hatch ? p.hatch.d(seg(t, s + o + 0.55, 0.4)) : '')
      g.setAttribute('transform', t > s + o + 1 ? boil(t, 70 + i, (b.x + b.w / 2) * 16, (b.y + b.h / 2) * 9, 0.8) : '')
      const l = pick(f, `[data-t="${i}"]`), u = seg(t, s + o + 0.35, 0.4, ease.out3)
      l.style.opacity = u.toFixed(3)
      l.style.transform = `translateY(${((1 - u) * 1.2).toFixed(2)}cqw)`
    })
  }
  return (ms: number) => paint(ms / 1000)
})
