import { defineScene } from '@lincyaw/addon-motion/scene'
import { frame, pick } from '../../../lengths/scenes/kit/frame.ts'
import { blurFilter } from '../../../lengths/scenes/kit/fx/defs.ts'
import { uid } from '../../../lengths/scenes/kit/fx/ids.ts'
import { ease, mix, phase, speed } from '../../../lengths/scenes/kit/fx/time.ts'
import { throwEase } from './lib/motion.ts'

// Carousel, drawn from the time: many examples ride a path past the viewer, the ride is thrown, slows down, passes
// the chosen one and snaps back onto it. Two states. `spin` (1.6 s): 0.1–1.5 s the carousel is flicked: it starts
// at full speed, loses it quickly, overshoots the chosen card by 4% of the travel and comes back to it with zero
// speed (one function, f(p) = 1 − (1 − p)²(1 − a·p)); while it is fast the whole stage blurs along the motion in
// proportion to the speed, and the blur is gone at rest. Depth comes from one value per card: its place on the path
// sets its scale, its opacity and its stacking together. `pick` (2.4 s): 0–0.4 s the chosen card grows 10% and
// takes the accent while the others step back; 0.3–0.7 s its caption rises in under it; then the hold. `path`:
// `circle` is a ring seen from slightly above (the back cards smaller, higher and dim), `arc` an open smile on
// which each card turns along the tangent, `line` a flat rail. Adapted from HyperFrames carousel-circle-1…5,
// carousel-path-1…5 and velocity-throw-snap (and the idea of cuboid-carousel's travelling chain).
export default defineScene(({ root, at, width, parameters }) => {
  const items = (parameters.items as string[] | undefined) ?? ['机器翻译', '语音识别', '图像分类', '推荐系统', '代码补全', '蛋白质结构预测', '天气预报', '自动驾驶']
  const chosen = (parameters.pick as number | undefined) ?? 5
  const caption = (parameters.caption as string | undefined) ?? 'AlphaFold：从氨基酸序列预测三维结构'
  const path = (parameters.path as string | undefined) ?? 'circle'
  const n = items.length
  const id = uid('cr-blur')
  const f = frame(root, `
    .cr__stage { position: absolute; inset: 0; }
    .cr__card { position: absolute; left: 50%; top: 46%; width: 21cqw; height: 24cqh; margin: -12cqh 0 0 -10.5cqw; display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 1.6cqh; text-align: center; padding: 1cqw; }
    .cr__n { font: 500 2cqw/1 var(--pm-font-mono); color: var(--pm-color-muted); }
    .cr__label { font-size: 2.4cqw; font-weight: 600; line-height: 1.2; }
    .cr__caption { position: absolute; left: 0; right: 0; top: 80cqh; text-align: center; }
    .cr__defs { position: absolute; width: 0; height: 0; }
  `, `<svg class="cr__defs" aria-hidden="true"><defs>${blurFilter(id, 0, 0)}</defs></svg>
    <div class="cr__stage">${items.map((it, i) => `<div class="lf-card cr__card"><div class="cr__n">${String(i + 1).padStart(2, '0')}</div><div class="cr__label">${it}</div></div>`).join('')}</div>
    <div class="lf-lead cr__caption">${caption}</div>`)
  const stage = pick(f, '.cr__stage'), cap = pick(f, '.cr__caption')
  const blur = f.querySelector(`.${id}__blur`)!
  const cards = [...f.querySelectorAll<HTMLElement>('.cr__card')]
  const cqw = width / 100

  // The travel, in cards: the chosen card arrives at the front after `travel` cards have passed.
  const travel = path === 'circle' ? n + 3 : 5
  const throwE = throwEase(0.04)
  const T0 = 0.1, D = Math.min(1.4, at(1) / 1000 - 0.2)
  /** How far the carousel has turned at time s, in cards: `chosen` at the end. */
  const offset = (s: number) => chosen - travel + travel * throwE(phase(s, T0, D))

  /** Where card i is when the carousel is at `o`: x, y in cqw, scale, rotation and depth 0 (back) … 1 (front). */
  function place(i: number, o: number): [number, number, number, number, number] {
    if (path === 'circle') {
      const a = (2 * Math.PI * (i - o)) / n
      const depth = (Math.cos(a) + 1) / 2
      return [34 * Math.sin(a), -7 * Math.cos(a) + 3, mix(0.5, 1, depth), 0, depth]
    }
    const s = i - o, depth = Math.max(0, 1 - Math.abs(s) / 3.5)
    if (path === 'arc') {
      const k = 1.6
      return [s * 19, k * s * s - 2, mix(0.62, 1, depth), (Math.atan(2 * k * s / 19) * 180) / Math.PI, depth]
    }
    return [s * 21, 0, mix(0.72, 1, depth), 0, depth]
  }

  return (ms: number) => {
    const s = ms / 1000
    const o = offset(s)
    const chosenP = ease.out2(phase(s, at(1) / 1000, 0.4))
    cards.forEach((card, i) => {
      const [x, y, sc, rot, depth] = place(i, o)
      const me = i === chosen
      const grow = me ? 1 + 0.1 * chosenP : 1
      card.style.transform = `translate(${(x * cqw).toFixed(2)}px, ${(y * cqw).toFixed(2)}px) rotate(${rot.toFixed(2)}deg) scale(${(sc * grow).toFixed(4)})`
      card.style.zIndex = String(Math.round(depth * 100))
      const base = mix(0.3, 1, depth)
      card.style.opacity = String(me ? base : base * (1 - 0.55 * chosenP))
      card.style.borderColor = me && chosenP > 0 ? `color-mix(in srgb, var(--pm-color-accent) ${(chosenP * 100).toFixed(0)}%, var(--pm-color-line-strong))` : ''
      card.style.background = me && chosenP > 0 ? `color-mix(in srgb, var(--pm-color-accent-soft) ${(chosenP * 100).toFixed(0)}%, var(--pm-color-surface))` : ''
    })
    // Blur along the motion, from the speed (cards per second).
    const v = Math.abs(speed(throwE, phase(s, T0, D))) * travel / D
    const b = s > T0 && s < T0 + D ? Math.min(1.6, v * 0.09) * cqw : 0
    blur.setAttribute('stdDeviation', `${b.toFixed(2)} 0`)
    stage.style.filter = b > 0.05 ? `url(#${id})` : 'none'
    const c = ease.outExpo(phase(s, at(1) / 1000 + 0.3, 0.45))
    cap.style.opacity = String(c)
    cap.style.transform = `translateY(${40 * (1 - c)}%)`
  }
})
