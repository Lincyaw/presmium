import { defineScene } from '@lincyaw/addon-motion/scene'
import { frame, pick } from '../../../lengths/scenes/kit/frame.ts'
import { ease } from '../../../lengths/scenes/kit/fx/time.ts'
import { axisBlur, beats, DEFS_CSS, in4, inOut4, oneOf, panel, PANEL_CSS, panelHtml, span } from './lib/stage.ts'

// Whip pan, with defineScene: the camera whips from panel A to panel B. States `a`, `whip`, `b` (0.6 + 0.55 + 1.6 s).
// `a`: A at rest, readable. `whip`, 0.55 s: A and B ride one strip, B docked a frame beyond A, and the strip runs
// one power3.inOut tween of a frame's width, so the seam's speed is the same on both sides by construction:
// accelerate, fastest in the middle, a decelerating catch. A blur along the motion only (an SVG feGaussianBlur,
// "x 0") rises on power3.in to its cap of 0.83 cqw (16 px of a 1920 frame) at the middle frame, the fastest, where
// the seam crosses the centre and the cut hides, then falls on power3.out, the mirror of the rise, to 0 as B
// stops. An accent hairline rides the seam only while the whip runs (in over 0.1 s, out over the last 0.15 s), the
// frame edge screaming past. The strip runs on past both panels so its blurred ends never enter the frame. `b`: B
// at rest, sharp. At most two or three whips in a film. A defineScene sibling of the gallery's Remotion
// `fx/remotion/whip-pan` (icons only, fixed direction): this one takes the two panels and a direction. Adapted from
// HyperFrames whip-pan-cut (and the whip-pan shader block).
const WHIP = 0.55          // s
const PEAK = 16 / 19.2     // cqw: 16 px on a 1920 px frame
const PAD = 30             // % of the frame: strip beyond each panel
const VEC = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] } as const

export default defineScene(ctx => {
  const { root, parameters, width } = ctx
  const a = panel(parameters.a, { icon: 'notebook', title: '在讲义里写', line: '公式、代码和图放在一处' })
  const b = panel(parameters.b, { icon: 'video', title: '导出成视频', line: '同一份文稿，一键成片' })
  const dir = oneOf(parameters.direction, ['left', 'right', 'up', 'down'] as const)
  const [vx, vy] = VEC[dir]
  // B sits a frame against the motion from A: the strip moves along (vx, vy), so B starts at −(vx, vy).
  const place = (k: number) => `left: ${-vx * k * 100}%; top: ${-vy * k * 100}%;`
  const el = frame(root, `${PANEL_CSS}${DEFS_CSS}
    .wp__strip { position: absolute; inset: 0; }
    .wp__cell { position: absolute; width: 100%; height: 100%; }
    .wp__pad { position: absolute; width: 100%; height: 100%; }
    .wp__seam { position: absolute; background: var(--pm-color-accent); opacity: 0; }
  `, `<div class="wp__strip">
      <div class="wp__pad" style="${place(-PAD / 100)} background: var(--pm-color-surface);"></div>
      <div class="wp__pad" style="${place(1 + PAD / 100)} background: var(--pm-color-accent-soft);"></div>
      <div class="wp__cell" style="${place(0)}">${panelHtml(a, 'plain')}</div>
      <div class="wp__cell" style="${place(1)}">${panelHtml(b, 'accent')}</div>
      <div class="wp__seam"></div></div>`)
  const strip = pick(el, '.wp__strip'), seam = pick(el, '.wp__seam')
  // The seam is the edge of A on the side B comes from.
  Object.assign(seam.style, vx
    ? { top: `${-PAD}%`, bottom: `${-PAD}%`, width: '0.25cqw', left: vx < 0 ? '100%' : '0', marginLeft: '-0.125cqw' }
    : { left: `${-PAD}%`, right: `${-PAD}%`, height: '0.25cqh', top: vy < 0 ? '100%' : '0', marginTop: '-0.125cqh' })
  const blur = axisBlur(el, strip, width, vx ? 'x' : 'y')
  const { at, len } = beats(ctx)
  const travel = inOut4, up = in4, down = ease.out4
  const dur = Math.min(WHIP, len(1) || WHIP)

  return (ms: number) => {
    const t = ms / 1000
    const p = span(t, at(1), dur), e = travel(p)
    strip.style.transform = `translate(${(vx * 100 * e).toFixed(3)}%, ${(vy * 100 * e).toFixed(3)}%)`
    // Mirrored eases across the seam: power3.in up to the peak at the middle frame, power3.out back down.
    blur(p <= 0 || p >= 1 ? 0 : p < 0.5 ? PEAK * up(p / 0.5) : PEAK * (1 - down((p - 0.5) / 0.5)))
    seam.style.opacity = String(p > 0 && p < 1 ? span(t, at(1), 0.1) * (1 - span(t, at(1) + dur - 0.15, 0.15)) : 0)
  }
})
