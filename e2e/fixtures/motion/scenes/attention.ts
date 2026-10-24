// @ts-nocheck: @lincyaw/addon-motion resolves from the deck the tests build (its node_modules link it), not from e2e/.
import { motionScene } from '@lincyaw/addon-motion/scene'
import type { MotionSequence } from '@lincyaw/addon-motion/scene'

// Attention weights with Motion: the bars grow, the query moves on and the weights shift, then the
// strongest key lights up. One Motion sequence; `at` places each part at its step (seconds).
const TOKENS = ['The', 'cat', 'sat', 'on', 'the', 'mat']
const FIRST = [0.12, 0.46, 0.18, 0.06, 0.08, 0.1]
const SECOND = [0.05, 0.14, 0.12, 0.09, 0.1, 0.5]

export default motionScene(({ root, motion, at, color }) => {
  root.innerHTML = `
    <style>
      .att { display: grid; grid-template-rows: auto 1fr auto; height: 100%; padding: 1.25rem 2rem; box-sizing: border-box; font-family: var(--pm-font-sans); color: var(--pm-color-ink); }
      .att__query { margin: 0; font-size: 1.1rem; color: var(--pm-color-muted); }
      .att__query b { color: var(--pm-color-accent); font-family: var(--pm-font-mono); }
      .att__bars { display: grid; grid-template-columns: repeat(${TOKENS.length}, 1fr); align-items: end; gap: 1rem; padding-top: 1rem; }
      .att__bar { height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 0.35rem; }
      .att__fill { width: 100%; height: 100%; border-radius: 0.4rem 0.4rem 0 0; background: ${color('line-strong')}; transform-origin: bottom; transform: scaleY(0); }
      .att__value { font-family: var(--pm-font-mono); font-size: 0.85rem; color: var(--pm-color-muted); }
      .att__labels { display: grid; grid-template-columns: repeat(${TOKENS.length}, 1fr); gap: 1rem; padding-top: 0.5rem; text-align: center; font-family: var(--pm-font-mono); font-size: 1.1rem; }
    </style>
    <div class="att">
      <p class="att__query">查询词：<b data-query>cat</b></p>
      <div class="att__bars">${TOKENS.map((_, i) => `<div class="att__bar"><span class="att__value" data-value="${i}">${FIRST[i]!.toFixed(2)}</span><div class="att__fill" data-fill="${i}"></div></div>`).join('')}</div>
      <div class="att__labels">${TOKENS.map(token => `<span>${token}</span>`).join('')}</div>
    </div>`
  const fills = TOKENS.map((_, i) => root.querySelector<HTMLElement>(`[data-fill="${i}"]`)!)
  const values = TOKENS.map((_, i) => root.querySelector<HTMLElement>(`[data-value="${i}"]`)!)
  const query = root.querySelector<HTMLElement>('[data-query]')!
  const scale = (w: number) => Math.min(1, w / 0.5)
  const s = (ms: number) => ms / 1000
  // One sequence: segments of the same element and value join into one track, so seeking anywhere
  // shows what came before (separate animations of one value would override each other).
  const sequence: MotionSequence = [
    // Step 0: the weights of the query "cat" grow in.
    ...fills.map((fill, i): MotionSequence[number] => [fill, { scaleY: [0, scale(FIRST[i]!)] }, { duration: 0.6, at: s(at(0)) + i * 0.08, ease: 'easeOut' }]),
    // Step 1: the query moves to "mat": the same bars take the new weights.
    ...fills.map((fill, i): MotionSequence[number] => [fill, { scaleY: scale(SECOND[i]!) }, { duration: 0.8, at: s(at(1)), ease: 'easeInOut' }]),
    [(k: number) => values.forEach((el, i) => {
      el.textContent = (FIRST[i]! + (SECOND[i]! - FIRST[i]!) * k).toFixed(2)
    }), { duration: 0.8, at: s(at(1)) }],
    [query, { opacity: [1, 0, 1] }, { duration: 0.6, at: s(at(1)) }],
    [(k: number) => {
      query.textContent = k < 0.5 ? 'cat' : 'mat'
    }, { duration: 0.6, at: s(at(1)) }],
    // Step 2: the strongest key, "mat", stands out.
    [fills[5]!, { backgroundColor: [color('line-strong'), color('accent')] }, { duration: 0.5, at: s(at(2)) }],
  ]
  return motion.animate(sequence)
})
