// Draws the mascot, a black Bombay kitten in silhouette, from a pose. A pose places round-ended limbs (a curve
// through points whose radius changes along it), a body of the same kind, a round head with small round ears and a
// tail; the parts melt into one shape through a smooth minimum of their signed distances, and the edge is
// anti-aliased from the distance itself. Copper eyes, a teal collar and a gold tag are its only colours.

export type Point = [number, number]
/** A point of a limb: x, y and the limb's radius there. */
export type Joint = [number, number, number]
export type Eyes = 'open' | 'wide' | 'half' | 'closed' | 'happy'
export type Mouth = 'open' | 'yawn' | 'tongue'

export interface Pose {
  body: Joint[]
  /** The head's centre and radius. */
  head: Joint
  legs?: Joint[][]
  tail?: Joint[]
  /** Limbs in front of the body (a paw at the face, a foot at the ear), cut out from it by a thin gap. */
  limbs?: Joint[][]
  /** Turns the head in degrees; folds lay an ear back (0 upright, 1 flat). */
  tilt?: number
  foldL?: number
  foldR?: number
  eyes?: Eyes
  /** Where the pupils look, as an offset in units. */
  look?: Point
  /** How far the lids are down over open eyes, 0 to 1. */
  lid?: number
  mouth?: Mouth
  balls?: Joint[]
  /** A Z of sleep: x, y and size. */
  z?: Joint[]
  hearts?: Joint[]
  /** Little dots of thought above the head: x, y and how many show. */
  dots?: Joint
  /** Speed lines, drawn faintly. */
  lines?: [Point, Point][]
}

// The frame covers x from OX and y from OY in drawing units: room behind for a flung tail and above for a jump.
export const OX = -4, OY = -8, UW = 72, UH = 54
export const GROUND = 40
export const PPU = 3
export const W = UW * PPU, H = UH * PPU

type RGB = [number, number, number]
const PALETTE = {
  dark: { ink: [20, 18, 24] as RGB, glint: [255, 255, 255] as RGB, pupil: [20, 18, 24] as RGB, closed: [236, 232, 240] as RGB },
  light: { ink: [236, 232, 240] as RGB, glint: [255, 255, 255] as RGB, pupil: [24, 22, 28] as RGB, closed: [24, 22, 28] as RGB },
}
const COPPER: RGB = [214, 128, 40], GOLD: RGB = [245, 196, 80], TEAL: RGB = [42, 168, 176]
const PINK: RGB = [233, 120, 143], RED: RGB = [226, 92, 92], YARN: RGB = [170, 60, 66]

const N = W * H
const X = new Float32Array(N), Y = new Float32Array(N)
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { X[j * W + i] = (i + 0.5) / PPU + OX; Y[j * W + i] = (j + 0.5) / PPU + OY }

type Field = Float32Array
const field = (f: (x: number, y: number) => number): Field => { const d = new Float32Array(N); for (let k = 0; k < N; k++) d[k] = f(X[k]!, Y[k]!); return d }

function capsule(ax: number, ay: number, bx: number, by: number, ra: number, rb: number): Field {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1e-9
  return field((x, y) => {
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / L))
    return Math.hypot(x - ax - t * dx, y - ay - t * dy) - (ra + (rb - ra) * t)
  })
}
const circle = (cx: number, cy: number, r: number, sx = 1): Field => field((x, y) => Math.hypot((x - cx) / sx, y - cy) - r)

/** Exact signed distance to a triangle (after Inigo Quilez). */
function triangle(p0: Point, p1: Point, p2: Point): Field {
  const e = [[p1[0] - p0[0], p1[1] - p0[1]], [p2[0] - p1[0], p2[1] - p1[1]], [p0[0] - p2[0], p0[1] - p2[1]]] as const
  const p = [p0, p1, p2]
  const s = Math.sign(e[0][0] * e[2][1] - e[0][1] * e[2][0])
  return field((x, y) => {
    let d = Infinity, inside = Infinity
    for (let i = 0; i < 3; i++) {
      const vx = x - p[i]![0], vy = y - p[i]![1], [ex, ey] = e[i]!
      const t = Math.min(1, Math.max(0, (vx * ex + vy * ey) / (ex * ex + ey * ey)))
      const qx = vx - ex * t, qy = vy - ey * t
      d = Math.min(d, qx * qx + qy * qy)
      inside = Math.min(inside, s * (vx * ey - vy * ex))
    }
    return -Math.sqrt(d) * Math.sign(inside)
  })
}

