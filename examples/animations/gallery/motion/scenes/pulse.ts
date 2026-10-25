import { motionScene } from '@lincyaw/addon-motion/scene'
import type { MotionSequence } from '@lincyaw/addon-motion/scene'

// `repeat` inside a sequence: a leader's heartbeat (`repeat: 3, repeatType: 'reverse'`) and broadcast rings
// (`repeat: 2`, loop) to its followers, which light up as a ring reaches them. A segment can repeat fewer than
// 20 times (Infinity is ignored with a warning): it is unrolled into keyframes, so it seeks like any other segment.
const FOLLOWERS = [[16, 22], [84, 20], [14, 72], [86, 74], [50, 84]]

export default motionScene(({ root, motion, at, color }) => {
  root.innerHTML = `<div class="cq">
    <style>
      .cq { container-type: size; width: 100%; height: 100%; }
      .pulse { position: relative; width: 100%; height: 100%; font-family: var(--pm-font-sans); }
      .pulse__leader, .pulse__ring, .pulse__node { position: absolute; border-radius: 50%; transform: translate(-50%, -50%); }
      .pulse__leader { left: 50%; top: 45%; width: 26cqh; height: 26cqh; display: grid; place-items: center; background: var(--pm-color-accent); color: var(--pm-color-on-accent); font-size: 6cqh; }
      .pulse__ring { left: 50%; top: 45%; width: 26cqh; height: 26cqh; border: 0.6cqh solid var(--pm-color-accent); box-sizing: border-box; opacity: 0; }
      .pulse__node { width: 17cqh; height: 17cqh; display: grid; place-items: center; background: ${color('surface')}; border: 0.4cqh solid var(--pm-color-line-strong); font-size: 4.6cqh; color: ${color('ink')}; }
    </style>
    <div class="pulse">
      ${FOLLOWERS.map(([x, y], i) => `<div class="pulse__node" style="left:${x}%;top:${y}%">节点${i + 1}</div>`).join('')}
      <div class="pulse__ring"></div><div class="pulse__ring"></div>
      <div class="pulse__leader">领导者</div>
    </div></div>`
  const leader = root.querySelector<HTMLElement>('.pulse__leader')!
  const rings = [...root.querySelectorAll<HTMLElement>('.pulse__ring')]
  const nodes = root.querySelectorAll<HTMLElement>('.pulse__node')
  const s = (k: number) => at(k) / 1000
  const seq: MotionSequence = [
    // Step 0: the leader's heartbeat: up and back, four times.
    [leader, { x: ['-50%', '-50%'], y: ['-50%', '-50%'], scale: [1, 1.15] }, { at: s(0), duration: 0.25, repeat: 3, repeatType: 'reverse', ease: 'easeOut' }],
    // Step 1: two rings go out, each three times; the followers answer.
    ...rings.map((ring, i): MotionSequence[number] => [ring, { x: ['-50%', '-50%'], y: ['-50%', '-50%'], scale: [1, 3.4], opacity: [0.8, 0] }, { at: s(1) + i * 0.3, duration: 0.6, repeat: 2, ease: 'easeOut' }]),
    [nodes, { backgroundColor: [color('surface'), color('accent')], color: [color('ink'), color('on-accent')], scale: [1, 1.2, 1] }, { at: s(1) + 0.4, duration: 0.4, delay: motion.stagger(0.12) }],
  ]
  return motion.animate(seq)
})
