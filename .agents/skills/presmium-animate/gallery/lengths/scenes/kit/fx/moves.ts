// Moves as pure functions of the film time (seconds): numbers in, numbers out, written into a transform, an SVG
// attribute or a canvas call by the scene. Three families: enter (something arrives), carry (the next beat grows out
// of this one, so a boundary is never a bare replacement) and contact (one thing causes another). Library-free and
// deterministic, so any frame can be sought. Lengths are in whatever unit the scene draws in.
import { clamp01, damped, ease, mix, wobble } from './time.ts'

type Curve = (p: number) => number
export interface Pt { x: number, y: number }
export interface Rect { x: number, y: number, w: number, h: number, r?: number }

/** Progress 0..1 between two absolute times. */
const seg = (t: number, t0: number, t1: number) => (t1 === t0 ? (t >= t1 ? 1 : 0) : clamp01((t - t0) / (t1 - t0)))
/** A decaying oscillation around 0 with decay rate `decay` (1/s) and angular frequency `omega` (rad/s). */
const ring = (tau: number, decay: number, omega: number) => wobble(tau, 1, omega / (2 * Math.PI), 1 / decay)

// ─────────────── enter ───────────────

/** A word lands: a spring rise with a little scale; opacity leads the spring so it never reads as a fade. */
export function wordRise(t: number, t0: number, { zeta = 0.6, omega = 22, dist = 26, s0 = 0.94, fade = 1.5 } = {}) {
  const k = damped(t - t0, zeta, omega)
  return { k, op: clamp01(k * fade), y: (1 - k) * dist, s: s0 + (1 - s0) * k }
}

/** Letter i of a wordmark drops in; its speed flattens and widens it on the landing, the spring restores it. */
export function letterDrop(t: number, t0: number, i: number, { stagger = 0.055, zeta = 0.5, omega = 26, dist = 46, squash = 0.0075, max = 0.22, widen = 0.6, fade = 1.6 } = {}) {
  const tau = t - t0 - i * stagger, h = 0.012
  const k = damped(tau, zeta, omega), dk = (k - damped(tau - h, zeta, omega)) / h
  const sq = Math.min(max, Math.abs(dk) * squash)
  return { k, op: clamp01(k * fade), y: (1 - k) * dist, sx: 1 + sq * widen, sy: 1 - sq }
}

/** A card springs up into place with a little scale. */
export function popIn(t: number, t0: number, { zeta = 0.62, omega = 18, rise = 36, s0 = 0.94, fade = 1.5 } = {}) {
  const k = damped(t - t0, zeta, omega)
  return { k, op: clamp01(k * fade), s: s0 + (1 - s0) * k, dy: (1 - k) * rise }
}

/** A card leaves: lifts, grows a touch and blurs away over `dur`, shorter than its entrance. */
export function liftOut(t: number, t1: number, { dur = 0.22, dir = -1, dist = 90, blur = 10, grow = 0.03 } = {}) {
  const k = ease.smoother(seg(t, t1, t1 + dur))
  return { k, op: 1 - k, dy: dir * k * dist, blur: k * blur, s: 1 + grow * k }
}

/** Line i rises into place from behind a clip; `y` is in units of `dist` (pass the line height). */
export function maskRise(t: number, t0: number, i = 0, { stagger = 0.13, zeta = 0.47, omega = 17, dist = 1 } = {}) {
  const k = damped(t - t0 - i * stagger, zeta, omega)
  return { k, y: (1 - k) * dist, visible: k > 0 }
}

// ─────────────── carry ───────────────

/** The thing pressed becomes the result: one rect (a card, a button) becomes another (the page, the window). */
export function morphRect(t: number, t0: number, t1: number, A: Rect, B: Rect, { curve = ease.outExpo as Curve, spring = null as null | { zeta?: number, omega?: number } } = {}) {
  const k = spring ? damped(t - t0, spring.zeta ?? 0.7, spring.omega ?? 16) : curve(seg(t, t0, t1))
  const x = mix(A.x, B.x, k), y = mix(A.y, B.y, k), w = mix(A.w, B.w, k), h = mix(A.h, B.h, k)
  return { k, x, y, w, h, r: mix(A.r ?? 0, B.r ?? 0, k), cx: x + w / 2, cy: y + h / 2 }
}

/** The subject opens its own world: a circle from (cx, cy) grows until it covers the W × H frame. */
export function iris(t: number, t0: number, t1: number, cx: number, cy: number, { W = 1920, H = 1080, curve = ease.outExpo as Curve, r0 = 0 } = {}) {
  const k = curve(seg(t, t0, t1))
  const far = Math.max(Math.hypot(cx, cy), Math.hypot(W - cx, cy), Math.hypot(cx, H - cy), Math.hypot(W - cx, H - cy)) + 2
  return { k, cx, cy, r: mix(r0, far, k), covered: k >= 1 }
}

