import { motionScene } from '@lincyaw/addon-motion/scene'
import type { MotionSequence } from '@lincyaw/addon-motion/scene'

// A progress ring: `pathLength` on an SVG circle (rotated so it starts at 12 o'clock), the percentage as a motionValue,
// and the stroke color turning to the "ok" color at 100 %. Steps continue the same tracks (25 % → 72 % → 100 %).
export default motionScene(({ root, motion, at, color }) => {
  root.innerHTML = `<div class="cq">
    <style>
      .cq { container-type: size; width: 100%; height: 100%; }
      .ring { width: 100%; height: 100%; display: grid; grid-template-columns: auto auto; justify-content: center; align-items: center; gap: 6cqw; font-family: var(--pm-font-sans); color: var(--pm-color-ink); }
      .ring svg { height: 80cqh; aspect-ratio: 1; }
      .ring__track { fill: none; stroke: var(--pm-color-line); stroke-width: 9; }
      .ring__bar { fill: none; stroke: ${color('accent')}; stroke-width: 9; stroke-linecap: round; }
      .ring__pct { font-family: var(--pm-font-mono); font-size: 20px; fill: var(--pm-color-ink); text-anchor: middle; dominant-baseline: central; }
      .ring__list { list-style: none; margin: 0; padding: 0; font-size: 7cqh; line-height: 1.9; }
      .ring__list li { opacity: 0.35; }
    </style>
    <div class="ring">
      <svg viewBox="0 0 100 100"><circle class="ring__track" cx="50" cy="50" r="40"/><circle class="ring__bar" cx="50" cy="50" r="40" transform="rotate(-90 50 50)"/><text class="ring__pct" x="50" y="50">0%</text></svg>
      <ol class="ring__list"><li>下载数据</li><li>预处理</li><li>训练</li><li>评估</li></ol>
    </div></div>`
  const bar = root.querySelector<SVGCircleElement>('.ring__bar')!
  const pct = root.querySelector<SVGTextElement>('.ring__pct')!
  const items = [...root.querySelectorAll<HTMLElement>('.ring__list li')]
  const value = motion.motionValue(0)
  value.on('change', v => { pct.textContent = `${Math.round(v * 100)}%` })
  const s = (k: number) => at(k) / 1000
  const seq: MotionSequence = [
    [bar, { pathLength: [0, 0.25] }, { at: s(0), duration: 0.8, ease: 'easeOut' }],
    [value, [0, 0.25], { at: s(0), duration: 0.8, ease: 'easeOut' }],
    [items[0]!, { opacity: [0.35, 1] }, { at: s(0), duration: 0.3 }],
    [bar, { pathLength: 0.72 }, { at: s(1), duration: 1.1, ease: 'easeInOut' }],
    [value, [0.25, 0.72], { at: s(1), duration: 1.1, ease: 'easeInOut' }],
    [items.slice(1, 3), { opacity: [0.35, 1] }, { at: s(1), duration: 0.3, delay: motion.stagger(0.5) }],
    [bar, { pathLength: 1 }, { at: s(2), duration: 0.7, ease: 'easeIn' }],
    [value, [0.72, 1], { at: s(2), duration: 0.7, ease: 'easeIn' }],
    [items[3]!, { opacity: [0.35, 1] }, { at: s(2), duration: 0.3 }],
    [bar, { stroke: [color('accent'), color('ok')] }, { at: s(2) + 0.7, duration: 0.3 }],
  ]
  return motion.animate(seq)
})
