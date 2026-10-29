import { defineScene } from '@lincyaw/addon-motion/scene'
import { frame, pick } from '../../../lengths/scenes/kit/frame.ts'
import { backdrop, BACKDROP_CSS, FIGURE, guides } from './lib/backdrop.ts'
import { ease, mix } from '../../../lengths/scenes/kit/fx/time.ts'
import { seg, steps } from './lib/time.ts'
import { arrow, boil, center, curve, edgeToward, ellipseToward, frameBox, ink, loop, readBox, type Box, type Ink, type Pt } from './lib/ink.ts'
import { mulberry32, range } from '../../../lengths/scenes/kit/fx/random.ts'

// Callout, with defineScene: a hand-drawn ellipse or box goes around a target given in stage percent, an
// optional scribble hatches it, a curved connector (a line or an arrow) leads out to a label, and the label pops in
// with momentum; the drawn shape absorbs the arrival with a small squash. For pointing at a part of a figure: a bump in
// a curve, a block of a diagram, a region of a photo. One state per callout (`callout-1`, …, about 2.6 s each). In each
// state: 0–0.6 s the outline draws, thick where slow; 0.35–0.75 s the hatch sketches in behind it (if `fill`). With a
// line: 0.6–1.05 s it grows from the outline's edge towards the label, so the eye travels with it, and at 1.0 s the
// label arrives along it, scale 0.6 → 1.06 → 1 (an interface-sized overshoot), the outline squashing 4 % across that
// direction and springing back (every impact gets a reaction). With an arrow the label is the cause: it pops in at
// 0.6 s, the arrow draws from it 0.75–1.2 s and the outline takes the squash as the head lands. The rest of the state
// holds; finished ink boils every 1/8 s. When the next callout starts, the earlier ones fade to 40 %: one focus.
// Constraints: the label's anchor (`lx`, `ly`, its centre) is in percent too; the connector leaves the outline towards
// it, so put the label in clear space. Adapted from HyperFrames hw-callout-circle, hw-box-label, hw-arrow and
// yt-circle-pointer.

interface CalloutParam extends Partial<Box> { shape?: 'ellipse' | 'box', label?: string, lx?: number, ly?: number, connector?: 'line' | 'arrow' | 'none', fill?: boolean }
const DEFAULTS: CalloutParam[] = [
  { shape: 'ellipse', ...FIGURE.bump, label: '学习率预热', lx: 40, ly: 26, connector: 'arrow', fill: true },
  { shape: 'box', ...FIGURE.gap, label: '最终损失更低', lx: 66, ly: 86, connector: 'arrow' },
]

/** Seeded hatch lines clipped to roughly inside the box: a quick scribble fill. */
function hatch(b: Box, seed: number): Pt[] {
  const rng = mulberry32(seed), pts: Pt[] = []
  const rows = 7
  for (let i = 0; i <= rows; i++) {
    const v = i / rows, y = b.y + b.h * (0.12 + 0.76 * v)
    const half = Math.sqrt(Math.max(0, 1 - (2 * v - 1) ** 2)) * b.w * 0.42
    const cx = b.x + b.w / 2
    pts.push(i % 2 ? [cx + half + range(rng, -0.4, 0.4), y] : [cx - half + range(rng, -0.4, 0.4), y])
  }
  return pts.map(([x, y]) => [x * 16, y * 9] as Pt)
}

