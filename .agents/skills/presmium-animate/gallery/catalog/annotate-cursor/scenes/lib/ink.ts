// Hand-drawn ink in stage coordinates, shared by the annotation scenes of this batch. Everything an author aims is
// a box in stage percentages (x, y = top left, w, h; 0–100 of the stage's width and height), so the same numbers
// place a mark on a formula, a line of code or a part of a figure whatever the stage's size. The ink is drawn in an
// SVG whose viewBox is 1600 × 900 (1 % of the width = 16 units, 1 % of the height = 9), laid exactly over the 16:9
// stage. A mark is one or more strokes (functions u ∈ [0, 1] → point); `ink()` samples them at even steps of pen
// time, makes the line thick where the pen is slow and thin where it is fast, and returns the outline drawn up to
// any fraction of the mark, plus where the nib is then. Pure functions of their inputs: seek-safe.
import { hash, mulberry32, range } from '../../../../lengths/scenes/kit/fx/random.ts'
import { clamp01 } from '../../../../lengths/scenes/kit/fx/time.ts'

export type Pt = [number, number]
export type Stroke = (u: number) => Pt
/** A region of the stage in percent: left, top, width, height. */
export interface Box { x: number, y: number, w: number, h: number }

export const VW = 1600
export const VH = 900
/** Stage percent to viewBox units. */
export const vx = (x: number) => x * 16
export const vy = (y: number) => y * 9
export const vp = (p: Pt): Pt => [vx(p[0]), vy(p[1])]

const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
/** A box parameter, with its fallback for each missing number. */
export function readBox(v: unknown, d: Box): Box {
  const o = (v ?? {}) as Record<string, unknown>
  return { x: num(o.x, d.x), y: num(o.y, d.y), w: num(o.w, d.w), h: num(o.h, d.h) }
}
export const center = (b: Box): Pt => [b.x + b.w / 2, b.y + b.h / 2]
export const pad = (b: Box, px: number, py = px): Box => ({ x: b.x - px, y: b.y - py, w: b.w + 2 * px, h: b.h + 2 * py })

const smooth = (x: number) => x * x * (3 - 2 * x)
const lerp = (a: Pt, b: Pt, u: number): Pt => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]

// ---- Mark shapes. Each takes boxes in percent and returns strokes in viewBox units. ----

/** A loose loop around the box: starts upper left, runs a little past its start and wider on the way out. */
export function loop(b: Box, seed = 1): Stroke[] {
  const [cx, cy] = vp(center(b))
  const rx = vx(b.w) * 0.54 + 16, ry = vy(b.h) * 0.6 + 14
  const tilt = (range(mulberry32(seed), -6, -2) * Math.PI) / 180
  const ph = hash(seed, 3) * 6
  return [u => {
    const a = -2.55 + (Math.PI * 2 + 0.55) * u
    const r = (1 + 0.035 * Math.sin(3 * a + ph)) * (1 + 0.08 * u)
    const ex = Math.cos(a) * rx * r, ey = Math.sin(a) * ry * r
    return [cx + ex * Math.cos(tilt) - ey * Math.sin(tilt), cy + ex * Math.sin(tilt) + ey * Math.cos(tilt)]
  }]
}

/** A swiped underline just below the box, flicking up at the end as a hand pulls a marker. */
export function underline(b: Box, seed = 1): Stroke[] {
  const y = vy(b.y + b.h) + 10, x0 = vx(b.x) - vx(b.w) * 0.03, span = vx(b.w) * 1.06
  const ph = hash(seed, 5) * 2
  return [u => [x0 + span * u, y + 5 * Math.sin(u * Math.PI * 1.3 + ph) - 14 * u * u * u]]
}

/** A highlighter band through the middle of the box (draw it under the text, wide and translucent). */
export function band(b: Box, seed = 1): Stroke[] {
  const y = vy(b.y + b.h * 0.55), x0 = vx(b.x) - 8, span = vx(b.w) + 16
  const ph = hash(seed, 7) * 3
  return [u => [x0 + span * u, y + 3 * Math.sin(u * 5 + ph) - 6 * u]]
}