/** One card among many is the next scene: a log-space push until `target` fills the frame; matrix is [a,b,c,d,e,f]. */
export function zoomThrough(t: number, t0: number, t1: number, target: Rect, { W = 1920, H = 1080, curve = ease.inOutExpo as Curve, fit = 'cover' as 'cover' | 'contain' } = {}) {
  const k = curve(seg(t, t0, t1))
  const sEnd = fit === 'contain' ? Math.min(W / target.w, H / target.h) : Math.max(W / target.w, H / target.h)
  const s = Math.exp(Math.log(sEnd) * k)
  const tcx = target.x + target.w / 2, tcy = target.y + target.h / 2
  const tx = mix(tcx, W / 2, k) - s * tcx, ty = mix(tcy, H / 2, k) - s * tcy
  return { k, s, tx, ty, matrix: [s, 0, 0, s, tx, ty] as Matrix }
}

/** The subject picks the next thing: an arc from one slot to the next; land it with `impact`. */
export function hop(t: number, t0: number, t1: number, from: Pt, to: Pt, { height = 200, curve = ease.smoother as Curve } = {}) {
  const k = curve(seg(t, t0, t1))
  return { k, x: mix(from.x, to.x, k), y: mix(from.y, to.y, k) - Math.sin(k * Math.PI) * height }
}

/** Many become one group: item i of n travels on an arc fanned by its index, staggered, into the cluster. */
export function gather(t: number, t0: number, t1: number, i: number, n: number, from: Pt, to: Pt, { stagger = 0.08, arc = 120, spin = 0.4, curve = ease.smoother as Curve } = {}) {
  const k = curve(seg(t, t0 + i * stagger, t1 + i * stagger)), o = i - (n - 1) / 2, bump = Math.sin(k * Math.PI)
  return { k, x: mix(from.x, to.x, k), y: mix(from.y, to.y, k) - bump * arc, rot: bump * o * spin }
}

/** Options change under the hand: an elastic rail; panel j sits at centre + (j − shift)·width + wobble, text lags. */
export function ribbon(t: number, switches: readonly number[], { dur = 0.35, amp = 55, decay = 7, omega = 22, tilt = 0.08, stretchX = 0.24, stretchY = 0.15, lag = 1.8, curve = ease.smoother as Curve } = {}) {
  let shift = 0, r = 0
  for (const ts of switches) { shift += curve(seg(t, ts, ts + dur)); r += ring(t - ts, decay, omega) }
  const st = Math.abs(r)
  return { shift, index: Math.round(shift), wobble: r * amp, rot: r * tilt, sx: 1 + st * stretchX, sy: 1 - st * stretchY, textDx: -r * amp * lag }
}

/** The cast becomes the brand mark: a disc grows and turns under the folding cast. */
export function seal(t: number, t0: number, t1: number, { r = 235, turns = 1, curve = ease.smoother as Curve } = {}) {
  const k = curve(seg(t, t0, t1))
  return { k, r: r * k, rot: k * turns * Math.PI * 2 }
}

/** A landing at cx splits a line: the glyph at x is pushed apart by its distance, bounces and rejoins. */
export function impactSplit(t: number, tHit: number, x: number, cx: number, { width = 600, spread = 65, bounce = 65, rot = 0.18, falloff = 3, open = [-0.01, 0.48], close = [0.63, 0.98], decay = 7, omega = 22, curve = ease.smoother as Curve } = {}) {
  const d = (x - cx) / width, r = ring(t - tHit, decay, omega)
  const apart = curve(seg(t, tHit + open[0]!, tHit + open[1]!)) * (1 - curve(seg(t, tHit + close[0]!, tHit + close[1]!)))
  return { dx: Math.sign(d) * apart * spread, dy: r * bounce * Math.exp(-d * d * falloff), rot: r * d * rot }
}

// ─────────────── contact ───────────────

/** Every landing: squash the lander on the hit and ring out; feed `r` into whatever it lands on. */
export function impact(t: number, tHit: number, { decay = 7, omega = 22, sqx = 0.13, sqy = 0.16 } = {}) {
  const r = ring(t - tHit, decay, omega)
  return { r, sx: 1 + r * sqx, sy: 1 - r * sqy }
}

/** A click at tc: the button dips and rings in scale; `active` is the short colour flash. */
export function press(t: number, tc: number, { depth = 0.16, decay = 10, omega = 30, flash = 0.4 } = {}) {
  const cl = t - tc, sq = cl > 0 ? ring(cl, decay, omega) * depth : 0
  return { s: 1 + sq, sq, down: cl > 0, active: cl > 0 && cl < flash }
}

/** Something fast: stretch along its velocity (units/s), thin across it; rotate by `ang`, then scale sx, sy. */
export function squash(vx: number, vy: number, { k = 0.0012, max = 0.45, kY = 0.0008, maxY = 0.3 } = {}) {
  const sp = Math.hypot(vx, vy)
  return { speed: sp, ang: Math.atan2(vy, vx), sx: 1 + Math.min(max, sp * k), sy: 1 - Math.min(maxY, sp * kY) }
}

/** An affine matrix [a, b, c, d, e, f], as SVG `matrix()`, CSS `matrix()` and canvas `setTransform` take it. */
export type Matrix = [number, number, number, number, number, number]
