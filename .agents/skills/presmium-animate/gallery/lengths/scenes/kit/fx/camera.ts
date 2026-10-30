// A camera over one world, as pure functions of the film time (seconds). Author the world in W × H units (zoom 1
// shows exactly that), key where the camera looks, and draw each layer under `view(cam, { depth })`. The operator's
// feel is three layers on top of the keys: a `float` that is zero in the holds, `shake` (time.ts) on the landings,
// and a far `lattice` for the move to slide against.
import { clamp01, ease, mix } from './time.ts'
import type { Matrix, Rect } from './moves.ts'

type Curve = (p: number) => number
export interface Cam { x: number, y: number, zoom: number, rot: number }
/** A camera key: at time `t` the world point (x, y) is at the frame centre; `curve` eases the leg that ends here. */
export interface CamKey { t: number, x?: number, y?: number, zoom?: number, rot?: number, curve?: Curve }
interface Frame { W?: number, H?: number }

/** Every move of the camera: keyed position, zoom in log space (reads as one speed) and a curve per leg. */
export function camera(t: number, keys: readonly CamKey[], { curve = ease.inOut3 as Curve, W = 1920, H = 1080 } = {}): Cam {
  const pick = (k: CamKey): Cam => ({ x: k.x ?? W / 2, y: k.y ?? H / 2, zoom: k.zoom ?? 1, rot: k.rot ?? 0 })
  if (!keys.length) return { x: W / 2, y: H / 2, zoom: 1, rot: 0 }
  if (t <= keys[0]!.t) return pick(keys[0]!)
  const n = keys.length
  if (t >= keys[n - 1]!.t) return pick(keys[n - 1]!)
  let i = 0
  while (keys[i + 1]!.t < t) i++
  const A = pick(keys[i]!), B = pick(keys[i + 1]!), k = (keys[i + 1]!.curve ?? curve)(clamp01((t - keys[i]!.t) / (keys[i + 1]!.t - keys[i]!.t)))
  return { x: mix(A.x, B.x, k), y: mix(A.y, B.y, k), zoom: Math.exp(mix(Math.log(A.zoom), Math.log(B.zoom), k)), rot: mix(A.rot, B.rot, k) }
}

/** The matrix for a layer at `depth` seen through `cam`: 0 is the focus plane, + farther (moves less), − nearer. */
export function view(cam: Cam, { W = 1920, H = 1080, depth = 0 }: Frame & { depth?: number } = {}): Matrix {
  const f = 1 / (1 + Math.max(-0.9, depth))
  const cx = W / 2 + (cam.x - W / 2) * f, cy = H / 2 + (cam.y - H / 2) * f
  const z = Math.exp(Math.log(cam.zoom) * f), c = Math.cos(cam.rot * f) * z, s = Math.sin(cam.rot * f) * z
  return [c, s, -s, c, W / 2 - (c * cx - s * cy), H / 2 - (s * cx + c * cy)]
}

/** Two matrices composed: `mul(A, B)` applies B first, then A (a nested level drawn in its own units under a view). */
export function mul(A: Matrix, B: Matrix): Matrix {
  return [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3], A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]]
}

/** A matrix as SVG/CSS `matrix(...)` text. */
export const matrixCss = (M: Matrix) => `matrix(${M.map(v => +v.toFixed(5)).join(' ')})`

/** World → screen through a `view()` matrix: where something is on screen (to aim a pointer, to anchor a label). */
export const project = (M: Matrix, x: number, y: number): [number, number] => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]]

/** Screen → world through a `view()` matrix: which world point sits under a screen point. */
export function unproject(M: Matrix, x: number, y: number): [number, number] {
  const d = M[0] * M[3] - M[1] * M[2], u = x - M[4], v = y - M[5]
  return [(M[3] * u - M[2] * v) / d, (M[0] * v - M[1] * u) / d]
}

/** A world box's bounds on screen: to check that the subject stays in frame. */
export function projectBox(M: Matrix, b: Rect): Rect {
  const P = [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]].map(p => project(M, p[0]!, p[1]!))
  const xs = P.map(p => p[0]), ys = P.map(p => p[1]), x0 = Math.min(...xs), y0 = Math.min(...ys)
  return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 }
}

/** A whip pan: all of `dist` in `dur` on an expo in-out; `k` is progress, `speed` (0..1 peak) drives the smear. */
export function whip(t: number, t0: number, dur: number, dist: number, { curve = ease.inOutExpo as Curve } = {}) {
  const p = clamp01((t - t0) / dur), h = 1e-3
  const k = curve(p), v = (curve(Math.min(1, p + h)) - curve(Math.max(0, p - h))) / (2 * h)
  return { k, d: dist * k, speed: p > 0 && p < 1 ? Math.min(1, v / 5) : 0 }
}

/** The operator's hand: a slow two-sine float in world units at zoom 1, scaled by `env` (0 in the holds). */
export function float(t: number, amp: number, env: number, zoom = 1): [number, number] {
  const e = (amp * env) / zoom
  return [e * (Math.sin(1.7 * t) + 0.6 * Math.sin(2.9 * t + 1)), e * (Math.sin(1.3 * t + 2) + 0.5 * Math.sin(3.3 * t))]
}

/**
 * A far grid seen through `cam`, for a move on an empty ground to slide against: draw a dot of radius `r` at every
 * `spacing` from (x0, y0) to (x1, y1) under `matrix` (or one SVG pattern with patternTransform = matrix); the dots
 * stay `px` on screen at any zoom.
 */
export function lattice(cam: Cam, { depth = 1.2, spacing = 48, px = 1.4, W = 1920, H = 1080 } = {}) {
  const M = view(cam, { W, H, depth })
  const c = [[0, 0], [W, 0], [0, H], [W, H]].map(p => unproject(M, p[0]!, p[1]!))
  const xs = c.map(p => p[0]), ys = c.map(p => p[1])
  return {
    matrix: M, spacing, r: px / Math.hypot(M[0], M[1]),
    x0: Math.floor(Math.min(...xs) / spacing) * spacing, x1: Math.max(...xs),
    y0: Math.floor(Math.min(...ys) / spacing) * spacing, y1: Math.max(...ys),
  }
}

/**
 * Past about 20× zoom, key the screen, not the world: `screen` says where the anchor A sits on screen and the zoom
 * (key it with `camera()` on screen positions), and this recovers the camera. Add shakes to `screen` before calling.
 */
export function anchored(A: { x: number, y: number }, screen: { x: number, y: number, zoom: number, rot?: number }, { W = 1920, H = 1080 }: Frame = {}): Cam {
  return { x: A.x + (W / 2 - screen.x) / screen.zoom, y: A.y + (H / 2 - screen.y) / screen.zoom, zoom: screen.zoom, rot: screen.rot ?? 0 }
}