export default defineScene(({ root, at, durations, total, parameters }) => {
  const inkName = (parameters.ink as string | undefined) ?? 'accent'
  const inkVar = `var(--pm-color-${inkName})`
  const { starts, end, n } = steps(at, durations, total)
  const items = ((parameters.callouts as CalloutParam[] | undefined) ?? DEFAULTS).slice(0, n).map((c, i) => {
    const box = readBox(c, { x: 40, y: 40, w: 20, h: 20 })
    const lab: Pt = [c.lx ?? box.x + box.w / 2, c.ly ?? box.y - 14]
    const shape = c.shape ?? 'ellipse'
    const outline: Ink = ink(shape === 'box' ? frameBox(box, 3 + i) : loop(box, 3 + i), { width: [4, 10] })
    const fillInk = c.fill ? ink([(u => { const p = hatch(box, 9 + i); const k = u * (p.length - 1), j = Math.min(p.length - 2, Math.floor(k)), m = k - j; return [p[j]![0] + (p[j + 1]![0] - p[j]![0]) * m, p[j]![1] + (p[j + 1]![1] - p[j]![1]) * m] as Pt })], { width: [3, 5], ease: u => u }) : undefined
    const from = shape === 'box' ? edgeToward(box, lab, 1.2) : ellipseToward(box, lab)
    // The connector stops short of the label's centre, at the edge of a box about the label's size.
    const dx = lab[0] - from[0], dy = lab[1] - from[1]
    const k = Math.max(0.2, 1 - Math.min(Math.abs(6.5 / (dx || 1e-9)), Math.abs(4.2 / (dy || 1e-9)), 1) )
    const to: Pt = [from[0] + dx * k, from[1] + dy * k]
    const mode = c.connector ?? 'line'
    const link = mode === 'none' ? undefined : ink(mode === 'arrow' ? arrow(to, from, -0.2, 22) : [curve(from, to, 0.2)], { width: [3, 7] })
    const dir = Math.atan2(dy * 9, dx * 16)
    const s = starts[i]!
    // A line grows out of the outline and the label lands at its end; an arrow is the label pointing: the label
    // comes first and the arrow's head lands on the outline, which takes the hit.
    const times = mode === 'arrow' ? { link: s + 0.75, label: s + 0.6, hit: s + 1.2 } : { link: s + 0.6, label: s + 1.0, hit: s + 1.0 }
    return { i, box, lab, outline, fillInk, link, text: c.label ?? '', dir, t0: s, times }
  })

  const f = frame(root, `${BACKDROP_CSS}
    .co-ink { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
    .co-ink path { fill: ${inkVar}; }
    .co-ink .co-fill { fill: color-mix(in oklab, ${inkVar} 45%, transparent); }
    .co-label { position: absolute; transform: translate(-50%, -50%); padding: 0.6cqw 1.3cqw; border-radius: 0.6cqw; background: ${inkVar}; color: var(--pm-color-on-accent); font: 600 2.3cqw/1.2 var(--pm-font-sans); white-space: nowrap; }
  `, `
    ${backdrop(parameters, 'figure')}
    <svg class="co-ink" viewBox="0 0 1600 900" aria-hidden="true">${items.map(c => `<g data-c="${c.i}"><path class="co-fill" /><g class="co-shape"><path /></g><path class="co-link" /></g>`).join('')}</svg>
    ${items.map(c => `<div class="co-label" data-l="${c.i}" style="left:${c.lab[0]}%;top:${c.lab[1]}%">${c.text}</div>`).join('')}
    ${guides(parameters.guides)}`)

  const paint = (t: number) => {
    items.forEach((c, j) => {
      const g = pick<SVGGElement>(f, `g[data-c="${c.i}"]`), shape = pick<SVGGElement>(g, '.co-shape')
      const s = c.t0
      shape.firstElementChild!.setAttribute('d', c.outline.d(seg(t, s, 0.6)))
      pick(g, '.co-fill').setAttribute('d', c.fillInk ? c.fillInk.d(seg(t, s + 0.35, 0.4)) : '')
      pick(g, '.co-link').setAttribute('d', c.link ? c.link.d(seg(t, c.times.link, 0.45)) : '')
      const next = items[j + 1]
      const dim = next ? 1 - 0.6 * seg(t, next.t0, 0.3) : 1
      g.setAttribute('opacity', dim.toFixed(3))
      // The squash: 4 % across the arrival direction, out in 0.08 s, back in 0.3 s.
      const [cx, cy] = center(c.box).map((v, k) => v * (k ? 9 : 16)) as Pt
      const h = c.times.hit, hit = t < h ? 0 : t < h + 0.08 ? ease.out2(seg(t, h, 0.08)) : 1 - ease.out3(seg(t, h + 0.08, 0.3))
      const deg = (c.dir * 180) / Math.PI
      const squash = hit ? `translate(${cx} ${cy}) rotate(${deg.toFixed(2)}) scale(${(1 - 0.04 * hit).toFixed(4)} ${(1 + 0.03 * hit).toFixed(4)}) rotate(${(-deg).toFixed(2)}) translate(${-cx} ${-cy})` : ''
      shape.setAttribute('transform', squash)
      g.setAttribute('transform', t > s + 1.4 ? boil(t, 50 + j, cx, cy) : '')
      const l = pick(f, `[data-l="${c.i}"]`), u = seg(t, c.times.label, 0.4)
      const sc = u <= 0 ? 0.6 : u < 0.45 ? mix(0.6, 1.06, ease.out2(u / 0.45)) : mix(1.06, 1, ease.out3((u - 0.45) / 0.55))
      const back = (1 - ease.out3(Math.min(1, u * 1.6))) * 2.5
      l.style.opacity = (Math.min(1, u * 3) * dim).toFixed(3)
      l.style.transform = `translate(calc(-50% - ${(Math.cos(c.dir) * back).toFixed(2)}cqw), calc(-50% - ${(Math.sin(c.dir) * back).toFixed(2)}cqw)) scale(${sc.toFixed(4)})`
    })
  }
  return (ms: number) => paint(ms / 1000)
})
