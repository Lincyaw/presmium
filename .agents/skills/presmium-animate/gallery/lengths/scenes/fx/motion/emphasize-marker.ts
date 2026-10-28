import { motionScene } from '@lincyaw/addon-motion/scene'
import type { MotionSequence } from '@lincyaw/addon-motion/scene'
import { frame, pick } from '../../kit/frame.ts'
import { mulberry32, range } from '../../kit/fx/random.ts'
import { smoothPath, type Point } from '../../kit/fx/paths.ts'
import { isDark } from '../../kit/fx/theme.ts'

// Emphasize with a marker, in Motion (state `emphasize`, 1 s). 0–0.15 s: the sentence is read as it is.
// 0.15–0.24 s: the key phrase gathers to 0.94 (anticipation). 0.24–0.42 s: it rises to 1.12, then one spring
// (bounce 0.3) brings it back to 1 by about 0.75 s; the overshoot is 12% so it reads at any size. 0.15–0.6 s: a
// marker stroke swipes left to right behind the phrase, skewed like a chisel tip, and the phrase deepens to the
// accent as the stroke passes it. The marker lies on the page and does not grow with the word: the word jumps off
// the ink. Constraints: all changes of `scale` are segments of one sequence; colour never springs (its own
// segment); the stroke's wobble is seeded, so the same parameters draw the same stroke on every build; the gap
// before the phrase leaves room for its 12% growth, since a transform does not push the neighbouring text.
export default motionScene(({ root, motion, color, parameters }) => {
  const plain = (parameters.plain as string | undefined) ?? '一份文稿，'
  const key = (parameters.key as string | undefined) ?? '四种形态'
  const seed = (parameters.seed as number | undefined) ?? 7
  const rng = mulberry32(seed)
  // A slightly wavy band that rises a little and flicks up at the end, as a hand pulls a marker.
  const points: Point[] = Array.from({ length: 6 }, (_, i) => {
    const u = i / 5
    return [3 + u * 94, 11.5 - u * 1.6 + range(rng, -0.9, 0.9) - (u > 0.9 ? 1.2 : 0)]
  })
  const ink = isDark(color('bg')) ? 38 : 28
  const f = frame(root, `
    .em { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font: 600 6cqw/1.2 var(--pm-font-serif); white-space: nowrap; }
    .em__key { position: relative; display: inline-block; margin-left: 0.2em; }
    .em__marker { position: absolute; left: -0.16em; right: -0.2em; top: 0.44em; height: 0.62em; overflow: visible; transform: skewX(-10deg) rotate(-1.5deg); }
    .em__ink { fill: none; stroke: color-mix(in oklab, var(--pm-color-accent) ${ink}%, transparent); stroke-width: 15; stroke-linecap: butt; }
    .em__word { position: relative; display: inline-block; }
  `, `<div class="em"><span>${plain}</span><span class="em__key"><svg class="em__marker" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true"><path class="em__ink" d="${smoothPath(points)}" /></svg><span class="em__word">${key}</span></span></div>`)
  const word = pick(f, '.em__word'), stroke = pick<SVGPathElement>(f, '.em__ink')
  const seq: MotionSequence = [
    [word, { scale: [1, 0.94] }, { at: 0.15, duration: 0.09, ease: 'easeOut' }],
    [word, { scale: 1.12 }, { at: 0.24, duration: 0.18, ease: [0.2, 0.9, 0.3, 1] }],
    [word, { scale: [1.12, 1] }, { at: 0.42, type: 'spring', bounce: 0.3, visualDuration: 0.26 }],
    [stroke, { pathLength: [0, 1] }, { at: 0.15, duration: 0.45, ease: [0.4, 0.75, 0.2, 1] }],
    [word, { color: [color('ink'), color('accent')] }, { at: 0.36, duration: 0.22, ease: 'easeOut' }],
  ]
  return motion.animate(seq)
})
