import { motionScene } from '@lincyaw/addon-motion/scene'
import type { MotionSequence } from '@lincyaw/addon-motion/scene'

// A signal flowing along edges with `pathOffset`: each edge has a short dash (`pathLength: 0.2`) and a gap of a whole
// path (`pathSpacing: 1`), so moving the offset from -0.2 to 1 sends one pulse from start to end. Forward pass, then
// the gradient flows back on separate overlay paths. Pitfall: without pathSpacing the gap is 1 - pathLength and the
// dash wraps around and shows at both ends.
const LAYERS = [[25, 50, 75], [15, 38, 62, 85], [30, 70], [50]]
const X = [20, 60, 100, 140]

export default motionScene(({ root, motion, at, color }) => {
  const edges: { a: [number, number], b: [number, number], layer: number }[] = []
  for (let l = 0; l < LAYERS.length - 1; l++)
    for (const ya of LAYERS[l]!) for (const yb of LAYERS[l + 1]!) edges.push({ a: [X[l]!, ya], b: [X[l + 1]!, yb], layer: l })
  const d = (e: typeof edges[number], back = false) => back ? `M${e.b[0]} ${e.b[1]} L${e.a[0]} ${e.a[1]}` : `M${e.a[0]} ${e.a[1]} L${e.b[0]} ${e.b[1]}`
  root.innerHTML = `<div class="cq">
    <style>
      .cq { container-type: size; width: 100%; height: 100%; }
      .flow { width: 100%; height: 100%; }
      .flow svg { width: 100%; height: 100%; display: block; }
      .flow path { fill: none; stroke-linecap: round; }
      .flow__base { stroke: var(--pm-color-line); stroke-width: 0.4; }
      .flow__fwd { stroke: var(--pm-color-accent); stroke-width: 1.1; }
      .flow__bwd { stroke: var(--pm-color-danger); stroke-width: 1.1; }
      .flow circle { fill: var(--pm-color-surface); stroke: var(--pm-color-ink); stroke-width: 0.5; }
      .flow text { font-size: 3.4px; fill: var(--pm-color-muted); font-family: var(--pm-font-sans); text-anchor: middle; }
    </style>
    <div class="flow"><svg viewBox="0 0 160 100" preserveAspectRatio="xMidYMid meet">
      ${edges.map(e => `<path class="flow__base" d="${d(e)}"/>`).join('')}
      ${edges.map(e => `<path class="flow__fwd" data-l="${e.layer}" d="${d(e)}"/>`).join('')}
      ${edges.map(e => `<path class="flow__bwd" data-l="${e.layer}" d="${d(e, true)}"/>`).join('')}
      ${LAYERS.flatMap((ys, l) => ys.map(y => `<circle cx="${X[l]}" cy="${y}" r="3.2"/>`)).join('')}
      <text x="${X[0]}" y="97">输入</text><text x="${X[1]}" y="97">隐藏层</text><text x="${X[2]}" y="97">隐藏层</text><text x="${X[3]}" y="97">输出</text>
    </svg></div></div>`
  const fwd = (l: number) => [...root.querySelectorAll<SVGPathElement>(`.flow__fwd[data-l="${l}"]`)]
  const bwd = (l: number) => [...root.querySelectorAll<SVGPathElement>(`.flow__bwd[data-l="${l}"]`)]
  const s = (k: number) => at(k) / 1000
  const hop = 0.5
  const pulse = { pathLength: [0.2, 0.2], pathSpacing: [1, 1], pathOffset: [-0.2, 1] }
  const seq: MotionSequence = [
    // Step 0: the forward pass, layer by layer.
    ...[0, 1, 2].map((l): MotionSequence[number] => [fwd(l), pulse, { at: s(0) + l * hop, duration: hop + 0.1, ease: 'linear' }]),
    // The backward paths start hidden (their dash is parked past the end).
    ...[0, 1, 2].map((l): MotionSequence[number] => [bwd(l), { pathLength: [0.2, 0.2], pathSpacing: [1, 1], pathOffset: [-0.2, -0.2] }, { at: 0, duration: 0.01 }]),
    // Step 1: the gradient flows back, output to input.
    ...[2, 1, 0].map((l, i): MotionSequence[number] => [bwd(l), { pathOffset: [-0.2, 1] }, { at: s(1) + i * hop, duration: hop + 0.1, ease: 'linear' }]),
    [root.querySelectorAll('circle'), { stroke: [color('ink'), color('danger')] }, { at: s(1) + 3 * hop, duration: 0.3 }],
  ]
  return motion.animate(seq)
})
