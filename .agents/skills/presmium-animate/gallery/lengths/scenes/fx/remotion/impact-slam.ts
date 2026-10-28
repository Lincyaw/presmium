import { remotionScene } from '@lincyaw/addon-motion/scene'
import { isDark } from '../../kit/fx/theme.ts'
import { CLAMP, trail } from '../../kit/remotion-fx.ts'

// Impact slam, with Remotion: a big claim smashes down from in front of the camera and the frame shakes.
// State `slam` (1 s). 0–0.17 s (f0–5): the text falls from 3.2× to its size on an ease-in, speeding up into the
// hit with no anticipation and no spring (a slam does not bounce), fading in over the first two frames; six
// fainter copies at earlier fractional frames, 0.4 frames apart, are its motion blur. f5: the hit, a hard stop,
// sharp. 0.17–0.5 s (f5–16): the camera shakes, 14 px decaying by e every 3 frames at 10 Hz, a closed form of the
// frame with seeded phases, so any frame can be shown; a glow flares behind the text on the hit frame and fades,
// a shockwave ring spreads from it and thins, and short wedges shoot out, each pointed tail chasing its round
// head. 0.55–1 s: rest, to read the claim. The trail draws the text seven times, so the slammed element stays one
// line. Weight 600 made heavier with a text stroke in its own colour (Plex Sans ships no 700); a trailing symbol
// (×, %, +) takes the accent. One slam per piece: overshoot and shake mean "new".
const HIT = 5          // the frame of the impact
const STREAKS = 14

export default remotionScene(({ React, remotion, color, parameters }) => {
  const { AbsoluteFill, Easing, interpolate, random, useCurrentFrame } = remotion
  const h = React.createElement
  const text = (parameters.text as string | undefined) ?? '10×'
  const dark = isDark(color('bg'))
  const cx = 640, cy = 360
  const phx = random('impact-slam:x') * Math.PI * 2, phy = random('impact-slam:y') * Math.PI * 2
  const streaks = Array.from({ length: STREAKS }, (_, i) => {
    const r = (k: string) => random(`impact-slam:${k}${i}`)
    const t = ((i + (r('a') - 0.5) * 0.9) / STREAKS) * Math.PI * 2
    const dx = Math.cos(t), dy = Math.sin(t)
    // Start near an ellipse around the text, wider than tall like the text.
    const r0 = (0.9 + 0.25 * r('r')) / Math.hypot(dx / 310, dy / 150)
    return { dx, dy, r0, length: 120 + 200 * r('l'), width: 5 + 7 * r('w'), delay: Math.floor(r('d') * 3), tone: i % 3 === 2 ? 'var(--pm-color-ink)' : 'var(--pm-color-accent)' }
  })
  // A trailing symbol (×, %, +) takes the accent: the number is the claim, the symbol its kind.
  const chars = [...text]
  let accentFrom = chars.length
  while (accentFrom > 0 && !/[\p{L}\p{N}.,]/u.test(chars[accentFrom - 1]!)) accentFrom--

  const scale = (f: number) => interpolate(f, [0, HIT], [3.2, 1], { ...CLAMP, easing: Easing.in(Easing.quad) })
  const word = (f: number) => h('div', { style: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: interpolate(f, [0, 2], [0, 1], CLAMP) } },
    h('div', { style: { transform: `scale(${scale(f)})`, fontSize: 250, fontWeight: 600, letterSpacing: '-0.03em', whiteSpace: 'nowrap', color: 'var(--pm-color-ink)', WebkitTextStroke: '6px currentColor', paddingRight: '0.03em' } },
      chars.map((ch, i) => h('span', { key: i, style: i >= accentFrom ? { color: 'var(--pm-color-accent)' } : undefined }, ch))))

  function Slam() {
    const frame = useCurrentFrame()
    const k = frame - HIT
    const decay = k >= 0 && k <= 11 ? 14 * Math.exp(-k / 3) : 0
    const x = decay * Math.sin((2 * Math.PI * k) / 3 + phx), y = decay * Math.sin((2 * Math.PI * k) / 3 + phy)
    const ring = (from: number, to: number, r0: number, r1: number, w: number, alpha: number) => {
      const q = interpolate(frame, [from, to], [0, 1], CLAMP)
      if (q <= 0 || q >= 1) return null
      return h('circle', { cx, cy, r: r0 + (r1 - r0) * Easing.out(Easing.cubic)(q), fill: 'none', stroke: 'var(--pm-color-accent)', strokeWidth: w * (1 - q), opacity: alpha * (1 - q) })
    }
    const glow = interpolate(frame, [HIT - 1, HIT, HIT + 9], [0, 1, 0], CLAMP)
    return h(AbsoluteFill, { style: { overflow: 'hidden', fontFamily: 'var(--pm-font-sans)', lineHeight: 1 } },
      h('div', { style: { position: 'absolute', inset: 0, transform: x || y ? `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)` : undefined } },
        glow > 0 && h('div', { style: { position: 'absolute', left: cx - 460, top: cy - 260, width: 920, height: 520, borderRadius: '50%', background: `radial-gradient(closest-side, color-mix(in srgb, var(--pm-color-accent) ${dark ? 34 : 24}%, transparent), transparent)`, opacity: glow } }),
        h('svg', { width: 1280, height: 720, viewBox: '0 0 1280 720', style: { position: 'absolute', inset: 0 } },
          ring(HIT - 1, HIT + 12, 150, 580, 18, 0.75),
          streaks.map((s, i) => {
            const p = interpolate(frame, [HIT - 1 + s.delay, HIT + s.delay + 8], [0, 1], CLAMP)
            if (p <= 0 || p >= 1) return null
            // A wedge from a pointed tail to a round head, the head ahead (ease-out), the tail catching up (ease-in).
            const a = s.r0 + s.length * Easing.in(Easing.cubic)(p), b = s.r0 + s.length * Easing.out(Easing.cubic)(p)
            const w = (s.width * (1 - 0.5 * p)) / 2, nx = -s.dy * w, ny = s.dx * w
            const hx = cx + s.dx * b, hy = cy + s.dy * b
            const d = `M ${(cx + s.dx * a).toFixed(1)} ${(cy + s.dy * a).toFixed(1)} L ${(hx + nx).toFixed(1)} ${(hy + ny).toFixed(1)} A ${w.toFixed(2)} ${w.toFixed(2)} 0 0 0 ${(hx - nx).toFixed(1)} ${(hy - ny).toFixed(1)} Z`
            return h('path', { key: i, d, fill: s.tone })
          })),
        trail(h, frame, word, { layers: 6, lag: 0.4, opacity: 0.35, moving: f => frame < HIT && f > 0 })))
  }
  return { component: Slam, fps: 30, width: 1280, height: 720 }
})
