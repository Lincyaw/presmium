// D3 helpers for the fancy atoms in `fx/d3/`: a 1280×720 SVG stage, the phase of a step, glow and hatch defs with
// per-instance ids, the exact point of a D3 curve at an x, a point at a fraction of a polyline's length, and the
// text colour that reads on a fill. Everything is computed at build or from the time; nothing measures the page.
import type * as D3Module from 'd3'
import { glowFilter, hatchPattern } from './fx/defs.ts'
import { uid } from './fx/ids.ts'
import { luminance, isDark } from './fx/theme.ts'

export type XY = [number, number]

/** An SVG filling `root`, drawn in a `w` × `h` box (the 16:9 frame of the lengths gallery by default). */
export function stage(d3: typeof D3Module, root: HTMLElement, w = 1280, h = 720) {
  return d3.select(root).append('svg').attr('viewBox', `0 0 ${w} ${h}`).attr('width', '100%').attr('height', '100%')
    .style('display', 'block').style('font-family', 'var(--pm-font-sans)')
}

/** Progress 0..1 of the slice `from`..`to` (fractions) of step `k` at `ms`. */
export const phaser = (at: (k: number) => number) => (ms: number, k: number, from = 0, to = 1) =>
  Math.max(0, Math.min(1, ((ms - at(k)) / (at(k + 1) - at(k)) - from) / (to - from)))

type Svg = D3Module.Selection<SVGSVGElement, unknown, null, undefined>

/** `rgb()` from `color(name)` with an alpha, for a flood or a gradient stop. */
export const alpha = (rgb: string, a: number) => rgb.replace(/rgba?\(([^,]+),([^,]+),([^,)]+)(,[^)]*)?\)/, `rgba($1,$2,$3, ${a})`)

/**
 * A glow filter in `color`, wider and stronger on a dark page (where it reads as light) than on a light one (where
 * a wide halo reads as a smudge). Returns its url.
 */
export function glow(svg: Svg, color: string, bg: string, strength = 8): string {
  const id = uid('d3fx-glow')
  const dark = isDark(bg)
  svg.append('defs').html(glowFilter(id, alpha(color, dark ? 0.95 : 0.55), dark ? strength * 1.4 : strength * 0.7))
  return `url(#${id})`
}

/** Diagonal hatching in `color`, the printed-figure fill for a gain. Returns its url. */
export function hatch(svg: Svg, color: string, gap = 11, width = 2.2): string {
  const id = uid('d3fx-hatch')
  svg.append('defs').html(hatchPattern(id, color, gap, width))
  return `url(#${id})`
}

/** A fresh id for a clip path, gradient or mask of this instance. */
export const defId = (prefix: string) => uid(`d3fx-${prefix}`)

/**
 * The y of a D3 curve at x, exactly as the path draws it: the curve is replayed once into a recorder (D3 curves
 * draw into any canvas-like context), and each cubic segment is solved for x. For curves whose segments advance
 * in x (`curveMonotoneX`, `curveLinear`, the step curves), so a head dot can sit on the tip of a line clipped at x.
 */
export function curveAt(d3: typeof D3Module, curve: D3Module.CurveFactory, points: readonly XY[]): (x: number) => number {
  const segs: [XY, XY, XY, XY][] = []
  let pen: XY = [0, 0]
  const lineTo = (x: number, y: number) => { segs.push([pen, [pen[0] + (x - pen[0]) / 3, pen[1] + (y - pen[1]) / 3], [pen[0] + (2 * (x - pen[0])) / 3, pen[1] + (2 * (y - pen[1])) / 3], [x, y]]); pen = [x, y] }
  const recorder = {
    moveTo: (x: number, y: number) => { pen = [x, y] },
    lineTo,
    bezierCurveTo: (x1: number, y1: number, x2: number, y2: number, x: number, y: number) => { segs.push([pen, [x1, y1], [x2, y2], [x, y]]); pen = [x, y] },
    closePath: () => {},
  }
  d3.line().curve(curve).context(recorder as unknown as CanvasRenderingContext2D)(points as XY[])
  const bez = (a: number, b: number, c: number, d: number, t: number) => { const s = 1 - t; return s * s * s * a + 3 * s * s * t * b + 3 * s * t * t * c + t * t * t * d }
  return (x: number) => {
    const seg = segs.find(s => x <= s[3][0]) ?? segs.at(-1)!
    let lo = 0, hi = 1
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2
      if (bez(seg[0][0], seg[1][0], seg[2][0], seg[3][0], mid) < x) lo = mid
      else hi = mid
    }
    const t = (lo + hi) / 2
    return bez(seg[0][1], seg[1][1], seg[2][1], seg[3][1], t)
  }
}

/** A polyline's length and its point at a fraction `u` of that length: the tip of a `pathLength="1"` draw of it. */
export function along(points: readonly XY[]) {
  const cum = [0]
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1]! + Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]))
  const length = cum.at(-1)!
  return {
    points,
    length,
    at(u: number): XY {
      const s = Math.max(0, Math.min(1, u)) * length
      let i = 1
      while (i < cum.length - 1 && cum[i]! < s) i++
      const k = (s - cum[i - 1]!) / Math.max(1e-9, cum[i]! - cum[i - 1]!)
      const a = points[i - 1]!, b = points[i]!
      return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]
    },
  }
}

/** Of two token colours, the one that reads better as text on `fill` (by luminance contrast). */
export function textOn(fill: string, a: string, b: string): string {
  const ratio = (p: string, q: string) => { const [hi, lo] = [luminance(p), luminance(q)].sort((m, n) => n - m); return (hi! + 0.05) / (lo! + 0.05) }
  return ratio(fill, a) >= ratio(fill, b) ? a : b
}

/** 10ⁿ for a log axis tick. */
export const power10 = (v: number) => `10${[...String(Math.round(Math.log10(v)))].map(c => '⁰¹²³⁴⁵⁶⁷⁸⁹'[+c]).join('')}`
