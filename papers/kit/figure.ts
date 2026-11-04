// A cropped figure of the paper inside a scene, with a camera that frames one region of it at a time and marks laid
// over it in the figure's own coordinates. The crop and its word map come from `tools/figure.py`: the map gives the
// box of every word as fractions of the crop, so a mark can sit on a tick label or a legend entry exactly.

export interface FigureWord { text: string, x: number, y: number, w: number, h: number }
export interface FigureMap { source: string, size: [number, number], aspect: number, words: FigureWord[] }
/** A region of the figure as fractions of it: left, top, width, height. */
export interface Region { x: number, y: number, w: number, h: number }

/** The `nth` word equal to `text` (0-based), as a region of the figure. */
export function word(map: FigureMap, text: string, nth = 0): Region {
  const found = map.words.filter(w => w.text === text)[nth]
  if (!found) throw new Error(`the figure ${map.source} has no word "${text}" (#${nth})`)
  return { x: found.x, y: found.y, w: found.w, h: found.h }
}

/** The centre of a region. */
export const centre = (r: Region) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 })

/**
 * The figure in a box of the frame (left, top and width in cqw; the height follows from the crop's aspect). `marks`
 * is HTML positioned in % of the figure (`left: 30%; top: 12%`), drawn above it and moved with it by the camera.
 * The figure sits on a sheet of paper in light and dark pages alike, because the crop has a white ground.
 */
export function figureHtml(cls: string, src: string, map: FigureMap, box: { x: number, y: number, w: number }, marks = ''): string {
  const h = box.w / map.aspect
  return `<div class="pfig ${cls}" style="left:${box.x}cqw;top:${box.y}cqh;width:${box.w}cqw;height:${h}cqw">
    <div class="pfig__cam"><img src="${src}" alt="" draggable="false"><div class="pfig__marks">${marks}</div></div></div>`
}

export const FIGURE_CSS = `
  .pfig { position: absolute; overflow: hidden; border-radius: 0.8cqw; background: #fff; box-shadow: 0 0 0 0.12cqw var(--c-line-strong); }
  .pfig__cam { position: absolute; left: 0; top: 0; width: 100%; height: 100%; transform-origin: 0 0; }
  .pfig__cam img { position: absolute; inset: 0; width: 100%; height: 100%; display: block; user-select: none; }
  .pfig__marks { position: absolute; inset: 0; }
  .pfig__marks > * { position: absolute; }
  .pfig-ring { border: 0.32cqw solid var(--c-ours); border-radius: 0.8cqw; }
  .pfig-src { position: absolute; font-size: 1.2cqw; color: var(--pm-color-muted); white-space: nowrap; }
`

/**
 * The camera's transform that makes `region` fill the box (contained, centred), as GSAP values for `.pfig__cam`: a
 * scale and a translation in % of the figure. The whole figure is `{ x: 0, y: 0, w: 1, h: 1 }`.
 */
export function view(region: Region, pad = 0.04): { scale: number, xPercent: number, yPercent: number } {
  const w = region.w * (1 + 2 * pad), h = region.h * (1 + 2 * pad)
  // The box has the figure's aspect, so in figure fractions it is 1 × 1; a region of w × h fits at scale 1 / max(w, h).
  const scale = Math.min(1 / w, 1 / h)
  const cx = region.x + region.w / 2, cy = region.y + region.h / 2
  return { scale, xPercent: (0.5 / scale - cx) * 100 * scale, yPercent: (0.5 / scale - cy) * 100 * scale }
}
