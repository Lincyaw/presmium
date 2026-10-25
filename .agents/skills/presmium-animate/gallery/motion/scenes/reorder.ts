import { motionScene } from '@lincyaw/addon-motion/scene'
import type { MotionSequence } from '@lincyaw/addon-motion/scene'

// Reordering a list: bubble sort, one pass per step. Every box keeps one `x` track (its slot, in % of its own width)
// and one `y` track for the hop over its neighbour; the swaps are computed up front, so any time maps to one layout.
// Pitfall: the start keyframe of each swap must be the box's current slot, so the slots are tracked while building.
const VALUES = [5, 2, 8, 1, 9, 3]
const SLOT = 120 // a slot is the box width plus the gap, in % of the box width

export default motionScene(({ root, motion, at, color }) => {
  root.innerHTML = `<div class="cq">
    <style>
      .cq { container-type: size; width: 100%; height: 100%; }
      .ord { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-family: var(--pm-font-mono); }
      .ord__row { position: relative; width: calc(${VALUES.length} * 13cqw + ${VALUES.length - 1} * 2.6cqw); height: 13cqw; }
      .ord__box { position: absolute; left: 0; top: 0; width: 13cqw; height: 13cqw; border-radius: 2cqw; display: grid; place-items: center; font-size: 6cqw; background: ${color('surface')}; border: 0.5cqh solid var(--pm-color-line-strong); color: var(--pm-color-ink); }
    </style>
    <div class="ord"><div class="ord__row">${VALUES.map(v => `<div class="ord__box">${v}</div>`).join('')}</div></div></div>`
  const boxes = [...root.querySelectorAll<HTMLElement>('.ord__box')]
  const s = (k: number) => at(k) / 1000
  const slot = VALUES.map((_, i) => i) // slot of each box
  const order = VALUES.map((_, i) => i) // box in each slot
  const seq: MotionSequence = boxes.map((b, i): MotionSequence[number] => [b, { x: [`${i * SLOT}%`, `${i * SLOT}%`], y: ['0%', '0%'] }, { at: 0, duration: 0.01 }])
  const swap = 0.4
  for (let pass = 0; pass < 3; pass++) {
    let t = s(pass)
    for (let j = 0; j < VALUES.length - 1 - pass; j++) {
      const a = order[j]!
      const b = order[j + 1]!
      if (VALUES[a]! <= VALUES[b]!) continue
      // a (the larger) hops over b.
      seq.push([boxes[a]!, { x: [`${slot[a]! * SLOT}%`, `${(slot[a]! + 1) * SLOT}%`], y: ['0%', '-70%', '0%'] }, { at: t, duration: swap, ease: 'easeInOut' }])
      seq.push([boxes[b]!, { x: [`${slot[b]! * SLOT}%`, `${(slot[b]! - 1) * SLOT}%`], y: ['0%', '70%', '0%'] }, { at: t, duration: swap, ease: 'easeInOut' }])
      slot[a]!++
      slot[b]!--
      order[j] = b
      order[j + 1] = a
      t += swap + 0.05
    }
  }
  // Step 3: sorted: the boxes turn the accent color from left to right.
  seq.push([order.map(i => boxes[i]!), { backgroundColor: [color('surface'), color('accent-soft')], scale: [1, 1.12, 1] }, { at: s(3), duration: 0.4, delay: motion.stagger(0.07) }])
  return motion.animate(seq)
})