function smin(a: Field, b: Field, k: number): Field {
  const d = new Float32Array(N)
  for (let i = 0; i < N; i++) {
    const h = Math.min(1, Math.max(0, 0.5 + 0.5 * (b[i]! - a[i]!) / k))
    d[i] = b[i]! * (1 - h) + a[i]! * h - k * h * (1 - h)
  }
  return d
}
const map = (a: Field, f: (v: number, i: number) => number): Field => { const d = new Float32Array(N); for (let i = 0; i < N; i++) d[i] = f(a[i]!, i); return d }
const coverage = (d: Field): Field => map(d, v => Math.min(1, Math.max(0, 0.5 - v * PPU)))

export function rot(p: Point, c: Point, deg: number): Point {
  const r = deg * Math.PI / 180, x = p[0] - c[0], y = p[1] - c[1]
  return [c[0] + x * Math.cos(r) - y * Math.sin(r), c[1] + x * Math.sin(r) + y * Math.cos(r)]
}

/** Catmull-Rom through the joints, n samples per span, so limbs bend in curves rather than beads. */
function spline(points: Joint[], n = 4): Joint[] {
  if (points.length < 3) return points
  const p = [points[0]!, ...points, points[points.length - 1]!]
  const out: Joint[] = []
  for (let i = 1; i < p.length - 2; i++) {
    const [a, b, c, d] = [p[i - 1]!, p[i]!, p[i + 1]!, p[i + 2]!]
    for (let k = 0; k < n; k++) {
      const t = k / n
      out.push([0, 1, 2].map(j => 0.5 * (2 * b[j]! + (-a[j]! + c[j]!) * t + (2 * a[j]! - 5 * b[j]! + 4 * c[j]! - d[j]!) * t * t + (-a[j]! + 3 * b[j]! - 3 * c[j]! + d[j]!) * t ** 3)) as Joint)
    }
  }
  out.push(points[points.length - 1]!)
  return out
}

function chain(points: Joint[]): Field {
  const s = spline(points)
  let d: Field | null = null
  for (let i = 0; i + 1 < s.length; i++) {
    const [ax, ay, ar] = s[i]!, [bx, by, br] = s[i + 1]!
    const c = capsule(ax, ay, bx, by, ar, br)
    d = d ? smin(d, c, 0.8) : c
  }
  return d ?? circle(s[0]![0], s[0]![1], s[0]![2])
}

/** The head as a Bombay's: round, full in the cheeks, a broad muzzle; small round ears set wide and close to the skull. */
function headParts(P: Pose) {
  const [hx, hy] = P.head
  const tilt = P.tilt ?? 0
  const c: Point = [hx, hy]
  let head = circle(hx, hy, 7.3, 1.1)
  head = smin(head, circle(hx - 3.2, hy + 2.8, 3.9), 1.0)
  head = smin(head, circle(hx + 3.6, hy + 2.8, 3.9), 1.0)
  head = smin(head, circle(hx + 5.4, hy + 2.6, 2.6), 1.0)
  for (const [side, fold] of [[-1, P.foldL ?? 0], [1, P.foldR ?? 0]] as const) {
    const a = (side * (34 + fold * 55) + 5) * Math.PI / 180
    const out: Point = [Math.sin(a), -Math.cos(a)], along: Point = [Math.cos(a), Math.sin(a)]
    const base: Point = [hx + out[0] * 4.3 * 1.1, hy + out[1] * 4.3]
    const tip: Point = [base[0] + out[0] * 4.2, base[1] + out[1] * 4.2]
    const b0: Point = [base[0] - along[0] * 2.8, base[1] - along[1] * 2.8], b1: Point = [base[0] + along[0] * 2.8, base[1] + along[1] * 2.8]
    const [q0, q1, q2] = [b0, tip, b1].map(p => rot(p, c, tilt)) as [Point, Point, Point]
    head = smin(head, map(triangle(q0, q1, q2), v => v - 1.3), 0.6)
  }
  const eyes = [-3.1, 3.9].map(dx => rot([hx + dx, hy + 0.9], c, tilt))
  const neck = [rot([hx - 4.5, hy + 6.4], c, tilt), rot([hx + 2.5, hy + 8.0], c, tilt)]
  return { head, eyes, c, tilt, neck }
}

