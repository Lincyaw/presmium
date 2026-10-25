import { motionScene } from '@lincyaw/addon-motion/scene'
import type { MotionSequence } from '@lincyaw/addon-motion/scene'

// stagger(): a sentence's tokens appear from the center (`from: 'center'`), then a 2D ripple over a grid, where
// `delay` is a function of the element's index (stagger only knows the 1D index, so the 2D distance is computed here).
// Seek-safe: the delays are fixed when the sequence is built.
const TOKENS = ['注意力', '让', '每', '个', '词', '都', '看', '向', '句子', '中', '的', '其他', '词']
const COLS = 15
const ROWS = 7

export default motionScene(({ root, motion, at, color }) => {
  root.innerHTML = `<div class="cq">
    <style>
      .cq { container-type: size; width: 100%; height: 100%; }
      .rip { width: 100%; height: 100%; display: grid; grid-template-rows: auto 1fr; gap: 5cqh; padding: 6cqh 5cqw; box-sizing: border-box; font-family: var(--pm-font-sans); color: var(--pm-color-ink); }
      .rip__row { display: flex; justify-content: center; gap: 0.8cqw; flex-wrap: nowrap; }
      .rip__tok { padding: 1cqh 0.9cqw; border-radius: 1cqh; background: var(--pm-color-surface); border: 0.3cqh solid var(--pm-color-line); font-size: 4.6cqh; opacity: 0; }
      .rip__grid { display: grid; grid-template-columns: repeat(${COLS}, 1fr); grid-template-rows: repeat(${ROWS}, 1fr); gap: 0.8cqh; }
      .rip__cell { border-radius: 0.8cqh; background: ${color('line')}; }
    </style>
    <div class="rip">
      <div class="rip__row">${TOKENS.map(t => `<span class="rip__tok">${t}</span>`).join('')}</div>
      <div class="rip__grid">${Array.from({ length: COLS * ROWS }, () => '<div class="rip__cell"></div>').join('')}</div>
    </div></div>`
  const tokens = root.querySelectorAll<HTMLElement>('.rip__tok')
  const cells = root.querySelectorAll<HTMLElement>('.rip__cell')
  const s = (k: number) => at(k) / 1000
  const cx = (COLS - 1) / 2
  const cy = (ROWS - 1) / 2
  const ring = (i: number) => Math.hypot(i % COLS - cx, Math.floor(i / COLS) - cy)

  const seq: MotionSequence = [
    // Step 0: the middle token first, then outwards to both ends.
    [tokens, { opacity: [0, 1], y: ['60%', '0%'] }, { at: s(0), duration: 0.5, delay: motion.stagger(0.05, { from: 'center' }) }],
    // Step 1: a ripple from the grid's center: the delay grows with the distance.
    [cells, { scale: [1, 0.55, 1], backgroundColor: [color('line'), color('accent'), color('accent-soft')] }, { at: s(1), duration: 0.6, delay: (i: number) => ring(i) * 0.07 }],
    // Step 2: back out from the last cell, with an eased stagger (late cells bunch up).
    [cells, { backgroundColor: [color('accent-soft'), color('line')] }, { at: s(2), duration: 0.3, delay: motion.stagger(0.008, { from: 'last', ease: 'easeIn' }) }],
  ]
  return motion.animate(seq)
})
