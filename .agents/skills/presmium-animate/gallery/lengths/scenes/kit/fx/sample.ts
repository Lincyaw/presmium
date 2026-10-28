// Points sampled from shapes at build: particles that gather into a logo, morphs between shapes of any point count.
import type { Point } from './paths.ts'

/** `n` points evenly spaced along an SVG path's outline (a detached path element, measured once at build). */
export function samplePath(d: string, n: number): Point[] {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', d)
  const length = path.getTotalLength()
  return Array.from({ length: n }, (_, i) => {
    const p = path.getPointAtLength((i / n) * length)
    return [p.x, p.y] as Point
  })
}

/**
 * Points filling a shape: `draw` paints it in any colour on a fixed-size offscreen canvas (`size` × `size`,
 * coordinates 0..size), and every `step`-th pixel inside is kept. Fixed size, so the result does not depend on the
 * screen. Sorted top to bottom, left to right; shuffle with `ranks` for a scattered order.
 */
export function sampleFill(draw: (g: CanvasRenderingContext2D) => void, size = 256, step = 4): Point[] {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d', { willReadFrequently: true })!
  draw(g)
  const data = g.getImageData(0, 0, size, size).data
  const points: Point[] = []
  for (let y = 0; y < size; y += step) for (let x = 0; x < size; x += step) if (data[(y * size + x) * 4 + 3]! > 127) points.push([x, y])
  return points
}

/** A polyline resampled to `n` points at equal distances along it. */
export function resample(points: readonly Point[], n: number, closed = false): Point[] {
  const pts = closed ? [...points, points[0]!] : [...points]
  const cum = [0]
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]))
  const total = cum.at(-1)!
  return Array.from({ length: n }, (_, k) => {
    const s = (k / (closed ? n : n - 1)) * total
    let i = 1
    while (i < cum.length - 1 && cum[i]! < s) i++
    const u = (s - cum[i - 1]!) / Math.max(1e-9, cum[i]! - cum[i - 1]!)
    return [pts[i - 1]![0] + (pts[i]![0] - pts[i - 1]![0]) * u, pts[i - 1]![1] + (pts[i]![1] - pts[i - 1]![1]) * u] as Point
  })
}

/** Rotates a closed point list so it starts where it is nearest to `target`'s order: a morph without a twist. */
export function matchStart(points: readonly Point[], target: readonly Point[]): Point[] {
  let best = 0, bestCost = Infinity
  for (let r = 0; r < points.length; r++) {
    let cost = 0
    for (let i = 0; i < points.length; i++) {
      const p = points[(i + r) % points.length]!, q = target[i % target.length]!
      cost += (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2
    }
    if (cost < bestCost) { bestCost = cost; best = r }
  }
  return points.map((_, i) => points[(i + best) % points.length]!)
}
