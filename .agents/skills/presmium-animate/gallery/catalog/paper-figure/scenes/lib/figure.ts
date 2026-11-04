// A paper's own figure inside a scene: a crop of the figure's PDF and its word map (both from `../../tools/figure.py`),
// shown in a window whose camera frames one region of it at a time, with marks laid over it in the figure's own
// coordinates. The word map gives the box of every word as fractions of the crop, so a ring sits on a legend entry
// exactly and two tick labels of an axis give that axis's transform from data values to the figure. Everything here
// is a pure function of its arguments: a scene computes each camera view and mark at build and tweens between them.

export interface FigureWord { text: string, x: number, y: number, w: number, h: number }
/** The JSON `figure.py` writes beside the crop: its aspect (width / height) and its words. */
export interface FigureMap { source?: string, crop?: number[], size?: number[], aspect: number, words: FigureWord[] }
/** A region of the figure as fractions of it: left, top, width, height. */
export interface Region { x: number, y: number, w: number, h: number }
export const WHOLE: Region = { x: 0, y: 0, w: 1, h: 1 }
export type Pt = readonly [number, number]

/** A word by its text, `"1e21"`, or by its text and which occurrence it is (0-based, in the PDF's order), `"2.5#1"`. */
export function word(map: FigureMap, ref: string): Region {
  const m = /^(.*)#(\d+)$/.exec(ref)
  const text = m ? m[1]! : ref, nth = m ? Number(m[2]) : 0
  const found = map.words.filter(w => w.text === text)[nth]
  if (!found) throw new Error(`the figure ${map.source ?? ''} has no word "${text}" (#${nth})`)
  return { x: found.x, y: found.y, w: found.w, h: found.h }
}

/** The smallest region that holds all of `regions`. */
export function union(regions: readonly Region[]): Region {
  const x0 = Math.min(...regions.map(r => r.x)), y0 = Math.min(...regions.map(r => r.y))
  const x1 = Math.max(...regions.map(r => r.x + r.w)), y1 = Math.max(...regions.map(r => r.y + r.h))
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}

export const centre = (r: Region) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

/**
 * One axis of a plot in the figure: two of its tick labels with their values (`[["1e19", 1e19], ["1e21", 1e21]]`),
 * whether it is logarithmic, and the plot's limits on it, which guides and lines that end at the plot's edge need.
 */
export interface AxisSpec { ticks: [[string, number], [string, number]], log?: boolean, range?: [number, number] }
export interface Axes { x: AxisSpec, y: AxisSpec }

/**
 * Data value → fraction of the figure along x or y. A tick label is centred on its tick: the x axis is read from the
 * horizontal centres of two of its labels, the y axis from the vertical centres of two of its labels.
 */
export function axis(map: FigureMap, spec: AxisSpec, along: 'x' | 'y'): (v: number) => number {
  const g = spec.log ? Math.log10 : (v: number) => v
  const [[a, va], [b, vb]] = spec.ticks
  const pa = centre(word(map, a))[along], pb = centre(word(map, b))[along]
  return v => pa + (g(v) - g(va)) / (g(vb) - g(va)) * (pb - pa)
}

/** Data points → fractions of the figure, and the plot's box when both axes give their range. */
export function plot(map: FigureMap, axes: Axes): { at: (p: Pt) => Pt, box?: Region } {
  const fx = axis(map, axes.x, 'x'), fy = axis(map, axes.y, 'y')
  const at = (p: Pt): Pt => [fx(p[0]), fy(p[1])]
  const rx = axes.x.range, ry = axes.y.range
  return { at, box: rx && ry ? span(at([rx[0], ry[0]]), at([rx[1], ry[1]])) : undefined }
}

/** The region between two corners, in any order. */
export function span(a: Pt, b: Pt): Region {
  return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) }
}

/**
 * The part of a polyline inside a box, from where it first enters to where it first leaves. A curve that leaves the
 * plot ends on the plot's edge; clamping its values to the range instead would draw it along the edge.
 */
export function clip(points: readonly Pt[], box: Region): Pt[] {
  const out: Pt[] = []
  for (let i = 1; i < points.length; i++) {
    const s = clipSegment(points[i - 1]!, points[i]!, box)
    if (!s) { if (out.length) break; continue }
    if (!out.length) out.push(s[0])
    out.push(s[1])
    if (s[1] !== points[i]) break
  }
  return out
}

