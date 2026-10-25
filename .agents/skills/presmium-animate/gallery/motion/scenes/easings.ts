import { motionScene } from '@lincyaw/addon-motion/scene'
import type { MotionSequence } from '@lincyaw/addon-motion/scene'

// The easings side by side: named ones, `cubicBezier()` and `steps()`. Each row draws its curve from the easing
// function itself (Motion exports them: `motion.easeIn(p)` ...) and races a dot across with the same easing.
// backOut and anticipate leave [0, 1] on the way, so the rail leaves room on both sides.
export default motionScene(({ root, motion, at }) => {
  const EASES: [string, (p: number) => number][] = [
    ['linear', p => p],
    ['easeIn', motion.easeIn],
    ['easeOut', motion.easeOut],
    ['easeInOut', motion.easeInOut],
    ['circOut', motion.circOut],
    ['backOut', motion.backOut],
    ['anticipate', motion.anticipate],
    ['cubicBezier(.7,0,.2,1)', motion.cubicBezier(0.7, 0, 0.2, 1)],
    ['steps(5)', motion.steps(5)],
  ]
  const curve = (f: (p: number) => number) => Array.from({ length: 41 }, (_, i) => `${i ? 'L' : 'M'}${(i / 40 * 30).toFixed(2)} ${(9 - f(i / 40) * 6).toFixed(2)}`).join(' ')
  root.innerHTML = `<div class="cq">
    <style>
      .cq { container-type: size; width: 100%; height: 100%; }
      .ease { width: 100%; height: 100%; display: grid; grid-template-rows: repeat(${EASES.length}, 1fr); padding: 3cqh 4cqw; box-sizing: border-box; font-family: var(--pm-font-mono); color: var(--pm-color-ink); }
      .ease__row { display: grid; grid-template-columns: 31cqw 9cqw 1fr; align-items: center; gap: 2cqw; border-bottom: 0.2cqh solid var(--pm-color-line); }
      .ease__name { font-size: 4.4cqh; color: var(--pm-color-muted); }
      .ease svg { height: 8cqh; width: 9cqw; overflow: visible; }
      .ease svg path { fill: none; stroke: var(--pm-color-accent); stroke-width: 0.8; }
      .ease__rail { position: relative; height: 100%; margin: 0 6cqw; }
      .ease__slider { position: absolute; inset: 0 4cqh 0 0; }
      .ease__mover { width: 100%; height: 100%; display: flex; align-items: center; }
      .ease__dot { width: 4cqh; height: 4cqh; border-radius: 50%; background: var(--pm-color-accent); }
    </style>
    <div class="ease">${EASES.map(([name, f]) => `<div class="ease__row"><span class="ease__name">${name}</span><svg viewBox="0 0 30 12" preserveAspectRatio="none"><path d="${curve(f)}"/></svg><div class="ease__rail"><div class="ease__slider"><div class="ease__mover"><div class="ease__dot"></div></div></div></div></div>`).join('')}</div></div>`
  const movers = [...root.querySelectorAll<HTMLElement>('.ease__mover')]
  const s = (k: number) => at(k) / 1000
  const seq: MotionSequence = [
    ...movers.map((mv, i): MotionSequence[number] => [mv, { x: ['0%', '100%'] }, { at: s(0), duration: 1.6, ease: EASES[i]![1] }]),
    ...movers.map((mv, i): MotionSequence[number] => [mv, { x: ['100%', '0%'] }, { at: s(1), duration: 1.6, ease: EASES[i]![1] }]),
  ]
  return motion.animate(seq)
})
