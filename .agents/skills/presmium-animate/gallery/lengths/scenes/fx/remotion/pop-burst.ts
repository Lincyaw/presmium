import { remotionScene } from '@lincyaw/addon-motion/scene'
import { isDark } from '../../kit/fx/theme.ts'
import { CLAMP, labelEm } from '../../kit/remotion-fx.ts'

// Pop burst, with Remotion: a badge pops in and releases a burst once it has arrived. State `pop` (1 s).
// 0–0.33 s (f0–10): the badge grows on a spring (stiffness 170, damping 18, ζ 0.69) that passes its size by 5%
// and comes back once; 5% reads as polished, the 23% of the plain pop reads as a cartoon. One height drives the
// shadow: as the badge rises past its size it lifts, so its shadow grows, softens, fades and drops, and it
// tightens again as the badge settles. 0.15–0.5 s: the label fades in once the badge can hold it. 0.37–0.87 s
// (f11–26), one frame after the peak: twelve short strokes shoot out of the outline, each tail chasing its head
// (head ease-out, tail ease-in) until it zips shut, and one ring in the badge's shape spreads and thins: the
// arrival, then the release. 0.87–1 s: rest. The badge has a fixed size from the label's characters, so the
// burst is laid out before any font loads; strokes start on a stadium around it, at angles spread by its aspect
// and jittered by Remotion's seeded `random`. Everything is a function of the frame. Weight 600: no 700 ships.
const STROKES = 12
const GAP = 22                  // from the badge's outline to where the strokes start, px
const BURST = [11, 26]          // frames
const RING = [11, 25]

export default remotionScene(({ React, remotion, color, parameters }) => {
  const { AbsoluteFill, Easing, interpolate, random, spring, useCurrentFrame, useVideoConfig } = remotion
  const h = React.createElement
  const label = (parameters.label as string | undefined) ?? '新功能'
  const dark = isDark(color('bg'))
  const size = 72
  const W = Math.round(labelEm(label) * size + 2 * 64), H = Math.round(size * 1.2 + 2 * 28)
  const cx = 640, cy = 360
  const flat = Math.max(0, W / 2 - H / 2)   // half the straight part of the stadium

  // Where a ray from the centre leaves the stadium `r` px around the badge: on a straight side or on a cap.
  const exit = (dx: number, dy: number, r: number) => {
    if (Math.abs(dy) > 1e-6) {
      const t = r / Math.abs(dy)
      if (Math.abs(t * dx) <= flat) return t
    }
    const c = Math.sign(dx) * flat, b = dx * c
    return b + Math.sqrt(b * b - c * c + r * r)
  }
  const strokes = Array.from({ length: STROKES }, (_, i) => {
    const t = ((i + 0.5 + (random(`pop-burst:${i}`) - 0.5) * 0.35) / STROKES) * Math.PI * 2
    const ax = Math.cos(t) * (W / 2 + GAP), ay = Math.sin(t) * (H / 2 + GAP)
    const len = Math.hypot(ax, ay), dx = ax / len, dy = ay / len
    const r0 = exit(dx, dy, H / 2 + GAP)
    return { dx, dy, r0, length: i % 2 ? 64 : 96, width: i % 2 ? 6 : 8, color: i % 2 ? 'var(--pm-color-warn)' : 'var(--pm-color-accent)' }
  })
  const shadowAlpha = dark ? 2.2 : 1

  function Pop() {
    const frame = useCurrentFrame()
    const { fps } = useVideoConfig()
    // Within 0.1% of its size the badge is at rest: exactly 1, so the rest frames are still and sharp.
    const raw = spring({ frame, fps, config: { damping: 18, stiffness: 170 } })
    const s = Math.abs(1 - raw) < 0.001 ? 1 : raw
    // The badge's height above the page: 0.3 at its size, 1 at the top of the overshoot.
    const lift = interpolate(s, [0, 1, 1.05], [0, 0.3, 1], CLAMP)
    const shadow = `0 ${5 + 20 * lift}px ${10 + 41 * lift}px color-mix(in srgb, var(--pm-color-shadow) ${((0.22 - 0.1 * lift) * 100 * shadowAlpha * Math.min(1, s)).toFixed(1)}%, transparent)`
    const text = interpolate(frame, [fps * 0.15, fps * 0.5], [0, 1], CLAMP)

    const p = interpolate(frame, BURST, [0, 1], CLAMP)
    const head = Easing.out(Easing.cubic)(p), tail = Easing.in(Easing.cubic)(p)
    const q = interpolate(frame, RING, [0, 1], CLAMP)
    const grow = 6 + 130 * Easing.out(Easing.cubic)(q)
    return h(AbsoluteFill, { style: { overflow: 'hidden', fontFamily: 'var(--pm-font-sans)', lineHeight: 1.2 } },
      h('svg', { width: 1280, height: 720, viewBox: '0 0 1280 720', style: { position: 'absolute', inset: 0 } },
        q > 0 && q < 1 && h('rect', { x: cx - W / 2 - grow, y: cy - H / 2 - grow, width: W + 2 * grow, height: H + 2 * grow, rx: H / 2 + grow, fill: 'none', stroke: 'var(--pm-color-accent)', strokeWidth: 9 * (1 - q), opacity: 0.7 * (1 - q) }),
        p > 0 && p < 1 && strokes.map((k, i) => {
          const a = k.r0 + k.length * tail, b = k.r0 + k.length * head
          return h('line', { key: i, x1: cx + k.dx * a, y1: cy + k.dy * a, x2: cx + k.dx * b, y2: cy + k.dy * b, stroke: k.color, strokeWidth: k.width, strokeLinecap: 'round' })
        })),
      h('div', { style: { position: 'absolute', left: cx - W / 2, top: cy - H / 2, width: W, height: H, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: H / 2, background: 'linear-gradient(180deg, color-mix(in srgb, var(--pm-color-sheen) 14%, transparent), transparent 55%), var(--pm-color-accent)', color: 'var(--pm-color-on-accent)', fontSize: size, fontWeight: 600, whiteSpace: 'nowrap', boxShadow: shadow, transform: `translateY(${-8 * lift}px) scale(${s})` } },
        h('span', { style: { opacity: text, transform: `translateY(${(1 - text) * 10}px)` } }, label)))
  }
  return { component: Pop, fps: 30, width: 1280, height: 720 }
})
