// The lesson's mathematics: closed outlines, their discrete Fourier series, and the chain of circles that draws them.
// An outline is built from straight lines, an ellipse and Bézier curves, resampled at equal distances along it and
// read as complex numbers x + iy at t = 2πk/M. Its DFT gives one circle per frequency n: radius |cₙ|, starting angle
// arg cₙ, turning n times per loop. Nothing here is precomputed; each scene computes the series once when it is built
// and only sums rotations at the time it shows. The module has no DOM, so the homepage draws the same picture.

export type Point = readonly [number, number]

/** One circle: `n` turns per loop (the sign is the direction), radius `r`, starting angle `phase` (radians). */
export interface Term { n: number, r: number, phase: number }

export interface Series {
  /** c₀, the mean of the points: where the first circle turns. */
  center: Point
  /** Every other coefficient, largest radius first. */
  terms: Term[]
  /** The RMS distance of the points from the centre: errors are fractions of it. */
  scale: number
  /** The outline itself, the points the series was computed from. */
  points: Point[]
}

export const SAMPLES = 1024

function cubic(p0: Point, p1: Point, p2: Point, p3: Point, count = 160): Point[] {
  return Array.from({ length: count }, (_, i) => {
    const f = i / count, g = 1 - f
    return [
      g * g * g * p0[0] + 3 * g * g * f * p1[0] + 3 * g * f * f * p2[0] + f * f * f * p3[0],
      g * g * g * p0[1] + 3 * g * g * f * p1[1] + 3 * g * f * f * p2[1] + f * f * f * p3[1],
    ] as Point
  })
}

function line(a: Point, b: Point, count = 80): Point[] {
  return Array.from({ length: count }, (_, i) => [a[0] + (b[0] - a[0]) * i / count, a[1] + (b[1] - a[1]) * i / count] as Point)
}

/**
 * An eighth note (y down): a tilted oval head, a stem rising from its right side and a flag that swoops down to a
 * point. One closed contour with five sharp corners (the stem's two joins with the head, its top, the flag's tip
 * and where the flag meets the stem again) and two long curves.
 */
function note(): Point[] {
  const rx = 1.05, ry = 0.72, tilt = -0.38, w = 0.22, right = 0.97, top = -3.9
  const head = (theta: number): Point => [
    rx * Math.cos(theta) * Math.cos(tilt) - ry * Math.sin(theta) * Math.sin(tilt),
    rx * Math.cos(theta) * Math.sin(tilt) + ry * Math.sin(theta) * Math.cos(tilt),
  ]
  // x(θ) = A cos θ + B sin θ = R cos(θ − δ): the upper of the two angles where the head reaches a stem edge.
  const A = rx * Math.cos(tilt), B = -ry * Math.sin(tilt), R = Math.hypot(A, B), delta = Math.atan2(B, A)
  const upper = (x: number) => {
    const a = Math.acos(x / R)
    return [delta + a, delta - a].sort((p, q) => head(p)[1] - head(q)[1])[0]!
  }
  const thetaRight = upper(right), thetaLeft = upper(right - w)
  // From the right edge's join, the long way round the head (under it) to the left edge's join.
  let end = thetaLeft
  while (end <= thetaRight) end += 2 * Math.PI
  const around = Array.from({ length: 480 }, (_, i) => head(thetaRight + (end - thetaRight) * i / 480))
  const tip: Point = [right + 1.02, top + 2.75], back: Point = [right, top + 1.2]
  return [
    ...line([right - w, top], [right, top], 20),
    ...cubic([right, top], [right + 0.12, top + 0.95], [right + 1.35, top + 1.15], tip),
    ...cubic(tip, [right + 1.08, top + 1.85], [right + 0.32, top + 1.7], back),
    ...line(back, head(thetaRight), 120),
    ...around,
    ...line(head(thetaLeft), [right - w, top], 160),
  ]
}

/** A five-pointed star, point up: ten straight edges and ten corners. */
function star(): Point[] {
  const corners = Array.from({ length: 10 }, (_, i): Point => {
    const r = i % 2 ? 0.42 : 1, a = -Math.PI / 2 + (i * Math.PI) / 5
    return [r * Math.cos(a), r * Math.sin(a)]
  })
  return corners.flatMap((corner, i) => line(corner, corners[(i + 1) % 10]!, 100))
}

export const SHAPES = { note, star } as const
export type ShapeName = keyof typeof SHAPES

