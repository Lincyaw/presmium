import { motionScene } from '@lincyaw/addon-motion/scene'
import type { MotionSequence } from '@lincyaw/addon-motion/scene'

// `steps(n)` for discrete motion: a linear search pointer jumps cell to cell instead of gliding, and the comparison
// counter uses the same easing so the two always agree. Then binary search on the same array: each probe is its own
// segment of the pointer's `x` track, and the discarded halves fade with opacity.
const ARR = [3, 8, 13, 21, 34, 42, 55, 61, 77, 89]
const TARGET = 61
const CELL = 100 // the pointer moves in % of its own width, which is one cell

export default motionScene(({ root, motion, at, color }) => {
  root.innerHTML = `<div class="cq">
    <style>
      .cq { container-type: size; width: 100%; height: 100%; }
      .scan { width: 100%; height: 100%; display: grid; align-content: center; gap: 3cqh; padding: 0 5cqw; box-sizing: border-box; font-family: var(--pm-font-mono); color: var(--pm-color-ink); }
      .scan__head { font-family: var(--pm-font-sans); font-size: 7cqh; }
      .scan__head b { font-family: var(--pm-font-mono); color: var(--pm-color-accent); }
      .scan__row { display: grid; grid-template-columns: repeat(${ARR.length}, 1fr); }
      .scan__cell { aspect-ratio: 1; display: grid; place-items: center; font-size: 6.5cqh; border: 0.3cqh solid var(--pm-color-line-strong); margin-left: -0.3cqh; background: ${color('surface')}; }
      .scan__ptr { width: calc(100% / ${ARR.length}); text-align: center; font-size: 9cqh; color: var(--pm-color-accent); line-height: 1; }
      .scan__idx { display: grid; grid-template-columns: repeat(${ARR.length}, 1fr); text-align: center; font-size: 4.4cqh; color: var(--pm-color-muted); }
    </style>
    <div class="scan">
      <div class="scan__head">找 <b>${TARGET}</b> · 比较次数 <b data-count>0</b></div>
      <div class="scan__ptr">▼</div>
      <div class="scan__row">${ARR.map(v => `<div class="scan__cell">${v}</div>`).join('')}</div>
      <div class="scan__idx">${ARR.map((_, i) => `<span>${i}</span>`).join('')}</div>
    </div></div>`
  const ptr = root.querySelector<HTMLElement>('.scan__ptr')!
  const cells = [...root.querySelectorAll<HTMLElement>('.scan__cell')]
  const countText = root.querySelector<HTMLElement>('[data-count]')!
  const count = motion.motionValue(1)
  count.on('change', v => { countText.textContent = Math.round(v).toString() })
  const found = ARR.indexOf(TARGET)
  const s = (k: number) => at(k) / 1000
  const seq: MotionSequence = [
    // Step 0: linear search, one cell per tick.
    [ptr, { x: ['0%', `${found * CELL}%`] }, { at: s(0), duration: 1.4, ease: motion.steps(found, 'end') }],
    [count, [1, found + 1], { at: s(0), duration: 1.4, ease: motion.steps(found, 'end') }],
    [cells[found]!, { backgroundColor: [color('surface'), color('ok-soft')] }, { at: s(0) + 1.4, duration: 0.2 }],
    // Step 1: binary search: back to the start, then probe the middles.
    [ptr, { x: `${0}%` }, { at: s(1), duration: 0.3 }],
    [cells[found]!, { backgroundColor: [color('ok-soft'), color('surface')] }, { at: s(1), duration: 0.2 }],
    [count, [found + 1, 0], { at: s(1), duration: 0.3, ease: motion.steps(1, 'start') }],
  ]
  // The probes of binary search: lo..hi shrinks, the other half fades.
  let lo = 0
  let hi = ARR.length - 1
  let t = s(1) + 0.4
  let n = 0
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    n++
    seq.push([ptr, { x: `${mid * CELL}%` }, { at: t, duration: 0.35, ease: 'backOut' }])
    seq.push([count, [n - 1, n], { at: t, duration: 0.35, ease: motion.steps(1, 'start') }])
    if (ARR[mid] === TARGET) {
      seq.push([cells[mid]!, { backgroundColor: [color('surface'), color('ok-soft')] }, { at: t + 0.35, duration: 0.2 }])
      break
    }
    const out = ARR[mid]! < TARGET ? cells.slice(lo, mid + 1) : cells.slice(mid, hi + 1)
    seq.push([out, { opacity: [1, 0.25] }, { at: t + 0.35, duration: 0.25 }])
    if (ARR[mid]! < TARGET) lo = mid + 1
    else hi = mid - 1
    t += 0.7
  }
  return motion.animate(seq)
})