/** Liang–Barsky: the part of the segment p → q inside the box, keeping p and q themselves when they are inside. */
function clipSegment(p: Pt, q: Pt, b: Region): [Pt, Pt] | undefined {
  const dx = q[0] - p[0], dy = q[1] - p[1]
  let t0 = 0, t1 = 1
  for (const [d, room] of [[-dx, p[0] - b.x], [dx, b.x + b.w - p[0]], [-dy, p[1] - b.y], [dy, b.y + b.h - p[1]]] as const) {
    if (d === 0) { if (room < 0) return undefined; continue }
    const t = room / d
    if (d < 0) { if (t > t1) return undefined; t0 = Math.max(t0, t) } else { if (t < t0) return undefined; t1 = Math.min(t1, t) }
  }
  const lerp = (t: number): Pt => [p[0] + t * dx, p[1] + t * dy]
  return [t0 === 0 ? p : lerp(t0), t1 === 1 ? q : lerp(t1)]
}

/** The camera's shape: the aspect (width / height) of the figure and of the window it is shown in. */
export interface Lens { figure: number, window: number }

/**
 * GSAP values for the camera element (`.pf__cam`, transform origin at its top left; GSAP applies `xPercent` and
 * `yPercent` outside the scale, as a translation in % of the element): its scale, its translation, and `--pf-z`,
 * the inverse of the scale, by which marks keep the same size on screen while the figure zooms.
 */
export interface View { scale: number, xPercent: number, yPercent: number, '--pf-z': number }

/** How the camera frames a region: `pad` around it as a share of its size, and at most `max` times the whole view. */
export interface Framing { pad?: number, max?: number }

interface Shot { s: number, cx: number, cy: number }

// Units are the window's width: the window is 1 wide and 1 / window high, the figure at scale 1 is 1 wide and
// 1 / figure high. A region of w × h fractions of the figure fits the window, contained, at the smaller of the two
// scales; the padding never asks for more than the whole figure, so `WHOLE` is shown edge to edge. `max` keeps the
// zoom where the crop is still sharp: a crop 2,400 pixels wide (the widest a build publishes) shown whole in a window
// two thirds of a 1920-pixel video wide is sharp to about 2× that.
function fit(r: Region, lens: Lens, { pad = 0.04, max = 2 }: Framing = {}): Shot {
  const w = Math.min(1, r.w * (1 + 2 * pad)), h = Math.min(1, r.h * (1 + 2 * pad))
  const whole = Math.min(1, lens.figure / lens.window)
  const s = Math.min(max * whole, 1 / w, lens.figure / lens.window / h)
  return { s, cx: r.x + r.w / 2, cy: r.y + r.h / 2 }
}

// The region's centre goes to the window's centre; then, along each direction where the figure covers the window,
// the camera is kept inside the figure (a region at its edge is framed against that edge instead of beside blank
// paper), and where it doesn't, the figure is centred.
function aim({ s, cx, cy }: Shot, lens: Lens): View {
  const fh = 1 / lens.figure, wh = 1 / lens.window
  let tx = 0.5 - s * cx, ty = wh / 2 - s * cy * fh
  tx = s >= 1 ? Math.min(0, Math.max(1 - s, tx)) : (1 - s) / 2
  ty = s * fh >= wh ? Math.min(0, Math.max(wh - s * fh, ty)) : (wh - s * fh) / 2
  return { scale: s, xPercent: tx * 100, yPercent: ty / fh * 100, '--pf-z': 1 / s }
}

/** The camera's view of a region: the region fills the window, contained and centred, and the camera stays inside the figure. */
export function view(region: Region, lens: Lens, framing?: Framing): View {
  return aim(fit(region, lens, framing), lens)
}

/**
 * A camera move as GSAP keyframes (`tl.to(cam, { keyframes: move(a, b, lens), duration, ease }, t)`): a zoom about
 * the point that stays still on screen, with the scale changing evenly in log space, so a push in and a pull out
 * feel like the same speed. The tween's `ease` shapes the whole move; between keyframes it is linear.
 */
export function move(from: Region, to: Region, lens: Lens, framing?: Framing, steps = 12) {
  const a = fit(from, lens, framing), b = fit(to, lens, framing)
  const wa = 1 / a.s, wb = 1 / b.s
  const views = Array.from({ length: steps + 1 }, (_, i) => {
    const q = i / steps, w = wa * (wb / wa) ** q
    // The visible width w is linear in the share u of the zoom done, and so is the centre of a zoom about a fixed point.
    const u = Math.abs(wb - wa) < 1e-9 ? q : (w - wa) / (wb - wa)
    return aim({ s: 1 / w, cx: a.cx + (b.cx - a.cx) * u, cy: a.cy + (b.cy - a.cy) * u }, lens)
  })
  return {
    scale: views.map(v => v.scale), xPercent: views.map(v => v.xPercent), yPercent: views.map(v => v.yPercent),
    '--pf-z': views.map(v => v['--pf-z']), easeEach: 'none',
  }
}

