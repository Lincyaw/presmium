import { motionScene } from '@lincyaw/addon-motion/scene'
import type { MotionSequence } from '@lincyaw/addon-motion/scene'

// SVG line drawing with `pathLength` (0 to 1 of the path, whatever its real length): the axes, then the training
// loss curve, then the validation curve. Motion sets the path's pathLength="1" and writes stroke-dasharray, so do not
// give the drawn path a dash pattern of its own (the dashed reference line is a separate, undrawn path).
const N = 60
const train = (t: number) => 0.12 + 0.75 * Math.exp(-4 * t)
const valid = (t: number) => 0.2 + 0.68 * Math.exp(-3.6 * t) + 0.18 * Math.max(0, t - 0.55) ** 2 * 3

function curve(f: (t: number) => number) {
  return Array.from({ length: N + 1 }, (_, i) => {
    const t = i / N
    return `${i ? 'L' : 'M'}${(10 + 85 * t).toFixed(2)} ${(90 - 80 * f(t)).toFixed(2)}`
  }).join(' ')
}

export default motionScene(({ root, motion, at }) => {
  root.innerHTML = `<div class="cq">
    <style>
      .cq { container-type: size; width: 100%; height: 100%; }
      .draw { position: relative; width: 100%; height: 100%; font-family: var(--pm-font-sans); }
      .draw svg { width: 100%; height: 100%; display: block; }
      .draw path { fill: none; stroke-linecap: butt; stroke-linejoin: round; }
      .draw__axis { stroke: var(--pm-color-ink); stroke-width: 0.5; }
      .draw__train { stroke: var(--pm-color-accent); stroke-width: 1; }
      .draw__valid { stroke: var(--pm-color-warn); stroke-width: 1; }
      .draw__best { stroke: var(--pm-color-muted); stroke-width: 0.3; stroke-dasharray: 1 1; }
      .draw text { font-size: 4.4px; fill: var(--pm-color-muted); }
    </style>
    <div class="draw"><svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
      <path class="draw__axis" d="M10 8 L10 90 L97 90"/>
      <text x="11" y="6">损失</text><text x="88" y="96">轮数</text>
      <path class="draw__best" d="M${10 + 85 * 0.55} 10 L${10 + 85 * 0.55} 90" opacity="0"/>
      <text class="draw__note" x="${10 + 85 * 0.55 + 1}" y="14" opacity="0">提前停止</text>
      <path class="draw__train" d="${curve(train)}"/>
      <path class="draw__valid" d="${curve(valid)}"/>
      <text class="draw__k1" x="80" y="${90 - 80 * train(1) - 2}" opacity="0">训练</text>
      <text class="draw__k2" x="80" y="${90 - 80 * valid(1) - 2}" opacity="0">验证</text>
    </svg></div></div>`
  const q = (sel: string) => root.querySelector<SVGElement>(sel)!
  const s = (k: number) => at(k) / 1000
  const seq: MotionSequence = [
    // Step 0: the axes draw in.
    [q('.draw__axis'), { pathLength: [0, 1] }, { at: s(0), duration: 0.8, ease: 'easeInOut' }],
    [q('.draw__train'), { pathLength: [0, 0] }, { at: s(0), duration: 0.01 }],
    [q('.draw__valid'), { pathLength: [0, 0] }, { at: s(0), duration: 0.01 }],
    // Step 1: the training loss draws from left to right at a steady pace.
    [q('.draw__train'), { pathLength: [0, 1] }, { at: s(1), duration: 1.4, ease: 'linear' }],
    [q('.draw__k1'), { opacity: [0, 1] }, { at: s(1) + 1.2, duration: 0.3 }],
    // Step 2: the validation loss, and where it turns up.
    [q('.draw__valid'), { pathLength: [0, 1] }, { at: s(2), duration: 1.4, ease: 'linear' }],
    [q('.draw__k2'), { opacity: [0, 1] }, { at: s(2) + 1.2, duration: 0.3 }],
    [q('.draw__best'), { opacity: [0, 1] }, { at: s(2) + 0.8, duration: 0.4 }],
    [q('.draw__note'), { opacity: [0, 1] }, { at: s(2) + 0.8, duration: 0.4 }],
  ]
  return motion.animate(seq)
})