/** A strike through the middle, rising slightly: "this is wrong" or "replaced". */
export function strike(b: Box): Stroke[] {
  const y = vy(b.y + b.h * 0.52), x0 = vx(b.x) - 10, span = vx(b.w) + 20
  return [u => [x0 + span * u, y + 8 - 16 * u + 3 * Math.sin(u * 7)]]
}

/** A wobbled rounded box drawn around the region in one stroke, overrunning its start corner a little. */
export function frameBox(b: Box, seed = 1): Stroke[] {
  const x = vx(b.x) - 14, y = vy(b.y) - 12, w = vx(b.w) + 28, h = vy(b.h) + 24
  const r = Math.min(w, h) * 0.18
  const pts: Pt[] = []
  // A rounded rectangle traced clockwise from the top left, sampled densely, plus 6 % of it again.
  const corner = (cx: number, cy: number, a0: number) => { for (let i = 0; i <= 6; i++) { const a = a0 + (i / 6) * (Math.PI / 2); pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]) } }
  corner(x + r, y + r, Math.PI); corner(x + w - r, y + r, -Math.PI / 2); corner(x + w - r, y + h - r, 0); corner(x + r, y + h - r, Math.PI / 2)
  const rng = mulberry32(seed)
  const jit = pts.map(([px, py]): Pt => [px + range(rng, -4, 4), py + range(rng, -3, 3)])
  const path = polyline([...jit, jit[0]!, ...jit.slice(1, 4)])
  return [u => path(u * 0.97)]
}

/** A square bracket to the left of the box: "this block". */
export function bracket(b: Box): Stroke[] {
  const x = vx(b.x) - 18, y0 = vy(b.y) - 6, y1 = vy(b.y + b.h) + 6
  return [polyline([[x + 22, y0 + 2], [x, y0], [x - 2, (y0 + y1) / 2], [x, y1], [x + 22, y1 - 2]])]
}

/** A check mark in a box: a short stroke down, then a long one up. */
export function check(b: Box): Stroke[] {
  const x = vx(b.x), y = vy(b.y), w = vx(b.w), h = vy(b.h)
  return [polyline([[x + w * 0.12, y + h * 0.52], [x + w * 0.4, y + h * 0.82], [x + w * 0.95, y + h * 0.08]])]
}

/** A curved line from `a` to `b` (percent), bowed sideways by `bend` × its length. */
export function curve(a: Pt, b: Pt, bend = 0.18): Stroke {
  const [ax, ay] = vp(a), [bx, by] = vp(b)
  const mx = (ax + bx) / 2, my = (ay + by) / 2, dx = bx - ax, dy = by - ay
  const c: Pt = [mx - dy * bend, my + dx * bend]
  return u => { const v = 1 - u; return [v * v * ax + 2 * v * u * c[0] + u * u * bx, v * v * ay + 2 * v * u * c[1] + u * u * by] }
}

/** An arrow from `from` to `to` (percent): a curved shaft, then the head as one V that slows into its point. */
export function arrow(from: Pt, to: Pt, bend = 0.18, head = 30): Stroke[] {
  const shaft = curve(from, to, bend)
  const tip = shaft(1), back = shaft(0.9)
  const ang = Math.atan2(back[1] - tip[1], back[0] - tip[0])
  const barb = (s: number): Pt => [tip[0] + Math.cos(ang + s) * head, tip[1] + Math.sin(ang + s) * head]
  return [shaft, u => (u < 0.5 ? lerp(barb(0.5), tip, smooth(u * 2)) : lerp(tip, barb(-0.5), smooth(u * 2 - 1)))]
}

/** Where a ray from the box's centre towards `p` leaves the box grown by `gap` (percent): an arrow's landing point. */
export function edgeToward(b: Box, p: Pt, gap = 1.5): Pt {
  const [cx, cy] = center(b), dx = p[0] - cx, dy = p[1] - cy
  const hw = b.w / 2 + gap, hh = b.h / 2 + gap * 1.6
  const k = Math.min(Math.abs(hw / (dx || 1e-9)), Math.abs(hh / (dy || 1e-9)))
  return [cx + dx * k, cy + dy * k]
}

