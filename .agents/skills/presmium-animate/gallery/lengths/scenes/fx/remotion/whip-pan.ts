import { remotionScene } from '@lincyaw/addon-motion/scene'
import { uid } from '../../kit/fx/ids.ts'
import { ICONS } from '../../kit/icons.ts'
import { CLAMP, directionalBlur, exact } from '../../kit/remotion-fx.ts'

// Whip pan, with Remotion: the camera whips sideways from one panel to the next. State `whip` (1 s).
// 0–0.25 s: panel A at rest. 0.25–0.75 s (15 frames): both panels, side by side on one strip, slide a frame
// width on an exponential ease-in-out, and the strip is blurred along x only, by its speed (the central
// difference of the same pure progress, 0.3 px of blur per px per frame, at most 60): A smears off and B arrives
// out of the same smear and sharpens as it stops. The fastest frame is the middle one, where the seam between
// the panels crosses the centre: the cut hides in the blur. 0.75–1 s: panel B at rest, sharp. CSS `blur()` is
// the same in every direction and reads as defocus, so the blur is an SVG `feGaussianBlur` with "x 0", its id
// taken once per instance, and removed when it is below half a pixel; the strip runs on past both panels so its
// blurred ends never enter the frame, and the ease is rescaled to end at exactly 0 and 1 (Remotion's exp is
// 2^-10 off, 0.6 px). Speed lines (technique 29) were tried and left out: over flat panels they read as ruled
// lines. Panels: `from` and `to` name icons of kit/icons.ts. At most two or three whips a film.
const PAD = 400                    // strip beyond each panel, px: wider than the blur's reach
const WHIP = [7.5, 22.5]           // frames; the middle frame, f15, is the fastest

export default remotionScene(({ React, remotion, parameters }) => {
  const { AbsoluteFill, Easing, interpolate, useCurrentFrame } = remotion
  const h = React.createElement
  const from = (parameters.from as keyof typeof ICONS | undefined) ?? 'web'
  const to = (parameters.to as keyof typeof ICONS | undefined) ?? 'video'
  const id = uid('pm-whip-pan')
  const ease = exact(Easing.inOut(Easing.exp))
  const progress = (f: number) => ease(interpolate(f, WHIP, [0, 1], CLAMP))

  const icon = (name: keyof typeof ICONS) => h('div', { style: { width: 220, height: 220 }, dangerouslySetInnerHTML: { __html: ICONS[name].replace('<svg ', '<svg width="100%" height="100%" ') } })
  const panel = (name: keyof typeof ICONS, bg: string, disc: string) => h('div', { style: { width: 1280, height: 720, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: bg } },
    h('div', { style: { width: 360, height: 360, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: disc, color: 'var(--pm-color-accent)' } }, icon(name)))

  function Whip() {
    const frame = useCurrentFrame()
    const p = progress(frame)
    const v = (progress(frame + 0.5) - progress(frame - 0.5)) * 1280        // px per frame
    const blur = Math.min(60, 0.3 * Math.abs(v))
    const x = p <= 0 || p >= 1 ? -PAD - Math.round(p * 1280) : -PAD - p * 1280
    return h(AbsoluteFill, { style: { overflow: 'hidden' } },
      blur >= 0.5 && directionalBlur(h, id, blur),
      h('div', { style: { position: 'absolute', inset: 0, filter: blur >= 0.5 ? `url(#${id})` : undefined } },
        h('div', { style: { position: 'absolute', top: 0, left: 0, display: 'flex', width: 2560 + 2 * PAD, height: 720, transform: `translateX(${x}px)` } },
          h('div', { style: { width: PAD, flex: 'none', background: 'var(--pm-color-surface)' } }),
          panel(from, 'var(--pm-color-surface)', 'var(--pm-color-accent-soft)'),
          panel(to, 'var(--pm-color-accent-soft)', 'var(--pm-color-surface)'),
          h('div', { style: { width: PAD, flex: 'none', background: 'var(--pm-color-accent-soft)' } }))))
  }
  return { component: Whip, fps: 30, width: 1280, height: 720 }
})
