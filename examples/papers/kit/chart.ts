// Charts drawn in the SVG layer of a frame (viewBox 0 0 160 90, square units): linear and log scales, axes with
// ticks, curves sampled from a function, and colour ramps interpolated in sRGB. Everything is a pure function of its
// arguments, so a scene can redraw a chart at any time of its timeline.

export interface Scale {
  (v: number): number
  invert(u: number): number
  d0: number; d1: number; r0: number; r1: number
}

/** A linear map from the data range [d0, d1] to the layer range [r0, r1] (for a y axis, r0 is the bottom). */
export function scale(d0: number, d1: number, r0: number, r1: number): Scale {
  const f = ((v: number) => r0 + (v - d0) / (d1 - d0) * (r1 - r0)) as Scale
  f.invert = (u: number) => d0 + (u - r0) / (r1 - r0) * (d1 - d0)
  Object.assign(f, { d0, d1, r0, r1 })
  return f
}

export type Pt = readonly [number, number]

/** An SVG path through the points, straight segments. */
export function path(points: readonly Pt[]): string {
  return points.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)}`).join('')
}

/** `n + 1` points of `fn` over [from, to], in data coordinates. */
export function sample(fn: (v: number) => number, from: number, to: number, n = 80): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => { const v = from + (to - from) * i / n; return [v, fn(v)] as const })
}

/**
 * Data points to layer points. A curve that leaves the y range ends where it crosses the plot's edge (and starts
 * where it enters), instead of running along the edge.
 */
export function place(points: readonly Pt[], x: Scale, y: Scale): Pt[] {
  const lo = Math.min(y.d0, y.d1), hi = Math.max(y.d0, y.d1)
  const inside = (v: number) => v >= lo && v <= hi
  const out: Pt[] = []
  for (let i = 0; i < points.length; i++) {
    const [a, b] = points[i]!
    if (inside(b)) {
      const prev = points[i - 1]
      if (prev && !inside(prev[1]) && !out.length) out.push(edge(prev, points[i]!, prev[1] > hi ? hi : lo))
      out.push([a, b])
    } else if (out.length) {
      out.push(edge(points[i - 1]!, points[i]!, b > hi ? hi : lo))
      break
    }
  }
  return out.map(([a, b]) => [x(a), y(b)] as const)
}
function edge(p: Pt, q: Pt, v: number): Pt {
  const f = (v - p[1]) / (q[1] - p[1])
  return [p[0] + f * (q[0] - p[0]), v]
}

export const sigmoid = (z: number) => 1 / (1 + Math.exp(-z))

export interface AxisSpec {
  x: Scale; y: Scale
  xTicks?: { v: number, label: string }[]
  yTicks?: { v: number, label: string }[]
  xTitle?: string; yTitle?: string
  /** Extra class on the group, so a scene can address one axis set. */
  cls?: string
  grid?: boolean
}

/** Axes and ticks as SVG. Text is in layer units: 2.6 units is about 1.6% of the frame's width. */
export function axes(a: AxisSpec): string {
  const [xl, xr] = [a.x.r0, a.x.r1], [yb, yt] = [a.y.r0, a.y.r1]
  const tick = 0.9, font = 2.5
  const xs = (a.xTicks ?? []).map(t => `<g class="xt"><line x1="${a.x(t.v)}" y1="${yb}" x2="${a.x(t.v)}" y2="${yb + tick}" stroke="var(--c-line-strong)" stroke-width="0.25"/>
    <text x="${a.x(t.v)}" y="${yb + tick + 3}" font-size="${font}" text-anchor="middle" fill="var(--c-muted)">${t.label}</text></g>`).join('')
  const ys = (a.yTicks ?? []).map(t => `<g class="yt">${a.grid ? `<line x1="${xl}" y1="${a.y(t.v)}" x2="${xr}" y2="${a.y(t.v)}" stroke="var(--c-line)" stroke-width="0.18"/>` : ''}
    <line x1="${xl - tick}" y1="${a.y(t.v)}" x2="${xl}" y2="${a.y(t.v)}" stroke="var(--c-line-strong)" stroke-width="0.25"/>
    <text x="${xl - tick - 0.8}" y="${a.y(t.v) + 0.9}" font-size="${font}" text-anchor="end" fill="var(--c-muted)">${t.label}</text></g>`).join('')
  return `<g class="axes ${a.cls ?? ''}">
    <path d="M${xl},${yt} L${xl},${yb} L${xr},${yb}" fill="none" stroke="var(--c-line-strong)" stroke-width="0.3"/>
    ${xs}${ys}
    ${a.xTitle ? `<text class="xtitle" x="${(xl + xr) / 2}" y="${yb + tick + 7.2}" font-size="${font + 0.3}" text-anchor="middle" fill="var(--c-muted)">${a.xTitle}</text>` : ''}
    ${a.yTitle ? `<text class="ytitle" x="${xl}" y="${yt - 3}" font-size="${font + 0.3}" text-anchor="start" fill="var(--c-muted)">${a.yTitle}</text>` : ''}
  </g>`
}

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** A colour `t` (0..1) of the way along the stops, as rgb(). */
export function ramp(stops: readonly string[], t: number): string {
  const u = Math.max(0, Math.min(1, t)) * (stops.length - 1)
  const i = Math.min(stops.length - 2, Math.floor(u)), f = u - i
  const a = hex(stops[i]!), b = hex(stops[i + 1]!)
  return `rgb(${a.map((v, k) => Math.round(v + (b[k]! - v) * f)).join(',')})`
}

/** Matplotlib's viridis, the paper's colour for the hint level. */
export const VIRIDIS = ['#440154', '#482878', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725']

/** A tick at every whole decade of a log axis between `from` and `to` (log10 values), labelled 10ⁿ. */
export function decades(from: number, to: number, sup: (n: number) => string): { v: number, label: string }[] {
  const out = []
  for (let n = Math.ceil(from); n <= Math.floor(to); n++) out.push({ v: n, label: `10${sup(n)}` })
  return out
}

/**
 * Reveal a dashed (or any) SVG element from left to right. drawSVG would replace its dash pattern, so a dashed line is
 * uncovered with a clip instead; the clip is in the element's own box, with a margin for the stroke. A GSAP timeline
 * position `t` and a duration in seconds.
 */
export function wipe(tl: { fromTo: (...args: any[]) => unknown }, targets: string | Element | Element[], t: number, duration: number, ease = 'power2.inOut') {
  tl.fromTo(targets, { clipPath: 'inset(-20% 100% -20% -2%)' }, { clipPath: 'inset(-20% -2% -20% -2%)', duration, ease, immediateRender: false }, t)
}
