// The Fourier series of a closed outline, for epicycle drawings. Each term is a circle that turns a whole number of
// times per loop (the sign of n is the direction), and the circles chained tip to tail, largest first, draw the
// outline. The module also gives the error of the first K circles, measured at points of the outline, and the
// fitted curve as a cubic Bézier path whose handles come from the series' exact derivative, so the drawing ends
// as an ordinary vector path. Everything is computed once at build from evenly spaced points (`samplePath`);
// a scene then only sums rotations at the time it is shown.
import type { Point } from './fx/paths.ts'

/** One circle: `n` turns per loop, radius `r`, starting angle `phase` (radians). */
export interface Term { n: number, r: number, phase: number }

export interface Series {
  /** c₀, the mean of the points: where the first circle turns. */
  center: Point
  /** Every other coefficient, largest radius first. */
  terms: Term[]
  /** The RMS distance of the points from the centre: errors are fractions of it. */
  scale: number
}

/** The discrete Fourier series of a closed loop of points, taken as x + iy at t = 2πk/N. */
export function series(points: readonly Point[]): Series {
  const N = points.length
  const cos = Float64Array.from({ length: N }, (_, k) => Math.cos((2 * Math.PI * k) / N))
  const sin = Float64Array.from({ length: N }, (_, k) => Math.sin((2 * Math.PI * k) / N))
  let cx = 0, cy = 0
  for (const [x, y] of points) { cx += x / N; cy += y / N }
  const terms: Term[] = []
  // n from −(N/2 − 1) to N/2 − 1: the frequencies N samples tell apart.
  for (let n = 1 - Math.ceil(N / 2); n < Math.ceil(N / 2); n++) {
    if (n === 0) continue
    let re = 0, im = 0
    for (let k = 0; k < N; k++) {
      const i = (((n * k) % N) + N) % N
      const [x, y] = points[k]!
      // (x + iy) e^(−iθ)
      re += x * cos[i]! + y * sin[i]!
      im += y * cos[i]! - x * sin[i]!
    }
    terms.push({ n, r: Math.hypot(re, im) / N, phase: Math.atan2(im, re) })
  }
  terms.sort((a, b) => b.r - a.r || Math.abs(a.n) - Math.abs(b.n))
  const scale = Math.sqrt(points.reduce((sum, [x, y]) => sum + (x - cx) ** 2 + (y - cy) ** 2, 0) / N)
  return { center: [cx, cy], terms, scale }
}

/**
 * The joints of the first `count` circles at angle `t` (one loop is 2π): the centre, then the tip of each circle,
 * so circle i turns about joint i and the last joint is the pen. `grow(i)` scales circle i (0..1 while it appears).
 */
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
export function point(s: Series, count: number, t: number): Point {
  let [x, y] = s.center
  for (let i = 0; i < count; i++) {
    const { n, r, phase } = s.terms[i]!
    x += r * Math.cos(n * t + phase)
    y += r * Math.sin(n * t + phase)
  }
  return [x, y]
}

/** The pen's velocity dz/dt there: the tangent a Bézier handle follows. */
function velocity(s: Series, count: number, t: number): Point {
  let x = 0, y = 0
  for (let i = 0; i < count; i++) {
    const { n, r, phase } = s.terms[i]!
    x -= n * r * Math.sin(n * t + phase)
    y += n * r * Math.cos(n * t + phase)
  }
  return [x, y]
}

/**
 * The RMS distance between `targets`, the outline at t = 2πj/J, and where the first `count` circles put the pen at
 * the same t, as a fraction of the shape's size (`scale`).
 */
export function error(s: Series, count: number, targets: readonly Point[]): number {
  const J = targets.length
  let sum = 0
  targets.forEach(([x, y], j) => {
    const [px, py] = point(s, count, (2 * Math.PI * j) / J)
    sum += (px - x) ** 2 + (py - y) ** 2
  })
  return Math.sqrt(sum / J) / s.scale
}

/** An anchor of a Bézier path with the handles that leave it backwards (`in`) and forwards (`out`). */
export interface Anchor { p: Point, in: Point, out: Point }

/**
 * The curve the first `count` circles draw, as a closed path of cubic Béziers. Each piece from t₀ to t₁ is the cubic
 * Hermite curve of the series (end points and exact tangents, handles a third of the way along them), and each is
 * made as long as it can be while it stays within `tolerance` of the series at every point of a `grid` between,
 * so straight runs take few anchors and sharp turns take many.
 */
export function bezierPath(s: Series, count: number, tolerance = 1.5, grid = 1024): { d: string, anchors: Anchor[] } {
  const ts = Array.from({ length: grid + 1 }, (_, i) => (2 * Math.PI * i) / grid)
  const at = ts.map(t => point(s, count, t)), v = ts.map(t => velocity(s, count, t))
  const piece = (i: number, j: number): [Point, Point, Point, Point] => {
    const h = (ts[j]! - ts[i]!) / 3, p0 = at[i]!, p3 = at[j]!
    return [p0, [p0[0] + v[i]![0] * h, p0[1] + v[i]![1] * h], [p3[0] - v[j]![0] * h, p3[1] - v[j]![1] * h], p3]
  }
  const fits = (i: number, j: number) => {
    const [p0, p1, p2, p3] = piece(i, j)
    for (let m = i + 1; m < j; m++) {
      const f = (m - i) / (j - i), g = 1 - f
      const bx = g * g * g * p0[0] + 3 * g * g * f * p1[0] + 3 * g * f * f * p2[0] + f * f * f * p3[0]
      const by = g * g * g * p0[1] + 3 * g * g * f * p1[1] + 3 * g * f * f * p2[1] + f * f * f * p3[1]
      if (Math.hypot(bx - at[m]![0], by - at[m]![1]) > tolerance) return false
    }
    return true
  }
  const segments: [Point, Point, Point, Point][] = []
  for (let i = 0; i < grid;) {
    let j = i + 1
    while (j < grid && fits(i, j + 1)) j++
    segments.push(piece(i, j))
    i = j
  }
  const f = (p: Point) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`
  const d = `M ${f(segments[0]![0])} ${segments.map(([, p1, p2, p3]) => `C ${f(p1)} ${f(p2)} ${f(p3)}`).join(' ')} Z`
  const anchors = segments.map(([p0, p1], i) => ({ p: p0, out: p1, in: segments[(i + segments.length - 1) % segments.length]![2] }))
  return { d, anchors }
}
