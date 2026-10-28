// SVG path builders that keep a fixed point count, so shapes built with them morph into each other.

export type Point = [number, number]

/** A smooth path through points (Catmull-Rom as cubic Béziers); closed paths wrap around. */
export function smoothPath(points: readonly Point[], closed = false, tension = 0.5): string {
  const n = points.length
  if (n < 2) return ''
  const at = (i: number) => points[closed ? (i + n) % n : Math.max(0, Math.min(n - 1, i))]!
  let d = `M ${points[0]![0].toFixed(2)} ${points[0]![1].toFixed(2)}`
  const last = closed ? n : n - 1
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2)
    const c1: Point = [p1[0] + ((p2[0] - p0[0]) * tension) / 3, p1[1] + ((p2[1] - p0[1]) * tension) / 3]
    const c2: Point = [p2[0] - ((p3[0] - p1[0]) * tension) / 3, p2[1] - ((p3[1] - p1[1]) * tension) / 3]
    d += ` C ${c1[0].toFixed(2)} ${c1[1].toFixed(2)} ${c2[0].toFixed(2)} ${c2[1].toFixed(2)} ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`
  }
  return closed ? `${d} Z` : d
}

/** A closed blob of `n` points around (cx, cy) with radius jittered by `jitter` (0..1) from `rng`. */
export function blobPath(rng: () => number, cx: number, cy: number, r: number, n = 8, jitter = 0.2): string {
  return smoothPath(Array.from({ length: n }, (_, i): Point => {
    const a = (i / n) * Math.PI * 2, k = 1 + (rng() * 2 - 1) * jitter
    return [cx + Math.cos(a) * r * k, cy + Math.sin(a) * r * k]
  }), true)
}

/** A sine wave across `width` at height `y`, `amp` high with `periods` periods, shifted by `phase` (0..1), closed down to `bottom`. */
export function wave(width: number, y: number, amp: number, periods: number, phase = 0, bottom?: number, samples = 48): string {
  const pts = Array.from({ length: samples + 1 }, (_, i): Point => {
    const x = (i / samples) * width
    return [x, y + amp * Math.sin(((x / width) * periods + phase) * Math.PI * 2)]
  })
  const line = pts.map(([x, py], i) => `${i ? 'L' : 'M'} ${x.toFixed(2)} ${py.toFixed(2)}`).join(' ')
  return bottom === undefined ? line : `${line} L ${width} ${bottom} L 0 ${bottom} Z`
}

export const polar = (cx: number, cy: number, r: number, a: number): Point => [cx + r * Math.cos(a), cy + r * Math.sin(a)]

/** An annular sector from angle a0 to a1 (radians, 0 at 3 o'clock, clockwise in SVG), radii r0 < r1. */
export function ring(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number): string {
  const large = a1 - a0 > Math.PI ? 1 : 0
  const [x0, y0] = polar(cx, cy, r1, a0), [x1, y1] = polar(cx, cy, r1, a1)
  const [x2, y2] = polar(cx, cy, r0, a1), [x3, y3] = polar(cx, cy, r0, a0)
  return `M ${x0} ${y0} A ${r1} ${r1} 0 ${large} 1 ${x1} ${y1} L ${x2} ${y2} A ${r0} ${r0} 0 ${large} 0 ${x3} ${y3} Z`
}

/** A hand-drawn ellipse: a little more than one loop, with seeded wobble, for circling an annotation. */
export function handEllipse(rng: () => number, cx: number, cy: number, rx: number, ry: number, n = 16): string {
  return smoothPath(Array.from({ length: n + 3 }, (_, i): Point => {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2 * 1.08, k = 1 + (rng() * 2 - 1) * 0.05
    return [cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]
  }))
}