type Tweens = { set: (...args: any[]) => unknown, to: (...args: any[]) => unknown }

/**
 * Reveal an SVG element by sweeping a clip across it along `dir`: a dashed or dotted line, whose dash pattern DrawSVG
 * would replace with its own. The sweep runs in % of the element's box; across the sweep the clip reaches `margin`
 * user units past the box, because across a vertical line (or a horizontal one) the box is only as wide as the
 * stroke, or not wide at all where the fill box is measured, and a margin in % of that is nothing. Hidden from build
 * until `t`, so it seeks both ways.
 */
export function wipe(gsap: Tweens, tl: Tweens, target: Element | Element[] | string, t: number, duration: number,
  dir: 'right' | 'left' | 'down' | 'up' = 'right', { margin = 40, ease = 'power2.inOut' } = {}) {
  const m = `-${margin}px`, o = '-2%'
  const from = { right: `${m} 100% ${m} ${o}`, left: `${m} ${o} ${m} 100%`, down: `${o} ${m} 100% ${m}`, up: `100% ${m} ${o} ${m}` }[dir]
  const to = dir === 'right' || dir === 'left' ? `${m} ${o} ${m} ${o}` : `${o} ${m} ${o} ${m}`
  gsap.set(target, { clipPath: `inset(${from})` })
  tl.to(target, { clipPath: `inset(${to})`, duration, ease }, t)
}

/**
 * The window and the figure in it, in a frame measured in container units. `box`: left in cqw, top in cqh, width and
 * height in cqw (so the window's aspect is exact on any frame). `marks` is SVG drawn over the figure in its own units,
 * `0 0 1000 1000 / aspect`, and carried by the camera.
 */
export function figureHtml(src: string, map: FigureMap, box: { x: number, y: number, w: number, h: number }, marks = '', alt = ''): string {
  return `<div class="pf" style="left:${box.x}cqw;top:${box.y}cqh;width:${box.w}cqw;height:${box.h}cqw">
    <div class="pf__cam" style="height:${box.w / map.aspect}cqw"><img src="${src}" alt="${alt}" draggable="false">
      <svg class="pf__marks" viewBox="0 0 1000 ${1000 / map.aspect}" preserveAspectRatio="none">${marks}</svg></div></div>`
}

export const lensOf = (map: FigureMap, box: { w: number, h: number }): Lens => ({ figure: map.aspect, window: box.w / box.h })

/**
 * The window shows the page around the figure wherever the figure doesn't fill it; the figure lies on a sheet that
 * stays white in both themes, because the crop has a white ground. Marks use `--pf-ink`, set by the scene for the
 * theme (on a dark page the accent is too light for the white sheet), and multiply their widths by `--pf-z`.
 */
export const FIGURE_CSS = `
  .pf { position: absolute; overflow: hidden; }
  .pf__cam { position: absolute; left: 0; top: 0; width: 100%; transform-origin: 0 0; background: var(--pm-color-sheen);
    border-radius: calc(var(--pf-z, 1) * 0.6cqw); box-shadow: 0 0 0 calc(var(--pf-z, 1) * 0.12cqw) var(--pm-color-line-strong); }
  .pf__cam > img { position: absolute; inset: 0; width: 100%; height: 100%; display: block; user-select: none; }
  .pf__marks { position: absolute; inset: 0; width: 100%; height: 100%; max-width: none; overflow: visible; }
  .pf-ring { fill: none; stroke: var(--pf-ink); stroke-width: calc(var(--pf-z, 1) * 3.2px); }
  .pf-guide { fill: none; stroke: var(--pf-ink); stroke-width: calc(var(--pf-z, 1) * 2px); stroke-dasharray: 3 5; }
  .pf-line { fill: none; stroke: var(--pf-ink); stroke-width: calc(var(--pf-z, 1) * 3px); stroke-dasharray: 10 7; }
  .pf-dot { fill: var(--pf-ink); stroke: var(--pm-color-sheen); stroke-width: 2px; transform-box: fill-box; transform-origin: center;
    transform: scale(var(--pf-z, 1)); }
  .pf-lab { font: 700 calc(var(--pf-z, 1) * 30px) var(--pm-font-sans); fill: var(--pf-ink); stroke: var(--pm-color-sheen);
    stroke-width: calc(var(--pf-z, 1) * 6px); paint-order: stroke; stroke-linejoin: round;
    transform: translate(calc(var(--pf-z, 1) * 14px), calc(var(--pf-z, 1) * -14px)); }
`
