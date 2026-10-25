import { motionScene } from '@lincyaw/addon-motion/scene'
import type { MotionSequence } from '@lincyaw/addon-motion/scene'

// Spring pop-in: a binary search tree grows level by level; nodes scale in with `type: 'spring'` (bounce, visualDuration)
// and edges draw with `pathLength`. In a sequence a spring becomes a fixed easing over its settle time, which is longer
// than `visualDuration` (bounce 0.5 at 0.35 s settles in about 1 s), so start each part at an absolute `at`.
const NODES = [
  { v: 8, x: 50, y: 14 },
  { v: 4, x: 27, y: 44, p: 0 }, { v: 12, x: 73, y: 44, p: 0 },
  { v: 2, x: 14, y: 78, p: 1 }, { v: 6, x: 38, y: 78, p: 1 }, { v: 10, x: 62, y: 78, p: 2 }, { v: 14, x: 86, y: 78, p: 2 },
]
const LEVELS = [[0], [1, 2], [3, 4, 5, 6]]

export default motionScene(({ root, motion, at, color }) => {
  root.innerHTML = `<div class="cq">
    <style>
      .cq { container-type: size; width: 100%; height: 100%; }
      .tree { position: relative; width: 100%; height: 100%; font-family: var(--pm-font-mono); }
      .tree svg { position: absolute; inset: 0; width: 100%; height: 100%; }
      .tree path { stroke: var(--pm-color-line-strong); stroke-width: 2; fill: none; }
      .tree__node { position: absolute; width: 16cqh; height: 16cqh; margin: -8cqh 0 0 -8cqh; border-radius: 50%; display: grid; place-items: center; font-size: 7cqh; background: var(--pm-color-surface); border: 0.5cqh solid ${color('accent')}; color: var(--pm-color-ink); transform: scale(0); }
    </style>
    <div class="tree">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none">${NODES.map(n => n.p === undefined ? '' : `<path vector-effect="non-scaling-stroke" d="M${NODES[n.p]!.x} ${NODES[n.p]!.y} L${n.x} ${n.y}"/>`).join('')}</svg>
      ${NODES.map(n => `<div class="tree__node" style="left:${n.x}%;top:${n.y}%">${n.v}</div>`).join('')}
    </div></div>`
  const nodes = [...root.querySelectorAll<HTMLElement>('.tree__node')]
  const edges = [...root.querySelectorAll<SVGPathElement>('path')]
  const edgeOf = (i: number) => edges[i - 1]!
  const s = (k: number) => at(k) / 1000

  const seq: MotionSequence = LEVELS.flatMap((level, k): MotionSequence => [
    // Each step: the edges to this level draw, then its nodes spring in, one after another.
    ...(k === 0 ? [] : [[level.map(edgeOf), { pathLength: [0, 1], opacity: [0, 1] }, { at: s(k), duration: 0.35, ease: 'easeOut' }] as MotionSequence[number]]),
    [level.map(i => nodes[i]!), { scale: [0, 1] }, { at: s(k) + (k === 0 ? 0 : 0.25), type: 'spring', bounce: 0.5, visualDuration: 0.35, delay: motion.stagger(0.08) }],
  ])
  return motion.animate(seq)
})
