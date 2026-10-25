import { motionScene } from '@lincyaw/addon-motion/scene'
import type { MotionSequence } from '@lincyaw/addon-motion/scene'

// Emphasis on code: a highlight bar moves from line to line (`y` in % of its own height, one track), changes color on
// the buggy line (backgroundColor runs on WAAPI) and shakes with multi-value keyframes (`x: [0, -a, a, ...]`).
// The token in the line pulses with `times` so the pop is quick and the settle slow.
const CODE = [
  'def mean(xs):',
  '    total = 0',
  '    for x in xs:',
  '        total += x',
  '    return total / len(xs) - 1',
]

export default motionScene(({ root, motion, at, color }) => {
  root.innerHTML = `<div class="cq">
    <style>
      .cq { container-type: size; width: 100%; height: 100%; }
      .emp { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
      .emp__code { position: relative; font-family: var(--pm-font-mono); font-size: 8cqh; line-height: 1.7; color: var(--pm-color-ink); padding: 3cqh 3cqw; border-radius: 2cqh; background: var(--pm-color-surface); border: 0.3cqh solid var(--pm-color-line); }
      .emp__bar { position: absolute; left: 1.5cqw; right: 1.5cqw; top: 3cqh; height: 1.7em; border-radius: 1cqh; background: ${color('accent-soft')}; opacity: 0; transform-origin: top; }
      .emp__line { position: relative; white-space: pre; }
      .emp__tok { display: inline-block; color: var(--pm-color-danger); font-weight: 600; }
    </style>
    <div class="emp"><div class="emp__code"><div class="emp__bar"></div>${CODE.map((l, i) => `<div class="emp__line">${i === 4 ? l.replace(' - 1', ' <span class="emp__tok">- 1</span>') : l}</div>`).join('')}</div></div></div>`
  const bar = root.querySelector<HTMLElement>('.emp__bar')!
  const tok = root.querySelector<HTMLElement>('.emp__tok')!
  const s = (k: number) => at(k) / 1000
  const line = (n: number) => `${n * 100}%`
  const seq: MotionSequence = [
    // Step 0: the loop is the part that adds up.
    [bar, { opacity: [0, 1], y: [line(2), line(2)], scaleY: [1, 2] }, { at: s(0), duration: 0.5, ease: 'easeOut' }],
    // Step 1: the highlight moves to the return line and turns red.
    [bar, { y: line(4), scaleY: 1 }, { at: s(1), duration: 0.6, ease: 'easeInOut' }],
    [bar, { backgroundColor: [color('accent-soft'), color('danger-soft')] }, { at: s(1) + 0.4, duration: 0.3 }],
    [bar, { x: ['0%', '-1.5%', '1.5%', '-1%', '1%', '0%'] }, { at: s(1) + 0.6, duration: 0.5, ease: 'linear' }],
    // Step 2: the stray "- 1" pops.
    [tok, { scale: [1, 1.5, 1], rotate: [0, -8, 0] }, { at: s(2), duration: 0.8, times: [0, 0.2, 1], ease: ['backOut', 'easeInOut'] }],
  ]
  return motion.animate(seq)
})
