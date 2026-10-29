import { defineScene } from '@lincyaw/addon-motion/scene'
import { frame, pick } from '../../../lengths/scenes/kit/frame.ts'
import { noise1 } from '../../../lengths/scenes/kit/fx/noise.ts'
import { backdrop, BACKDROP_CSS, guides } from './lib/backdrop.ts'
import { ease } from '../../../lengths/scenes/kit/fx/time.ts'
import { seg, steps, typed } from './lib/time.ts'
import { boil, ink, polyline, readBox, type Box, type Ink, type Pt } from './lib/ink.ts'

// Speech bubble, with defineScene: a hand-drawn bubble whose tail points at a spot of the stage, for a
// remark about a part of a figure ("this bump is the warm-up") or a voice in a dialogue. The bubble's box and the
// tail's tip are both in stage percent; the tail leaves the bubble on the side facing the tip. One state per bubble
// (`say-1`, …, about 2.8 s each). In each state: 0–0.25 s the previous bubble leaves (fading and shrinking 4 %, faster
// than it came); 0–0.6 s the new outline draws in one stroke, starting beside the tail and ending at its tip, so the
// line itself arrives at the thing pointed at; 0.45–0.7 s the paper fill fades in under it; from 0.6 s the text types
// at 12 characters a second, and the rest of the state holds it, the outline boiling every 1/8 s. The outline is a
// rounded box (a superellipse) with seeded wobble, so the same parameters draw the same bubble. Adapted from
// HyperFrames hw-text-cloud.

interface BubbleParam extends Partial<Box> { text?: string, tx?: number, ty?: number }
const DEFAULTS: BubbleParam[] = [
  { x: 35, y: 14, w: 31, h: 15, tx: 28.5, ty: 44, text: '这个小鼓包是学习率预热' },
  { x: 47, y: 30, w: 31, h: 15, tx: 82, ty: 64, text: '训练越久，差距越稳定' },
]

function outline(b: Box, tip: Pt, seed: number): Pt[] {
  const cx = (b.x + b.w / 2) * 16, cy = (b.y + b.h / 2) * 9, a = (b.w / 2) * 16, c = (b.h / 2) * 9
  const th0 = Math.atan2((tip[1] * 9 - cy) / c, (tip[0] * 16 - cx) / a), d = 0.2
  const sp = (v: number) => Math.sign(v) * Math.abs(v) ** (2 / 5)
  const pts: Pt[] = []
  for (let k = 0; k <= 72; k++) {
    const th = th0 + d + (k / 72) * (Math.PI * 2 - 2 * d), r = 1 + 0.025 * noise1(seed, k / 6)
    pts.push([cx + a * r * sp(Math.cos(th)), cy + c * r * sp(Math.sin(th))])
  }
  return [...pts, [tip[0] * 16, tip[1] * 9], pts[0]!]
}

export default defineScene(({ root, at, durations, total, parameters }) => {
  const { starts, n } = steps(at, durations, total)
  const bubbles = ((parameters.bubbles as BubbleParam[] | undefined) ?? DEFAULTS).slice(0, n).map((p, i) => {
    const b = readBox(p, { x: 35, y: 20, w: 30, h: 16 })
    const tip: Pt = [p.tx ?? b.x + b.w / 2, p.ty ?? b.y + b.h + 12]
    const pts = outline(b, tip, 5 + i)
    // Drawn from the far side so the stroke ends at the tail's tip: reverse the loop.
    const drawn: Ink = ink([polyline([...pts].reverse())], { width: [4, 8], ease: u => u })
    const fill = `M${pts.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L')}Z`
    return { b, drawn, fill, text: p.text ?? '', t0: starts[i]! }
  })
  const f = frame(root, `${BACKDROP_CSS}
    .sb-ink { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
    .sb-ink .sb-fill { fill: var(--pm-color-surface); }
    .sb-ink .sb-line { fill: var(--pm-color-ink); }
    .sb-text { position: absolute; display: flex; align-items: center; justify-content: center; text-align: center; padding: 0 1.6cqw; font: 500 2.5cqw/1.3 var(--pm-font-sans); }
  `, `
    ${backdrop(parameters, 'figure')}
    <svg class="sb-ink" viewBox="0 0 1600 900" aria-hidden="true">${bubbles.map((bb, i) => `<g data-b="${i}"><path class="sb-fill" d="${bb.fill}" /><path class="sb-line" /></g>`).join('')}</svg>
    ${bubbles.map((bb, i) => `<div class="sb-text" data-t="${i}" style="left:${bb.b.x}%;top:${bb.b.y}%;width:${bb.b.w}%;height:${bb.b.h}%"></div>`).join('')}
    ${guides(parameters.guides)}`)

  const paint = (t: number) => {
    bubbles.forEach((bb, i) => {
      const g = pick(f, `g[data-b="${i}"]`), txt = pick(f, `[data-t="${i}"]`)
      const cx = (bb.b.x + bb.b.w / 2) * 16, cy = (bb.b.y + bb.b.h / 2) * 9
      const leave = i + 1 < bubbles.length ? seg(t, bubbles[i + 1]!.t0, 0.25, ease.in2) : 0
      const sc = 1 - 0.04 * leave
      g.setAttribute('opacity', (1 - leave).toFixed(3))
      g.setAttribute('transform', `${t > bb.t0 + 0.7 && leave === 0 ? boil(t, 90 + i, cx, cy, 0.7) : ''} translate(${cx} ${cy}) scale(${sc}) translate(${-cx} ${-cy})`)
      pick(g, '.sb-line').setAttribute('d', bb.drawn.d(seg(t, bb.t0, 0.6)))
      pick(g, '.sb-fill').style.opacity = seg(t, bb.t0 + 0.45, 0.25).toFixed(3)
      txt.textContent = typed(bb.text, t, bb.t0 + 0.6, 12)
      txt.style.opacity = (1 - leave).toFixed(3)
    })
  }
  return (ms: number) => paint(ms / 1000)
})
