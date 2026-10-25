import { motionScene } from '@lincyaw/addon-motion/scene'
import type { MotionSequence } from '@lincyaw/addon-motion/scene'

// Path morphing with `attrD` (the `attr` prefix animates an SVG attribute; a plain `d` key does nothing): a fitted curve
// goes from a line (underfit) to a good fit to a wiggly overfit. Motion mixes the numbers inside the path strings,
// so every shape must have the same commands: here each is M + 80 L. The data points use a seeded PRNG.
const N = 80
const truth = (x: number) => 0.5 + 0.28 * Math.sin(2.2 * Math.PI * x)

function prng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 2 ** 32
  }
}

export default motionScene(({ root, motion, at, color }) => {
  const rand = prng(11)
  const points = Array.from({ length: 18 }, (_, i) => { const x = 0.03 + 0.94 * i / 17; return [x, truth(x) + (rand() - 0.5) * 0.22] as const })
  const over = (x: number) => truth(x) + 0.09 * Math.sin(17 * Math.PI * x) * Math.sin(Math.PI * x)
  const path = (f: (x: number) => number) => Array.from({ length: N + 1 }, (_, i) => { const x = i / N; return `${i ? 'L' : 'M'}${(8 + 144 * x).toFixed(2)} ${(85 - 78 * f(x)).toFixed(2)}` }).join(' ')
  const line = path(x => 0.42 + 0.12 * x)
  const good = path(truth)
  const wiggly = path(over)
  root.innerHTML = `<div class="cq">
    <style>
      .cq { container-type: size; width: 100%; height: 100%; }
      .morph { position: relative; width: 100%; height: 100%; font-family: var(--pm-font-sans); }
      .morph svg { width: 100%; height: 100%; display: block; }
      .morph circle { fill: var(--pm-color-ink); transform-box: fill-box; transform-origin: center; }
      .morph path { fill: none; stroke: var(--pm-color-accent); stroke-width: 1; stroke-linejoin: round; }
      .morph__tag { position: absolute; top: 4cqh; right: 4cqw; font-size: 6.5cqh; color: var(--pm-color-muted); }
    </style>
    <div class="morph"><svg viewBox="0 0 160 90">
      <path d="${line}"/>
      ${points.map(([x, y]) => `<circle cx="${(8 + 144 * x).toFixed(2)}" cy="${(85 - 78 * y).toFixed(2)}" r="1.4"/>`).join('')}
    </svg><div class="morph__tag">一次函数：欠拟合</div></div></div>`
  const curve = root.querySelector<SVGPathElement>('path')!
  const tag = root.querySelector<HTMLElement>('.morph__tag')!
  const tags = ['一次函数：欠拟合', '恰当的模型', '高次多项式：过拟合']
  const stage = motion.motionValue(0)
  stage.on('change', v => { tag.textContent = tags[Math.round(v)]! })
  const s = (k: number) => at(k) / 1000
  const seq: MotionSequence = [
    // Step 0: the dots and a straight-line fit.
    [root.querySelectorAll('circle'), { opacity: [0, 1], scale: [0, 1] }, { at: s(0), duration: 0.3, delay: motion.stagger(0.03) }],
    [curve, { pathLength: [0, 1] }, { at: s(0) + 0.5, duration: 0.5 }],
    // Step 1: the line bends into the right curve.
    [curve, { attrD: [line, good] }, { at: s(1), duration: 1, ease: 'easeInOut' }],
    [stage, [0, 1], { at: s(1), duration: 1 }],
    // Step 2: too many parameters: it wiggles through every dot.
    [curve, { attrD: [good, wiggly], stroke: [color('accent'), color('danger')] }, { at: s(2), duration: 1, ease: 'easeInOut' }],
    [stage, [1, 2], { at: s(2), duration: 1 }],
  ]
  return motion.animate(seq)
})
