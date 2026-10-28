import { animeScene } from '@lincyaw/addon-motion/scene'
import { frame } from '../../kit/frame.ts'
import { POINTER, POINTER_CSS } from '../../kit/atoms.ts'
import { mix } from '../../kit/anime-fx.ts'

// Shockwave lens, with an Anime.js grid stagger from an arbitrary point (one state, `tap`). 0–0.2 s: the pointer
// glides onto a 24 × 14 field of dots and presses, a ring spreading from its tip: the cause comes first.
// 0.2–0.65 s: a ring-shaped wave runs out from the tap to the corners; each dot it reaches is pushed radially away
// from the tap, grows and takes the accent, so the field reads as struck rather than merely pulsing. Behind the ring
// the dots spring back on an elastic until about 0.85 s. 0.85–1 s: the field is still again. The delay is
// `stagger(27, { grid: [24, 14], from: [fx, fy] })`, a pure function of the index: `from` takes fractions of the
// grid's extent and needs the explicit `grid` array (`grid: true` would measure the layout). Growth and tint last
// 290 ms per dot, so the wavefront stays a ring and not a growing disc; the push lasts longer (430 ms) and carries
// the elastic. The push, the growth and the tint fall off with the distance from the tap and are computed at build
// in user units of the viewBox. Parameters: `tap` ([fx, fy], fractions of the field, default the centre), `tone`
// (the wavefront's colour token, default `accent`).
const COLS = 24, ROWS = 14, GAP = 46, DOT = 5.5
const DELAY = 27, PUSH = 90, BACK = 340, FADE = 200

export default animeScene(({ root, anime, color, parameters }) => {
  const [fx, fy] = (parameters.tap as [number, number] | undefined) ?? [0.5, 0.5]
  const rest = color('line-strong'), hot = color((parameters.tone as string | undefined) ?? 'accent')
  const x0 = 640 - ((COLS - 1) / 2) * GAP, y0 = 360 - ((ROWS - 1) / 2) * GAP
  // The tap in grid cells and in the frame, and each dot's push away from it (unit vector × falloff).
  const tx = fx * (COLS - 1), ty = fy * (ROWS - 1)
  const tapX = x0 + tx * GAP, tapY = y0 + ty * GAP
  const dots = Array.from({ length: COLS * ROWS }, (_, i) => {
    const gx = i % COLS, gy = Math.floor(i / COLS)
    const vx = gx - tx, vy = gy - ty, d = Math.hypot(vx, vy) || 1
    const push = GAP * 1.1 / (1 + d / 2.2), near = 1 / (1 + d / 7)
    return { x: x0 + gx * GAP, y: y0 + gy * GAP, dx: (vx / d) * push, dy: (vy / d) * push, scale: 1 + 0.95 * near, tint: mix(rest, hot, 0.35 + 0.65 * near) }
  })
  frame(root, `${POINTER_CSS}
    .sw__dot { transform-box: fill-box; transform-origin: center; }
    .sw .lf-pointer__ring { opacity: 0; }
  `, `<div class="sw"><svg viewBox="0 0 1280 720" width="100%" height="100%" style="position: absolute; inset: 0">
    ${dots.map(p => `<circle class="sw__dot" cx="${p.x}" cy="${p.y}" r="${DOT}" fill="${rest}" />`).join('')}
  </svg><div class="lf-pointer-layer">${POINTER}</div></div>`)
  const tl = anime.createTimeline({ autoplay: false })
  // the cause: the pointer arrives at the tap and presses; a ring spreads from its tip.
  const px = (tapX / 1280) * 100, py = (tapY / 720) * 100
  tl.add('.lf-pointer-layer', { translateX: [`${px + 7}%`, `${px}%`], translateY: [`${py + 11}%`, `${py}%`], duration: 150, ease: 'outCubic' }, 0)
  tl.add('.lf-pointer', { scale: [{ from: 1, to: 0.82, duration: 60, ease: 'outQuad' }, { to: 1, duration: 200, ease: 'outQuad' }] }, 140)
  tl.add('.lf-pointer__ring', { scale: [0.2, 1.5], opacity: [{ from: 0, to: 0.7, duration: 1 }, { to: 0, duration: 420, ease: 'outQuad' }], duration: 420, ease: 'outCubic' }, 190)
  // the wave: pushed out and enlarged on the wavefront, then back on an elastic.
  // Keyframe values are functions of the dot's index, so one tween drives all 336 dots.
  const dot = (i: number) => dots[i]!
  tl.add('.sw__dot', {
    translateX: [{ from: 0, to: (_: unknown, i = 0) => dot(i).dx, duration: PUSH, ease: 'outQuad' }, { to: 0, duration: BACK, ease: 'outElastic(1, .5)' }],
    translateY: [{ from: 0, to: (_: unknown, i = 0) => dot(i).dy, duration: PUSH, ease: 'outQuad' }, { to: 0, duration: BACK, ease: 'outElastic(1, .5)' }],
    scale: [{ from: 1, to: (_: unknown, i = 0) => dot(i).scale, duration: PUSH, ease: 'outQuad' }, { to: 1, duration: FADE, ease: 'outQuad' }],
    fill: [{ from: rest, to: (_: unknown, i = 0) => dot(i).tint, duration: PUSH, ease: 'outQuad' }, { to: rest, duration: FADE, ease: 'outQuad' }],
    delay: anime.stagger(DELAY, { grid: [COLS, ROWS], from: [fx, fy] }),
  }, 200)
  return tl
})