/** Where a ray from the centre of an ellipse fitted around the box towards `p` meets it (percent). */
export function ellipseToward(b: Box, p: Pt, grow = 1.25): Pt {
  const [cx, cy] = center(b), a = Math.atan2((p[1] - cy) * 16 / 9, p[0] - cx)
  return [cx + Math.cos(a) * (b.w / 2) * grow + Math.cos(a) * 1.6, cy + Math.sin(a) * (b.h / 2) * grow + Math.sin(a) * 2.2]
}

/** A stroke through points (viewBox units) at constant speed along its length. */
export function polyline(points: readonly Pt[]): Stroke {
  const acc = [0]
  for (let i = 1; i < points.length; i++) acc.push(acc[i - 1]! + Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]))
  const total = acc[acc.length - 1]! || 1
  return u => {
    const d = clamp01(u) * total
    let i = 1
    while (i < acc.length - 1 && acc[i]! < d) i++
    const seg = acc[i]! - acc[i - 1]! || 1
    return lerp(points[i - 1]!, points[i]!, (d - acc[i - 1]!) / seg)
  }
}

// ---- The ink itself. ----

interface Sample { x: number, y: number, nx: number, ny: number, w: number }
export interface Ink {
  /** The outline (fill it) of the mark drawn up to fraction f of its pen time. */
  d(f: number): string
  /** The nib at fraction f: where it is, and whether it touches the page (false while it hops between strokes). */
  nib(f: number): { p: Pt, down: boolean }
  /** The point where the first stroke starts and where the last ends (viewBox units). */
  start: Pt
  end: Pt
}

export interface InkOptions {
  /** Line width in viewBox units when fastest and slowest; equal values give a flat highlighter. */
  width?: [number, number]
  /** Share of the pen time spent lifting between two strokes. */
  hop?: number
  /** The pen's speed along each stroke (default: slow in and out, like sine.inOut). */
  ease?: (u: number) => number
}

const STEPS = 140
const sineInOut = (u: number) => -(Math.cos(Math.PI * u) - 1) / 2

export function ink(strokes: readonly Stroke[], { width = [5, 11], hop = 0.14, ease = sineInOut }: InkOptions = {}): Ink {
  const flat = width[0] === width[1]
  const lens = strokes.map(fn => { let s = 0, prev = fn(0); for (let i = 1; i <= 100; i++) { const p = fn(i / 100); s += Math.hypot(p[0] - prev[0], p[1] - prev[1]); prev = p } return s })
  const total = lens.reduce((a, b) => a + b, 0) || 1
  const sampled = strokes.map(fn => {
    const pts: Sample[] = []
    for (let k = 0; k <= STEPS; k++) {
      const u = ease(k / STEPS), p = fn(u), a = fn(Math.max(0, u - 1e-4)), b = fn(Math.min(1, u + 1e-4))
      const t = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
      pts.push({ x: p[0], y: p[1], nx: -(b[1] - a[1]) / t, ny: (b[0] - a[0]) / t, w: 0 })
    }
    return pts
  })
  const speeds = sampled.map(pts => pts.map((_, k) => { const a = pts[Math.max(0, k - 1)]!, b = pts[Math.min(STEPS, k + 1)]!; return Math.hypot(b.x - a.x, b.y - a.y) }))
  const top = Math.max(1e-6, ...speeds.flat())
  sampled.forEach((pts, i) => pts.forEach((p, k) => {
    const lift = flat ? 1 : 1 - 0.55 * smooth(clamp01((k / STEPS - 0.8) / 0.2))
    p.w = flat ? width[0] : (width[0] + (width[1] - width[0]) * (1 - speeds[i]![k]! / top)) * lift
  }))
  const n = strokes.length, hops = n > 1 ? hop : 0
  const windows: Array<[number, number]> = []
  let t = 0
  lens.forEach((len, i) => { const span = (1 - hops) * (len / total); windows.push([t, t + span]); t += span + (i < n - 1 ? hops / (n - 1) : 0) })

  const upTo = (pts: Sample[], g: number): Sample[] => {
    const x = clamp01(g) * STEPS, k = Math.floor(x), out = pts.slice(0, k + 1)
    if (k < STEPS && x > k) {
      const a = pts[k]!, b = pts[k + 1]!, m = x - k
      out.push({ x: a.x + (b.x - a.x) * m, y: a.y + (b.y - a.y) * m, nx: a.nx + (b.nx - a.nx) * m, ny: a.ny + (b.ny - a.ny) * m, w: a.w + (b.w - a.w) * m })
    }
    return out
  }
  const side = (p: Sample, s: number) => `${(p.x + p.nx * p.w * 0.5 * s).toFixed(1)} ${(p.y + p.ny * p.w * 0.5 * s).toFixed(1)}`
  const outline = (pts: Sample[]) => {
    if (pts.length < 2) return ''
    const last = pts[pts.length - 1]!, first = pts[0]!
    let d = `M${side(first, 1)}`
    for (let i = 1; i < pts.length; i++) d += `L${side(pts[i]!, 1)}`
    d += `A${(last.w / 2).toFixed(2)} ${(last.w / 2).toFixed(2)} 0 0 0 ${side(last, -1)}`
    for (let i = pts.length - 2; i >= 0; i--) d += `L${side(pts[i]!, -1)}`
    return `${d}A${(first.w / 2).toFixed(2)} ${(first.w / 2).toFixed(2)} 0 0 0 ${side(first, 1)}Z`
  }
  const local = (f: number, i: number) => { const [a, b] = windows[i]!; return (f - a) / (b - a || 1) }
  const at = (i: number, g: number): Pt => { const p = upTo(sampled[i]!, g); const q = p[p.length - 1]!; return [q.x, q.y] }
  const start: Pt = [sampled[0]![0]!.x, sampled[0]![0]!.y]
  const lastPts = sampled[n - 1]!
  const end: Pt = [lastPts[STEPS]!.x, lastPts[STEPS]!.y]
  return {
    d: f => (f <= 0 ? '' : sampled.map((pts, i) => outline(upTo(pts, local(f, i)))).join('')),
    nib: f => {
      for (let i = 0; i < n; i++) {
        const [a, b] = windows[i]!
        if (f <= b) {
          if (f >= a) return { p: at(i, local(f, i)), down: f > 0 && f < 1 }
          return { p: lerp(at(i - 1, 1), at(i, 0), smooth((f - windows[i - 1]![1]) / (a - windows[i - 1]![1] || 1))), down: false }
        }
      }
      return { p: end, down: false }
    },
    start,
    end,
  }
}

