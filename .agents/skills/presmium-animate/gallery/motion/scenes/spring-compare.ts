import { motionScene } from '@lincyaw/addon-motion/scene'
import type { MotionSequence } from '@lincyaw/addon-motion/scene'

// Springs side by side: the same visualDuration with bounce 0, 0.25, 0.5 and 0.75, then a physical spring
// (stiffness, damping, mass). Each marker moves `x` in % of a mover as wide as its rail, so it scales with the frame.
// A spring with a lot of bounce rings long after visualDuration: the step must last its settle time (here ~2.4 s).
const SPRINGS = [
  { label: 'bounce 0', t: { type: 'spring', bounce: 0, visualDuration: 0.5 } },
  { label: 'bounce 0.25', t: { type: 'spring', bounce: 0.25, visualDuration: 0.5 } },
  { label: 'bounce 0.5', t: { type: 'spring', bounce: 0.5, visualDuration: 0.5 } },
  { label: 'bounce 0.75', t: { type: 'spring', bounce: 0.75, visualDuration: 0.5 } },
  { label: 'stiffness 80, damping 6', t: { type: 'spring', stiffness: 80, damping: 6, mass: 1 } },
] as const

export default motionScene(({ root, motion, at }) => {
  root.innerHTML = `<div class="cq">
    <style>
      .cq { container-type: size; width: 100%; height: 100%; }
      .spr { width: 100%; height: 100%; display: grid; grid-template-rows: repeat(${SPRINGS.length}, 1fr); padding: 4cqh 4cqw; box-sizing: border-box; gap: 2cqh; font-family: var(--pm-font-mono); color: var(--pm-color-ink); }
      .spr__row { display: grid; grid-template-columns: 28cqw 1fr; align-items: center; }
      .spr__label { font-size: 4cqh; color: var(--pm-color-muted); }
      .spr__rail { position: relative; height: 100%; border-left: 0.4cqh solid var(--pm-color-line-strong); border-right: 0.4cqh dashed var(--pm-color-accent); }
      .spr__slider { position: absolute; inset: 0 8cqh 0 0; }
      .spr__mover { width: 100%; height: 100%; }
      .spr__dot { width: 8cqh; height: 8cqh; border-radius: 50%; background: var(--pm-color-accent); margin-top: calc((min(100%, 16cqh) - 8cqh) / 2); }
    </style>
    <div class="spr">${SPRINGS.map(sp => `<div class="spr__row"><span class="spr__label">${sp.label}</span><div class="spr__rail"><div class="spr__slider"><div class="spr__mover"><div class="spr__dot"></div></div></div></div></div>`).join('')}</div></div>`
  const movers = [...root.querySelectorAll<HTMLElement>('.spr__mover')]
  const s = (k: number) => at(k) / 1000
  const seq: MotionSequence = [
    // Step 0: all go right at once.
    ...movers.map((m, i): MotionSequence[number] => [m, { x: ['0%', '100%'] }, { at: s(0), ...SPRINGS[i]!.t }]),
    // Step 1: and back.
    ...movers.map((m, i): MotionSequence[number] => [m, { x: ['100%', '0%'] }, { at: s(1), ...SPRINGS[i]!.t }]),
  ]
  return motion.animate(seq)
})
