import { motionScene } from '@lincyaw/addon-motion/scene'
import type { MotionSequence } from '@lincyaw/addon-motion/scene'

// Focus by blur: the card being discussed scales up while the others blur (`filter: blur()`) and fade. filter and
// opacity run on WAAPI (drawn at once on seek), scale on Motion's frame (the adapter flushes it), so they stay in step.
const CARDS = [
  ['监督学习', '有标签'], ['无监督学习', '找结构'], ['强化学习', '试错与奖励'], ['自监督学习', '从数据造标签'],
]

export default motionScene(({ root, motion, at }) => {
  root.innerHTML = `<div class="cq">
    <style>
      .cq { container-type: size; width: 100%; height: 100%; }
      .blur { width: 100%; height: 100%; display: grid; grid-template-columns: repeat(${CARDS.length}, 1fr); gap: 2.5cqw; padding: 18cqh 5cqw; box-sizing: border-box; font-family: var(--pm-font-sans); color: var(--pm-color-ink); }
      .blur__card { border-radius: 2cqh; border: 0.4cqh solid var(--pm-color-line); background: var(--pm-color-surface); display: grid; align-content: center; justify-items: center; gap: 3cqh; }
      .blur__card b { font-size: 5.6cqh; }
      .blur__card span { font-size: 4.2cqh; color: var(--pm-color-muted); }
    </style>
    <div class="blur">${CARDS.map(([a, b]) => `<div class="blur__card"><b>${a}</b><span>${b}</span></div>`).join('')}</div></div>`
  const cards = [...root.querySelectorAll<HTMLElement>('.blur__card')]
  const s = (k: number) => at(k) / 1000
  const SHARP = { filter: 'blur(0px)', opacity: 1, scale: 1 }
  const DIM = { filter: 'blur(5px)', opacity: 0.45, scale: 0.94 }
  const FOCUS = { filter: 'blur(0px)', opacity: 1, scale: 1.1 }
  // One state per card per step; each step's segments go from the last state to the next.
  const plan = [
    cards.map(() => SHARP),
    cards.map((_, i) => (i === 2 ? FOCUS : DIM)),
    cards.map((_, i) => (i === 3 ? FOCUS : DIM)),
  ]
  // Step 0: the cards come in; steps 1 and 2 move the focus.
  const seq: MotionSequence = [[cards, { opacity: [0, 1], y: ['20%', '0%'] }, { at: s(0), duration: 0.5, delay: motion.stagger(0.08) }]]
  for (let k = 1; k < plan.length; k++) {
    cards.forEach((card, i) => {
      const from = plan[k - 1]![i]!
      const to = plan[k]![i]!
      seq.push([card, { filter: [from.filter, to.filter], opacity: [from.opacity, to.opacity], scale: [from.scale, to.scale] }, { at: s(k), duration: 0.6, ease: 'easeInOut' }])
    })
  }
  return motion.animate(seq)
})
