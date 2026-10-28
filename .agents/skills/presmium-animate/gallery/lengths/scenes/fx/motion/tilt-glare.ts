import { motionScene } from '@lincyaw/addon-motion/scene'
import type { MotionSequence } from '@lincyaw/addon-motion/scene'
import { frame, markSvg, pick } from '../../kit/frame.ts'
import { bake, follow, smooth } from '../../kit/motion-fx.ts'
import { isDark } from '../../kit/fx/theme.ts'

// Tilt and glare, in Motion (state `tilt`, 1 s). 0–0.8 s: an invisible pointer sweeps across the card from lower
// left to upper right; the card tilts in 3D under it (the side under the pointer sinks, up to 12°), a glare slides
// across the face the other way, the card's shadow shifts away from the tilt, and the Presmium mark lifts off the
// face, so the two layers part in depth and the mark's shadow on the face shows the gap. 0.75–1 s: the pointer has
// left, the card springs back flat, and rests.
// Pointer, tilt, glare, shadow and lift are computed at build from one pointer path: the tilt follows the pointer
// through a damped spring integrated with a fixed step, then every value is sampled at the same even times and
// played with `ease: 'linear'` (the easing is in the samples), so cause and effect share one timeline. Motion's
// `springValue` or `followValue` would follow on the wall clock instead. The glare is the sheen token, not ink: a
// highlight has to be lighter than the face in both themes, so the face is the accent, not the white surface.
// Constraints: nothing on the `preserve-3d` card has opacity, filter or overflow (that flattens it); the floating
// layer's `z` is in pixels, computed from `width` (the scene is built again on resize).
export default motionScene(({ root, motion, color, width }) => {
  const T = 1, N = 60
  // The pointer in card coordinates (−1 left or top edge, 1 right or bottom edge), over 0–0.8 s.
  const pass = (t: number) => { const u = Math.max(0, Math.min(1, t / 0.8)); return u * u * (3 - 2 * u) * 0.7 + u * 0.3 }
  const px = (t: number) => -1.5 + 3 * pass(t)
  const py = (t: number) => { const u = pass(t); return 0.55 - 1 * u - 0.25 * Math.sin(Math.PI * u) }
  // The hand counts while it is over the card, fading in and out across the edges.
  const over = (t: number) => smooth(-1.4, -0.8, px(t)) * smooth(1.35, 0.8, px(t))
  const clamp = (v: number) => Math.max(-1, Math.min(1, v))
  const spring = { stiffness: 380, damping: 29 }
  const ry = follow(t => 12 * clamp(px(t)) * over(t), T, spring)
  const rx = follow(t => -9 * clamp(py(t)) * over(t), T, spring)
  // The lift dips below 0 on its way back; a negative lift would sink the mark behind the face.
  const springLift = follow(over, T, { stiffness: 300, damping: 26 })
  const lift = (t: number) => Math.max(0, springLift(t))
  // The light is fixed at the upper left: the glare moves against the tilt and strengthens with it.
  const tilt = (t: number) => Math.min(1, Math.hypot(rx(t), ry(t)) / 10)
  // Keyframes at the shared even times; the last one is the resting value, so the card ends exactly flat.
  const keys = (g: (t: number) => number, rest = 0) => bake(g, T, N).map((v, i) => (i === N ? rest : v))
  const dark = isDark(color('bg'))
  const z = Math.round(width * 0.032), base = Math.max(2, Math.round(width * 0.003))
  const f = frame(root, `
    .tg { position: absolute; inset: 0; display: grid; place-items: center; perspective: 62cqw; }
    .tg__card { --gx: 35; --gy: 28; --ga: 0; --sx: 0; --sy: 0; --lift: 0; position: relative; width: 26cqw; height: 34cqw; border-radius: 2.2cqw; transform-style: preserve-3d;
      background: linear-gradient(155deg, color-mix(in oklab, var(--pm-color-accent) 84%, var(--pm-color-sheen)), var(--pm-color-accent) 48%, color-mix(in oklab, var(--pm-color-accent) 72%, var(--pm-color-shadow)));
      color: var(--pm-color-on-accent);
      box-shadow: calc(var(--sx) * 1cqw) calc(var(--sy) * 1cqw + 1.4cqw + var(--lift) * 0.8cqw) calc(3.4cqw + var(--lift) * 2.6cqw) color-mix(in oklab, var(--pm-color-shadow) calc(${dark ? 40 : 18}% + var(--lift) * 10%), transparent); }
    .tg__card > * { position: absolute; }
    .tg__rim { inset: 1.3cqw; border-radius: 1.3cqw; border: 0.16cqw solid color-mix(in oklab, var(--pm-color-sheen) 24%, transparent); }
    .tg__dots { left: 2.6cqw; bottom: 2.6cqw; display: flex; gap: 0.9cqw; }
    .tg__dots i { width: 1.2cqw; height: 1.2cqw; border-radius: 50%; background: color-mix(in oklab, var(--pm-color-sheen) 30%, transparent); }
    .tg__dots i:first-child { width: 5cqw; border-radius: 1cqw; }
    .tg__shade { left: 50%; top: 50%; width: 15cqw; height: 15cqw; margin: -7.5cqw 0 0 -7.5cqw; color: var(--pm-color-shadow);
      opacity: calc(0.16 + var(--lift) * 0.18); filter: blur(calc(0.25cqw + var(--lift) * 0.7cqw));
      transform: translate(calc(var(--lift) * 0.9cqw + var(--sx) * 0.3cqw), calc(var(--lift) * 1.3cqw)); }
    .tg__float { left: 50%; top: 50%; width: 15cqw; height: 15cqw; margin: -7.5cqw 0 0 -7.5cqw; }
    .tg__float svg, .tg__shade svg { width: 100%; height: 100%; display: block; }
    .tg__glare { inset: 0; border-radius: inherit; transform: translateZ(0.1cqw);
      background: radial-gradient(circle at calc(var(--gx) * 1%) calc(var(--gy) * 1%), color-mix(in oklab, var(--pm-color-sheen) calc(var(--ga) * ${dark ? 62 : 58}%), transparent), transparent 56%),
        radial-gradient(circle at calc(100% - var(--gx) * 1%) calc(100% - var(--gy) * 1%), color-mix(in oklab, var(--pm-color-shadow) calc(var(--ga) * 16%), transparent), transparent 60%); }
  `, `<div class="tg"><div class="tg__card">
      <div class="tg__rim"></div>
      <div class="tg__dots"><i></i><i></i><i></i></div>
      <div class="tg__shade">${markSvg('tg-mark')}</div>
      <div class="tg__glare"></div>
      <div class="tg__float">${markSvg('tg-mark')}</div>
    </div></div>`)
  const card = pick(f, '.tg__card')
  const glareX = (t: number) => 35 - ry(t) * 2.6, glareY = (t: number) => 28 + rx(t) * 2.6
  const seq: MotionSequence = [
    [card, {
      rotateX: keys(rx), rotateY: keys(ry), scale: keys(t => 1 + 0.025 * lift(t), 1),
      '--gx': keys(glareX, 35), '--gy': keys(glareY, 28), '--ga': keys(tilt), '--lift': keys(lift),
      '--sx': keys(t => -ry(t) * 0.11), '--sy': keys(t => rx(t) * 0.09),
    }, { at: 0, duration: T, ease: 'linear' }],
    // The mark floats a little above the glare (0.1 cqw) even at rest, so the two never share a plane.
    [pick(f, '.tg__float'), { z: keys(t => base + lift(t) * z, base) }, { at: 0, duration: T, ease: 'linear' }],
  ]
  return motion.animate(seq)
})