/** A closed polyline resampled to `count` points at equal distances along it, centred, its longer side 1. */
export function resample(points: readonly Point[], count = SAMPLES): Point[] {
  const closed = [...points, points[0]!]
  const lengths = [0]
  for (let i = 1; i < closed.length; i++) lengths.push(lengths[i - 1]! + Math.hypot(closed[i]![0] - closed[i - 1]![0], closed[i]![1] - closed[i - 1]![1]))
  const total = lengths.at(-1)!
  let i = 1
  const even = Array.from({ length: count }, (_, k): Point => {
    const s = (k / count) * total
    while (i < lengths.length - 1 && lengths[i]! < s) i++
    const u = (s - lengths[i - 1]!) / Math.max(1e-12, lengths[i]! - lengths[i - 1]!)
    return [closed[i - 1]![0] + (closed[i]![0] - closed[i - 1]![0]) * u, closed[i - 1]![1] + (closed[i]![1] - closed[i - 1]![1]) * u]
  })
  const xs = even.map(p => p[0]), ys = even.map(p => p[1])
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  const size = Math.max(x1 - x0, y1 - y0)
  return even.map(([x, y]) => [(x - (x0 + x1) / 2) / size, (y - (y0 + y1) / 2) / size] as Point)
}

/** The discrete Fourier series of a closed loop of points, taken as x + iy at t = 2πk/M. */
export function series(points: readonly Point[]): Series {
  const M = points.length
  const cos = Float64Array.from({ length: M }, (_, k) => Math.cos((2 * Math.PI * k) / M))
  const sin = Float64Array.from({ length: M }, (_, k) => Math.sin((2 * Math.PI * k) / M))
  let cx = 0, cy = 0
  for (const [x, y] of points) { cx += x / M; cy += y / M }
  const terms: Term[] = []
  // n from −(M/2 − 1) to M/2 − 1: the frequencies M samples tell apart.
  for (let n = 1 - M / 2; n < M / 2; n++) {
    if (n === 0) continue
    let re = 0, im = 0
    for (let k = 0; k < M; k++) {
      const i = (((n * k) % M) + M) % M
      const [x, y] = points[k]!
      // cₙ = (1/M) Σ (x + iy) e^(−inθₖ)
      re += x * cos[i]! + y * sin[i]!
      im += y * cos[i]! - x * sin[i]!
    }
    terms.push({ n, r: Math.hypot(re, im) / M, phase: Math.atan2(im, re) })
  }
  // Largest first; equal radii (symmetric shapes) keep the slower circle first, so the order never depends on rounding.
  terms.sort((a, b) => b.r - a.r || Math.abs(a.n) - Math.abs(b.n) || a.n - b.n)
  const scale = Math.sqrt(points.reduce((sum, [x, y]) => sum + (x - cx) ** 2 + (y - cy) ** 2, 0) / M)
  return { center: [cx, cy], terms, scale, points: [...points] }
}

const cache = new Map<ShapeName, Series>()
/** The series of a named outline, computed once per page. */
export function shapeSeries(name: ShapeName): Series {
  let found = cache.get(name)
  if (!found) cache.set(name, found = series(resample(SHAPES[name]())))
  return found
}

/** The centre, then the tip of each of the first `count` circles at angle `t` (one loop is 2π); the last is the pen. */
export function joints(s: Series, count: number, t: number, grow: (i: number) => number = () => 1): Point[] {
  let [x, y] = s.center
  const out: Point[] = [[x, y]]
  for (let i = 0; i < count; i++) {
    const { n, r, phase } = s.terms[i]!
    const a = n * t + phase, g = r * grow(i)
    x += g * Math.cos(a)
    y += g * Math.sin(a)
    out.push([x, y])
  }
  return out
}

/** Where the first `count` circles put the pen at angle `t`. */
export function pen(s: Series, count: number, t: number): Point {
  let [x, y] = s.center
  for (let i = 0; i < count; i++) {
    const { n, r, phase } = s.terms[i]!
    x += r * Math.cos(n * t + phase)
    y += r * Math.sin(n * t + phase)
  }
  return [x, y]
}

/** The closed curve the first `count` circles draw, as `steps + 1` points. */
export function trace(s: Series, count: number, steps = 1200): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => pen(s, count, (2 * Math.PI * i) / steps))
}

/** The RMS distance between the outline and the pen of the first `count` circles at the same t, as a fraction of `scale`. */
export function error(s: Series, count: number): number {
  const M = s.points.length
  let sum = 0
  s.points.forEach(([x, y], k) => {
    const [px, py] = pen(s, count, (2 * Math.PI * k) / M)
    sum += (px - x) ** 2 + (py - y) ** 2
  })
  return Math.sqrt(sum / M) / s.scale
}

/** A polyline as SVG path data, mapped by `place`. */
export function pathData(points: readonly Point[], place: (p: Point) => Point = p => p, closed = false): string {
  if (points.length < 2) return ''
  return `M${points.map(p => { const [x, y] = place(p); return `${x.toFixed(1)} ${y.toFixed(1)}` }).join('L')}${closed ? 'Z' : ''}`
}