/** One frame of the pose as RGBA pixels; `light` draws the white cat for dark backgrounds. */
export function render(P: Pose, light = false): Uint8ClampedArray {
  const pal = light ? PALETTE.light : PALETTE.dark
  const rgb = new Float32Array(N * 3), alpha = new Float32Array(N)
  const paint = (cov: Field, [r, g, b]: RGB, opacity = 1) => {
    for (let i = 0; i < N; i++) {
      const a = cov[i]! * opacity
      if (!a) continue
      rgb[i * 3] = rgb[i * 3]! * (1 - a) + r / 255 * a
      rgb[i * 3 + 1] = rgb[i * 3 + 1]! * (1 - a) + g / 255 * a
      rgb[i * 3 + 2] = rgb[i * 3 + 2]! * (1 - a) + b / 255 * a
      alpha[i] = alpha[i]! * (1 - a) + a
    }
  }
  const { head, eyes, c, tilt, neck } = headParts(P)
  let cat = smin(chain(P.body), head, 2.6)
  for (const leg of P.legs ?? []) cat = smin(cat, chain(leg), 1.1)
  if (P.tail) cat = smin(cat, chain(P.tail), 1.0)
  let catCov = coverage(cat)
  paint(catCov, pal.ink)
  for (const limb of P.limbs ?? []) {
    // the gap follows the limb from its first joint on, so none shows where it leaves the body
    const d = chain(limb), outer = limb.length > 2 ? chain(limb.slice(1)) : d
    const inner = coverage(d), ring = coverage(map(outer, v => v - 0.55))
    for (let i = 0; i < N; i++) {
      const gap = Math.max(0, ring[i]! - inner[i]!)
      alpha[i] = alpha[i]! * (1 - gap)
      for (let k = 0; k < 3; k++) rgb[i * 3 + k] = rgb[i * 3 + k]! * (1 - gap)
    }
    paint(inner, pal.ink)
    catCov = map(catCov, (v, i) => Math.max(v, inner[i]!))
  }

  // the collar: a band round the neck, only where it crosses the cat and not the face
  const [[ax, ay], [bx, by]] = neck as [Point, Point]
  const band = coverage(capsule(ax, ay, bx, by, 0.9, 0.9)), off = coverage(map(head, v => -(v + 0.15)))
  paint(map(band, (v, i) => Math.min(v, catCov[i]!, off[i]!)), TEAL)
  const [tx, ty] = rot([(ax + bx) / 2 + 0.6, (ay + by) / 2 + 1.7], [(ax + bx) / 2, (ay + by) / 2], tilt)
  paint(coverage(circle(tx, ty, 1.1)), GOLD)

  // eyes: a Bombay's round copper eyes with a big pupil and one glint
  const e = P.eyes ?? 'open', look = P.look ?? [0.45, 0.15]
  eyes.forEach(([ex, ey], i) => {
    const s = i === 0 ? 0.85 : 1                       // the far eye a little smaller
    if (e === 'open' || e === 'wide' || e === 'half') {
      const ry = (e === 'wide' ? 2.8 : 2.5) * s
      const lid = e === 'half' ? 0.5 : (P.lid ?? 0)
      const top = ey - ry + lid * 2 * ry                   // the lid comes down to here
      const shown = map(circle(ex, ey, ry, 0.92), (v, k) => Math.max(v, top - Y[k]!))
      paint(coverage(shown), COPPER)
      paint(map(coverage(circle(ex, ey + ry * 0.35, ry * 0.75, 1.1)), (v, k) => Y[k]! > top ? v : 0), GOLD, 0.45)
      const pr = (e === 'wide' ? 0.9 : 1.5) * s
      paint(map(coverage(circle(ex + look[0] * s * 0.6, ey + look[1] * 0.6, pr, 0.85)), (v, k) => Y[k]! > top ? v : 0), pal.pupil)
      if (lid < 0.45) paint(coverage(circle(ex - 0.7 * s, ey - 0.9 * s, 0.55 * s)), pal.glint)
    } else {
      // a thin arc: curving down when shut in sleep, up when happy
      const cy = e === 'closed' ? ey - 1.4 : ey + 1.6
      const ring = coverage(map(circle(ex, cy, 1.8 * s), v => Math.abs(v) - 0.32))
      paint(map(ring, (v, k) => (e === 'closed' ? Y[k]! < cy : Y[k]! > cy) ? 0 : v), pal.closed)
    }
  })
  if (P.mouth) {
    const [mx, my] = rot([P.head[0] + 5.4, P.head[1] + 4.4], c, tilt)
    const [rx, ry] = { open: [1.1, 1.3], yawn: [1.7, 2.2], tongue: [0.7, 0.9] }[P.mouth]
    paint(coverage(circle(mx, my, ry!, rx! / ry!)), PINK)
  }

  for (const [x, y, r] of P.balls ?? []) {
    paint(coverage(circle(x, y, r)), RED)
    const ball = coverage(circle(x, y, r))
    paint(map(coverage(map(circle(x - 0.5, y - 0.3, r * 0.55), v => Math.abs(v) - 0.18)), (v, i) => Math.min(v, ball[i]!)), YARN)
  }
  for (const [zx, zy, zs] of P.z ?? []) {
    const path: Point[] = [[zx, zy], [zx + zs, zy], [zx, zy + zs], [zx + zs, zy + zs]]
    let d: Field | null = null
    for (let i = 0; i + 1 < path.length; i++) { const cc = capsule(...path[i]!, ...path[i + 1]!, 0.32, 0.32); d = d ? map(d, (v, k) => Math.min(v, cc[k]!)) : cc }
    paint(coverage(d!), TEAL)
  }
  for (const [hx, hy, hs] of P.hearts ?? []) {
    let heart = smin(circle(hx - hs * 0.5, hy, hs * 0.6), circle(hx + hs * 0.5, hy, hs * 0.6), 0.2)
    const point = triangle([hx - hs * 1.05, hy + hs * 0.2], [hx, hy + hs * 1.4], [hx + hs * 1.05, hy + hs * 0.2])
    heart = map(heart, (v, i) => Math.min(v, point[i]!))
    paint(coverage(heart), PINK)
  }
  if (P.dots) {
    const [dx, dy, count] = P.dots
    for (let i = 0; i < count; i++) paint(coverage(circle(dx + i * 2.4, dy - i * 0.9, 0.75 + i * 0.12)), TEAL)
  }
  for (const [[x0, y0], [x1, y1]] of P.lines ?? []) paint(coverage(capsule(x0, y0, x1, y1, 0.25, 0.25)), pal.ink, 0.5)

  const out = new Uint8ClampedArray(N * 4)
  for (let i = 0; i < N; i++) {
    const a = alpha[i]!
    // the colour was blended over transparent black; divide it back out so edges keep their colour
    for (let k = 0; k < 3; k++) out[i * 4 + k] = a > 0 ? Math.round(Math.min(1, rgb[i * 3 + k]! / a) * 255) : 0
    out[i * 4 + 3] = Math.round(a * 255)
  }
  return out
}
