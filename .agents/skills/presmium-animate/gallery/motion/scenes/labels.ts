import { motionScene } from '@lincyaw/addon-motion/scene'
import type { MotionSequence } from '@lincyaw/addon-motion/scene'

// Labels and relative `at`: a compiler pipeline. Within a step the parts are chained with '+0.05' (after the previous
// segment ends), '<' (with the previous one) and a named label; each step's chain is anchored at an absolute label
// `{ name, at: at(k) / 1000 }` so the steps stay where the timeline puts them.
const STAGES = ['源码', '词法分析', '语法树', '中间表示', '机器码']

export default motionScene(({ root, motion, at, color }) => {
  root.innerHTML = `<div class="cq">
    <style>
      .cq { container-type: size; width: 100%; height: 100%; }
      .pipe { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; gap: 1.2cqw; font-family: var(--pm-font-sans); color: var(--pm-color-ink); }
      .pipe__box { padding: 4cqh 1.6cqw; border-radius: 1.6cqh; border: 0.4cqh solid var(--pm-color-line-strong); background: var(--pm-color-surface); font-size: 6cqh; white-space: nowrap; opacity: 0; }
      .pipe__arrow { width: 4cqw; height: 0.6cqh; background: var(--pm-color-muted); transform-origin: left; transform: scaleX(0); position: relative; }
      .pipe__arrow::after { content: ''; position: absolute; right: -0.4cqw; top: -1.2cqh; border: 1.5cqh solid transparent; border-left-color: var(--pm-color-muted); border-right-width: 0; }
      .pipe__caption { position: absolute; bottom: 10cqh; left: 0; right: 0; text-align: center; font-size: 6.5cqh; color: var(--pm-color-muted); opacity: 0; }
      .pipe__wrap { position: relative; width: 100%; height: 100%; }
    </style>
    <div class="pipe__wrap"><div class="pipe">${STAGES.map((st, i) => `${i ? '<div class="pipe__arrow"></div>' : ''}<div class="pipe__box">${st}</div>`).join('')}</div><div class="pipe__caption">每一段只看前一段的产物</div></div></div>`
  const boxes = [...root.querySelectorAll<HTMLElement>('.pipe__box')]
  const arrows = [...root.querySelectorAll<HTMLElement>('.pipe__arrow')]
  const caption = root.querySelector<HTMLElement>('.pipe__caption')!
  const s = (k: number) => at(k) / 1000
  const seq: MotionSequence = [
    { name: 'build', at: s(0) },
    [boxes[0]!, { opacity: [0, 1], x: ['-30%', '0%'] }, { at: 'build', duration: 0.3 }],
    ...arrows.flatMap((arrow, i): MotionSequence => [
      [arrow, { scaleX: [0, 1] }, { at: '+0.02', duration: 0.18, ease: 'easeIn' }],
      [boxes[i + 1]!, { opacity: [0, 1], x: ['-30%', '0%'] }, { at: '-0.05', duration: 0.3 }],
    ]),
    { name: 'focus', at: s(1) },
    [boxes, { borderColor: [color('line-strong'), color('accent')] }, { at: 'focus', duration: 0.25, delay: motion.stagger(0.18) }],
    [boxes, { y: ['0%', '-25%', '0%'] }, { at: '<', duration: 0.35, delay: motion.stagger(0.18) }],
    [caption, { opacity: [0, 1], y: ['40%', '0%'] }, { at: '+0.1', duration: 0.4 }],
  ]
  return motion.animate(seq)
})
