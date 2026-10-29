import { defineScene } from '@lincyaw/addon-motion/scene'
import { frame, pick } from '../../../lengths/scenes/kit/frame.ts'
import { blurFilter } from '../../../lengths/scenes/kit/fx/defs.ts'
import { uid } from '../../../lengths/scenes/kit/fx/ids.ts'
import { backdrop, BACKDROP_CSS, codeBox, guides } from './lib/backdrop.ts'
import { ease, mix } from '../../../lengths/scenes/kit/fx/time.ts'
import { seg, steps } from './lib/time.ts'
import { readBox, type Box } from './lib/ink.ts'

// Spotlight, with defineScene: the stage dims except a soft-edged rounded hole over one target (a line of
// code, a term, a part of a figure), and the hole glides from target to target, one per step, a chip naming each. The
// hole is a rounded rectangle fitted to the target box (a wide line gets a wide pill, a square region a rounded
// square) with a blurred edge, so the light falls exactly on what the box names. One state per target (`target-1`,
// …). State 1: 0–0.45 s the dim fades in while the hole closes from the whole stage onto the first target (an iris, so
// the eye is led in, not dropped); 0.5 s its chip rises in beside it. Later states: 0–0.2 s the chip leaves; 0.1–0.7 s
// the hole moves and resizes to the next target, both ends eased (one object changing place, never a cut); 0.75 s the
// new chip rises in. Each result holds for the rest of its state; the dimmed page breathes by 1 %. The chip sits to
// the right of the hole, or below it when there is no room. Adapted from HyperFrames yt-feather-highlight.

interface TargetParam extends Partial<Box> { label?: string }
const DEFAULTS: TargetParam[] = [
  { ...codeBox(3, 4), label: '相似度，再按 √d 缩放' },
  { ...codeBox(4, 4), label: '每行归一化成权重' },
  { ...codeBox(5, 4), label: '按权重加权求和' },
]

export default defineScene(({ root, at, durations, total, parameters }) => {
  const { starts, n } = steps(at, durations, total)
  const targets = ((parameters.targets as TargetParam[] | undefined) ?? DEFAULTS).slice(0, n).map(tg => {
    const b = readBox(tg, { x: 30, y: 30, w: 40, h: 20 })
    return { hole: { x: b.x - 1.4, y: b.y - 2.2, w: b.w + 2.8, h: b.h + 4.4 }, label: tg.label ?? '' }
  })
  const dimLevel = (parameters.dim as number | undefined) ?? 0.82
  const id = uid('sp-blur')
  const f = frame(root, `${BACKDROP_CSS}
    .sp-dim { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
    .sp-dim path { fill: var(--pm-color-bg); }
    .sp-chip { position: absolute; transform: translateY(-50%); padding: 0.6cqw 1.3cqw; border-radius: 99cqw; background: var(--pm-color-accent); color: var(--pm-color-on-accent); font: 600 2.1cqw/1.2 var(--pm-font-sans); white-space: nowrap; }
  `, `
    ${backdrop(parameters, 'code')}
    <svg class="sp-dim" viewBox="0 0 1600 900" aria-hidden="true"><defs>${blurFilter(id, 14, 14)}</defs><path fill-rule="evenodd" filter="url(#${id})" /></svg>
    ${targets.map((tg, i) => `<div class="sp-chip" data-l="${i}">${tg.label}</div>`).join('')}
    ${guides(parameters.guides)}`)
  const dim = pick<SVGPathElement>(f, '.sp-dim path')
  const chips = targets.map((_, i) => pick(f, `[data-l="${i}"]`))
  const whole: Box = { x: -20, y: -20, w: 140, h: 140 }

  const rrect = (b: Box) => {
    const x = b.x * 16, y = b.y * 9, w = b.w * 16, h = b.h * 9, r = Math.min(w, h) * 0.45
    return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`
  }
  const lerpBox = (a: Box, b: Box, u: number): Box => ({ x: mix(a.x, b.x, u), y: mix(a.y, b.y, u), w: mix(a.w, b.w, u), h: mix(a.h, b.h, u) })

  const paint = (t: number) => {
    let hole = whole
    targets.forEach((tg, i) => {
      if (t < starts[i]!) return
      hole = i === 0 ? lerpBox(whole, tg.hole, seg(t, starts[0]!, 0.5, ease.out3)) : lerpBox(targets[i - 1]!.hole, tg.hole, seg(t, starts[i]! + 0.1, 0.6, ease.inOut3))
    })
    const level = dimLevel * seg(t, starts[0]!, 0.45) * (1 + 0.01 * Math.sin(t * 2))
    dim.setAttribute('d', `M-200 -200H1800V1100H-200Z${rrect(hole)}`)
    dim.style.opacity = level.toFixed(3)
    targets.forEach((tg, i) => {
      const inAt = starts[i]! + (i === 0 ? 0.5 : 0.75)
      const outAt = i + 1 < targets.length ? starts[i + 1]! : Infinity
      const u = seg(t, inAt, 0.4, ease.out3) * (1 - seg(t, outAt, 0.2, ease.in2))
      const right = tg.hole.x + tg.hole.w + 1.5
      const below = right > 70
      const c = chips[i]!
      c.style.left = `${below ? tg.hole.x : right}%`
      c.style.top = `${below ? tg.hole.y + tg.hole.h + 4 : tg.hole.y + tg.hole.h / 2}%`
      c.style.opacity = u.toFixed(3)
      c.style.transform = `translateY(calc(-50% + ${((1 - u) * 1.2).toFixed(2)}cqw))`
    })
  }
  return (ms: number) => paint(ms / 1000)
})