/** A mark by name, for the `shape` parameter. */
export type Shape = 'loop' | 'underline' | 'highlight' | 'strike' | 'box' | 'bracket' | 'arrow'
export const SHAPES: Shape[] = ['loop', 'underline', 'highlight', 'strike', 'box', 'bracket', 'arrow']

/** The strokes and line widths of a named mark around box `b`; an arrow comes from `from` (percent). */
export function mark(shape: Shape, b: Box, seed: number, from?: Pt): { strokes: Stroke[], width: [number, number], under: boolean } {
  switch (shape) {
    case 'underline': return { strokes: underline(b, seed), width: [5, 12], under: false }
    case 'highlight': return { strokes: band(b, seed), width: [vy(b.h) * 0.8, vy(b.h) * 0.8], under: true }
    case 'strike': return { strokes: strike(b), width: [5, 10], under: false }
    case 'box': return { strokes: frameBox(b, seed), width: [4, 10], under: false }
    case 'bracket': return { strokes: bracket(b), width: [5, 11], under: false }
    case 'arrow': {
      const tail = from ?? [b.x - 12, b.y + b.h + 20]
      return { strokes: arrow(tail, edgeToward(b, tail)), width: [5, 12], under: false }
    }
    default: return { strokes: loop(b, seed), width: [4, 11], under: false }
  }
}

/** A finished mark breathes: it is re-posed every 1/8 s (the "boil" of hand animation), a fraction of a percent. */
export function boil(t: number, seed: number, cx: number, cy: number, amp = 1): string {
  const q = Math.floor(t * 8)
  const dx = (hash(seed, q, 1) - 0.5) * 3 * amp, dy = (hash(seed, q, 2) - 0.5) * 3 * amp, r = (hash(seed, q, 3) - 0.5) * 0.3 * amp
  return `translate(${dx.toFixed(2)} ${dy.toFixed(2)}) rotate(${r.toFixed(3)} ${cx.toFixed(1)} ${cy.toFixed(1)})`
}
