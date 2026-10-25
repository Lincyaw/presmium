import { motionScene } from '@lincyaw/addon-motion/scene'
import type { MotionSequence } from '@lincyaw/addon-motion/scene'

// 2D transforms as linear maps: a grid with its basis vectors is scaled (`scaleX`, `scaleY`), rotated (`rotate`) and
// sheared (`skewX`). Motion composes the individual transform values in a fixed order (translate, scale, rotate,
// skew), so the shown matrix is the product in that order. The matrix text is updated from motion values.
export default motionScene(({ root, motion, at }) => {
  root.innerHTML = `<div class="cq">
    <style>
      .cq { container-type: size; width: 100%; height: 100%; }
      .mat { width: 100%; height: 100%; display: grid; grid-template-columns: 1fr auto; align-items: center; padding: 0 6cqw; box-sizing: border-box; font-family: var(--pm-font-mono); color: var(--pm-color-ink); }
      .mat__stage { position: relative; height: 90cqh; aspect-ratio: 1; justify-self: center; overflow: hidden; }
      .mat__ref { position: absolute; inset: 0; background-image: linear-gradient(var(--pm-color-line) 0.2cqh, transparent 0.2cqh), linear-gradient(90deg, var(--pm-color-line) 0.2cqh, transparent 0.2cqh); background-size: 10% 10%; background-position: -0.1cqh -0.1cqh; }
      .mat__plane { position: absolute; left: 25%; top: 25%; width: 50%; height: 50%; }
      .mat__grid { position: absolute; inset: 0; background-color: color-mix(in srgb, var(--pm-color-accent) 12%, transparent); background-image: linear-gradient(var(--pm-color-accent-line) 0.3cqh, transparent 0.3cqh), linear-gradient(90deg, var(--pm-color-accent-line) 0.3cqh, transparent 0.3cqh); background-size: 20% 20%; border: 0.4cqh solid var(--pm-color-accent); }
      .mat__i, .mat__j { position: absolute; left: 50%; top: 50%; background: var(--pm-color-danger); }
      .mat__i { width: 40%; height: 0.8cqh; margin-top: -0.4cqh; }
      .mat__j { width: 0.8cqh; height: 40%; margin-left: -0.4cqh; transform: translateY(-100%); background: var(--pm-color-ok); }
      .mat__text { font-size: 6.5cqh; line-height: 1.6; white-space: pre; }
      .mat__name { font-family: var(--pm-font-sans); color: var(--pm-color-muted); font-size: 6cqh; }
    </style>
    <div class="mat">
      <div class="mat__stage"><div class="mat__ref"></div><div class="mat__plane"><div class="mat__grid"></div><div class="mat__i"></div><div class="mat__j"></div></div></div>
      <div><div class="mat__name" data-name>单位矩阵</div><div class="mat__text" data-m></div></div>
    </div></div>`
  const plane = root.querySelector<HTMLElement>('.mat__plane')!
  const text = root.querySelector<HTMLElement>('[data-m]')!
  const name = root.querySelector<HTMLElement>('[data-name]')!
  // The same numbers as motion values, to print the matrix [[a, c], [b, d]] = R(θ) · K(φ) after S.
  const sx = motion.motionValue(1)
  const sy = motion.motionValue(1)
  const rot = motion.motionValue(0)
  const skew = motion.motionValue(0)
  const stage = motion.motionValue(0)
  const print = () => {
    const t = rot.get() * Math.PI / 180
    const k = Math.tan(skew.get() * Math.PI / 180)
    // CSS: scale, then rotate, then skewX applied to the point first: M = S · R · K.
    const r = [[Math.cos(t), -Math.sin(t)], [Math.sin(t), Math.cos(t)]]
    const rk = [[r[0]![0]!, r[0]![0]! * k + r[0]![1]!], [r[1]![0]!, r[1]![0]! * k + r[1]![1]!]]
    const m = [[sx.get() * rk[0]![0]!, sx.get() * rk[0]![1]!], [sy.get() * rk[1]![0]!, sy.get() * rk[1]![1]!]]
    const f = (v: number) => (v >= 0 ? ' ' : '') + v.toFixed(2)
    text.textContent = `⎡${f(m[0]![0]!)} ${f(-m[0]![1]!)}⎤\n⎣${f(-m[1]![0]!)} ${f(m[1]![1]!)}⎦`
    name.textContent = ['单位矩阵', '缩放', '缩放 · 旋转', '缩放 · 旋转 · 切变'][Math.round(stage.get())]!
  }
  print()
  for (const v of [sx, sy, rot, skew, stage]) v.on('change', print)
  const s = (k: number) => at(k) / 1000
  const d = 0.9
  const seq: MotionSequence = [
    [plane, { scaleX: [1, 1.4], scaleY: [1, 0.7] }, { at: s(0), duration: d, ease: 'easeInOut' }],
    [sx, [1, 1.4], { at: s(0), duration: d, ease: 'easeInOut' }],
    [sy, [1, 0.7], { at: s(0), duration: d, ease: 'easeInOut' }],
    [stage, [0, 1], { at: s(0), duration: d }],
    [plane, { rotate: [0, -30] }, { at: s(1), duration: d, ease: 'easeInOut' }],
    [rot, [0, -30], { at: s(1), duration: d, ease: 'easeInOut' }],
    [stage, [1, 2], { at: s(1), duration: d }],
    [plane, { skewX: [0, -25] }, { at: s(2), duration: d, ease: 'easeInOut' }],
    [skew, [0, -25], { at: s(2), duration: d, ease: 'easeInOut' }],
    [stage, [2, 3], { at: s(2), duration: d }],
  ]
  return motion.animate(seq)
})
