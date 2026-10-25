import { motionScene } from '@lincyaw/addon-motion/scene'
import type { MotionSequence } from '@lincyaw/addon-motion/scene'

// 3D transforms: flash cards flip with `rotateY` (the parent has `perspective`, the card `transform-style:
// preserve-3d`, each face `backface-visibility: hidden`), staggered, with a lift (`z`, `scale`) during the turn.
// Pitfall: opacity on the turning element flattens its 3D (the back face never shows); fade a wrapper instead.
const CARDS = [
  ['梯度下降一步', 'θ ← θ − η∇L(θ)'],
  ['Softmax', 'eᶻⁱ / Σⱼ eᶻʲ'],
  ['交叉熵', '−Σ y log p'],
]

export default motionScene(({ root, motion, at }) => {
  root.innerHTML = `<div class="cq">
    <style>
      .cq { container-type: size; width: 100%; height: 100%; }
      .flip { width: 100%; height: 100%; display: grid; grid-template-columns: repeat(3, 1fr); gap: 4cqw; padding: 16cqh 6cqw; box-sizing: border-box; font-family: var(--pm-font-sans); }
      .flip__slot { perspective: 120cqw; opacity: 0; }
      .flip__card { position: relative; width: 100%; height: 100%; transform-style: preserve-3d; }
      .flip__face { position: absolute; inset: 0; border-radius: 2.4cqh; display: grid; place-items: center; text-align: center; padding: 2cqw; backface-visibility: hidden; border: 0.4cqh solid var(--pm-color-line-strong); }
      .flip__front { background: var(--pm-color-surface); color: var(--pm-color-ink); font-size: 6cqh; font-weight: 600; }
      .flip__back { background: var(--pm-color-accent); color: var(--pm-color-on-accent); font-family: var(--pm-font-mono); font-size: 5.4cqh; transform: rotateY(180deg); }
    </style>
    <div class="flip">${CARDS.map(([q, a]) => `<div class="flip__slot"><div class="flip__card"><div class="flip__face flip__front">${q}</div><div class="flip__face flip__back">${a}</div></div></div>`).join('')}</div></div>`
  const slots = root.querySelectorAll<HTMLElement>('.flip__slot')
  const cards = root.querySelectorAll<HTMLElement>('.flip__card')
  const s = (k: number) => at(k) / 1000
  const seq: MotionSequence = [
    // Step 0: the questions are dealt from below, tilted.
    [slots, { opacity: [0, 1], y: ['40%', '0%'] }, { at: s(0), duration: 0.6, delay: motion.stagger(0.12), ease: 'easeOut' }],
    [cards, { rotateX: [35, 0] }, { at: s(0), duration: 0.6, delay: motion.stagger(0.12), ease: 'easeOut' }],
    // Step 1: each card turns over to its answer, rising off the table as it turns.
    [cards, { rotateY: [0, 180] }, { at: s(1), duration: 0.8, delay: motion.stagger(0.25), ease: 'easeInOut' }],
    [cards, { scale: [1, 1.08, 1], z: [0, 40, 0] }, { at: s(1), duration: 0.8, delay: motion.stagger(0.25), ease: 'easeInOut' }],
  ]
  return motion.animate(seq)
})
