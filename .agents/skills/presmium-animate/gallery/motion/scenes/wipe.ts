import { motionScene } from '@lincyaw/addon-motion/scene'
import type { MotionSequence } from '@lincyaw/addon-motion/scene'

// clip-path: a before/after wipe over a noisy and a denoised image (`inset()` from the right, with a divider that
// moves in % of a full-width mover), then a `circle()` reveal of the caption. Both clip-path shapes animate on WAAPI;
// keyframes must use the same shape function (inset to inset, circle to circle). The noise uses a seeded PRNG.
const W = 32
const H = 18

function prng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 2 ** 32
  }
}

export default motionScene(({ root, motion, at }) => {
  const rand = prng(7)
  const clean = (x: number, y: number) => 0.5 + 0.5 * Math.sin(x / 4.5) * Math.cos(y / 3.5)
  const cell = (v: number) => `<i style="background: color-mix(in srgb, var(--pm-color-accent) ${(Math.min(1, Math.max(0, v)) * 100).toFixed(0)}%, var(--pm-color-surface))"></i>`
  const grid = (f: (x: number, y: number) => number) => Array.from({ length: W * H }, (_, i) => cell(f(i % W, Math.floor(i / W)))).join('')
  const noisy = grid((x, y) => clean(x, y) + (rand() - 0.5) * 0.9)
  root.innerHTML = `<div class="cq">
    <style>
      .cq { container-type: size; width: 100%; height: 100%; }
      .wipe { width: 100%; height: 100%; display: grid; place-items: center; font-family: var(--pm-font-sans); }
      .wipe__frame { position: relative; height: 84cqh; aspect-ratio: ${W} / ${H}; border-radius: 1.5cqh; overflow: hidden; }
      .wipe__img { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(${W}, 1fr); }
      .wipe__img--after { clip-path: inset(0 100% 0 0); }
      .wipe__mover { position: absolute; inset: 0; pointer-events: none; }
      .wipe__line { position: absolute; left: 0; top: 0; bottom: 0; width: 0.6cqh; margin-left: -0.3cqh; background: var(--pm-color-ink); }
      .wipe__tag { position: absolute; top: 2cqh; padding: 0.6cqh 1cqw; border-radius: 1cqh; background: var(--pm-color-bg); color: var(--pm-color-ink); font-size: 5cqh; }
      .wipe__caption { position: absolute; inset: 34% 16%; border-radius: 3cqh; display: grid; place-items: center; background: var(--pm-color-bg); color: var(--pm-color-ink); font-size: 7cqh; clip-path: circle(0% at 50% 50%); }
    </style>
    <div class="wipe"><div class="wipe__frame">
      <div class="wipe__img">${noisy}</div>
      <div class="wipe__img wipe__img--after">${grid(clean)}<span class="wipe__tag" style="left: 1.5cqw">去噪后</span></div>
      <span class="wipe__tag" style="right: 1.5cqw">去噪前</span>
      <div class="wipe__mover"><div class="wipe__line"></div></div>
      <div class="wipe__caption">均值滤波：噪声被平均掉</div>
    </div></div></div>`
  const after = root.querySelector<HTMLElement>('.wipe__img--after')!
  const mover = root.querySelector<HTMLElement>('.wipe__mover')!
  const caption = root.querySelector<HTMLElement>('.wipe__caption')!
  const s = (k: number) => at(k) / 1000
  const seq: MotionSequence = [
    // Step 0: wipe to the middle.
    [after, { clipPath: ['inset(0 100% 0 0)', 'inset(0 50% 0 0)'] }, { at: s(0), duration: 1, ease: 'easeInOut' }],
    [mover, { x: ['0%', '50%'] }, { at: s(0), duration: 1, ease: 'easeInOut' }],
    // Step 1: all the way.
    [after, { clipPath: ['inset(0 50% 0 0)', 'inset(0 0% 0 0)'] }, { at: s(1), duration: 0.9, ease: 'easeInOut' }],
    [mover, { x: ['50%', '100%'] }, { at: s(1), duration: 0.9, ease: 'easeInOut' }],
    // Step 2: the caption opens as a circle from the center.
    [caption, { clipPath: ['circle(0% at 50% 50%)', 'circle(71% at 50% 50%)'] }, { at: s(2), duration: 0.8, ease: 'easeOut' }],
  ]
  return motion.animate(seq)
})
