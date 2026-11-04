import { gsapScene } from '@lincyaw/addon-motion/scene'
import { frame, TYPE } from '../../../../lengths/scenes/kit/frame.ts'
import { clock } from '../../../../lengths/scenes/kit/fx/time.ts'
import { isDark } from '../../../../lengths/scenes/kit/fx/theme.ts'
import { clip, FIGURE_CSS, figureHtml, lensOf, move, plot, span, union, view, WHOLE, wipe, word } from './figure.ts'
import type { Axes, FigureMap, Pt, Region } from './figure.ts'

// The figure tour as a function of its figure, so a document's own scene file can import its crop and word map
// (an imported picture is bundled and published with every form) and pass them with its shots:
//
//   import { figureTour } from '<gallery>/catalog/paper-figure/scenes/lib/tour.ts'
//   import image from '../figures/fig3.png'
//   import map from '../figures/fig3.json'
//   export default figureTour({ image, map, axes: { … }, shots: [ … ], source: '论文图 3' })
//
// The block's parameters (`image` as a full URL, `map`, `axes`, `shots`, `source`, `ink`) override these. The timing of
// each shot is described in `../figure-tour.ts`.

export interface Shot {
  /** `whole`, words to frame, a region of the figure (fractions), or `{ data: [[x0, y0], [x1, y1]] }`. Default: the last frame. */
  frame?: 'whole' | string[] | Region | { data: [Pt, Pt] }
  /** Words to ring, or a region; a shot without one fades the ring. */
  ring?: string[] | Region
  /** A point in data coordinates (needs `axes`). */
  point?: Pt
  /** Dotted lines from the point down and left to the plot's edges (needs both axes' `range`). */
  guides?: boolean
  label?: string
  /** A dashed line through these data points, ending where it leaves the plot. */
  line?: Pt[]
  /** The keyword beside the window while this shot is on. */
  keyword?: string
}

/** `ink` names the design-token colour of the marks (`accent` by default; `category-6` when the figure is blue). */
export interface Tour { image: string, map: FigureMap, axes?: Axes, shots: Shot[], source?: string, ink?: string }

const BOX = { x: 3, y: 9, w: 66, h: 37 }
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function figureTour(defaults: Tour) {
  return gsapScene(({ root, gsap, at, durations, color, parameters }) => {
    const { D, T } = clock(at, durations)
    const image = typeof parameters.image === 'string' ? parameters.image : defaults.image
    const map = (parameters.map ?? defaults.map) as FigureMap
    // Another figure's map makes the default axes and shots meaningless.
    const axes = (parameters.axes ?? (parameters.map ? undefined : defaults.axes)) as Axes | undefined
    const shots = (Array.isArray(parameters.shots) ? parameters.shots : parameters.map ? [{ frame: 'whole' }] : defaults.shots) as Shot[]
    const source = typeof parameters.source === 'string' ? parameters.source : defaults.source ?? ''
    const lens = lensOf(map, BOX)
    const P = axes ? plot(map, axes) : undefined
    const VW = 1000, VH = 1000 / map.aspect
    const u = (p: Pt) => `${(p[0] * VW).toFixed(2)},${(p[1] * VH).toFixed(2)}`
    const needAxes = (what: string) => { if (!P) throw new Error(`figure tour: ${what} needs \`axes\``); return P }

    const regionOf = (f: Shot['frame'] | Shot['ring']): Region => {
      if (!f || f === 'whole') return WHOLE
      if (Array.isArray(f)) return union(f.map(r => word(map, r)))
      if ('data' in f) { const at = needAxes('a frame in data').at; return span(at(f.data[0]), at(f.data[1])) }
      return f
    }
    const ringBox = (r: Region) => ({ x: r.x * VW - 8, y: r.y * VH - 3, width: r.w * VW + 16, height: r.h * VH + 6 })

    // Marks, in the figure's units. Each shot's marks are drawn in its state and stay to the end.
    const marks = shots.map((s, k) => {
      let svg = ''
      if (s.line) {
        const p = needAxes('a line')
        const pts = s.line.map(p.at)
        svg += `<path class="pf-line pf-line${k}" d="M${(p.box ? clip(pts, p.box) : pts).map(u).join(' L')}"/>`
      }
      if (s.point) {
        const p = needAxes('a point')
        const [x, y] = p.at(s.point)
        if (s.guides && p.box) {
          const b = p.box
          svg += `<path class="pf-guide pf-gv${k}" d="M${u([x, y])} L${u([x, b.y + b.h])}"/><path class="pf-guide pf-gh${k}" d="M${u([x, y])} L${u([b.x, y])}"/>`
        }
        svg += `<g class="pf-pt${k}"><circle class="pf-dot" cx="${x * VW}" cy="${y * VH}" r="7"/></g>`
        if (s.label) svg += `<g class="pf-lb${k}"><text class="pf-lab" x="${x * VW}" y="${y * VH}">${esc(s.label)}</text></g>`
      }
      return svg
    }).join('')
    const first = shots.find(s => s.ring)?.ring
    const ring = first ? `<rect class="pf-ring" rx="6" ${Object.entries(ringBox(regionOf(first))).map(([k, v]) => `${k}="${v}"`).join(' ')}/>` : ''

    // The marks' colour is a design token, the accent unless the figure's own colours are close to it. The sheet
    // stays white on a dark page, where the token is too light for it.
    const named = typeof parameters.ink === 'string' ? parameters.ink : defaults.ink ?? 'accent'
    const token = `var(--pm-color-${/^[a-z0-9-]+$/.test(named) ? named : 'accent'})`
    const ink = isDark(color('bg')) ? `color-mix(in oklab, ${token} 65%, var(--pm-color-shadow))` : token
    frame(root, `${FIGURE_CSS}
      .pf { --pf-ink: ${ink}; }
      .pf-side { position: absolute; left: ${BOX.x + BOX.w + 3}cqw; right: 3cqw; top: ${BOX.y}cqh; height: ${BOX.h}cqw; }
      .pf-kw { position: absolute; left: 0; right: 0; top: 50%; font-size: ${TYPE.body}cqw; font-weight: 650; line-height: 1.3; text-wrap: balance; }
      .pf-src { position: absolute; left: ${BOX.x}cqw; top: calc(${BOX.y}cqh + ${BOX.h}cqw + 2cqh); font-size: ${TYPE.caption}cqw; color: var(--pm-color-muted); white-space: nowrap; }
    `, `${figureHtml(image, map, BOX, `${ring}${marks}`)}
      <div class="pf-side">${shots.map((s, k) => s.keyword ? `<div class="pf-kw pf-kw${k}">${esc(s.keyword)}</div>` : '').join('')}</div>
      <div class="pf-src">${esc(source)}</div>`)

    const tl = gsap.timeline()
    const cam = root.querySelector('.pf__cam')!
    const has = (sel: string) => Boolean(root.querySelector(sel))
    gsap.set(['.pf', '.pf-src', '.pf-kw', '.pf-ring', '[class^="pf-pt"]', '[class^="pf-lb"]'], { autoAlpha: 0 })
    gsap.set('.pf-kw', { yPercent: -50 })
    let last = regionOf(shots[0]?.frame)
    gsap.set(cam, view(last, lens))
    tl.fromTo('.pf', { autoAlpha: 0, scale: 0.97 }, { autoAlpha: 1, scale: 1, duration: 0.3 * D(0), ease: 'power3.out', immediateRender: false }, T(0))
    tl.to('.pf-src', { autoAlpha: 1, duration: 0.4 }, T(0, 0.3))

    let ringOn = false
    shots.forEach((s, k) => {
      if (k >= durations.length) return
      const target = s.frame === undefined ? last : regionOf(s.frame)
      if (target !== last) {
        tl.to(cam, { keyframes: move(last, target, lens), duration: Math.min(1, 0.36 * D(k)), ease: 'power3.inOut' }, T(k, 0.04))
        last = target
      }
      // One keyword at a time: the last one has gone before the next arrives.
      if (k > 0 && has(`.pf-kw${k - 1}`)) tl.to(`.pf-kw${k - 1}`, { autoAlpha: 0, duration: 0.2 }, T(k, 0.05))
      if (has(`.pf-kw${k}`)) tl.fromTo(`.pf-kw${k}`, { autoAlpha: 0, yPercent: -30 }, { autoAlpha: 1, yPercent: -50, duration: 0.4, ease: 'power3.out', immediateRender: false }, T(k, 0.05) + (k > 0 ? 0.22 : 0))
      if (s.ring) {
        const box = ringBox(regionOf(s.ring))
        if (ringOn) tl.to('.pf-ring', { attr: box, duration: 0.5, ease: 'power3.inOut' }, T(k, 0.38))
        else {
          tl.set('.pf-ring', { attr: box }, T(k, 0.38))
          tl.fromTo('.pf-ring', { autoAlpha: 0, scale: 1.08, transformOrigin: '50% 50%' }, { autoAlpha: 1, scale: 1, duration: 0.4, ease: 'expo.out', immediateRender: false }, T(k, 0.38))
        }
        ringOn = true
      } else if (ringOn) {
        tl.to('.pf-ring', { autoAlpha: 0, duration: 0.3 }, T(k, 0.02))
        ringOn = false
      }
      if (s.point) tl.fromTo(`.pf-pt${k}`, { autoAlpha: 0, scale: 0.3, transformOrigin: '50% 50%' }, { autoAlpha: 1, scale: 1, duration: 0.35, ease: 'back.out(2)', immediateRender: false }, T(k, 0.4))
      if (has(`.pf-gv${k}`)) {
        wipe(gsap, tl, `.pf-gv${k}`, T(k, 0.45), 0.5, 'down')
        wipe(gsap, tl, `.pf-gh${k}`, T(k, 0.45), 0.5, 'left')
      }
      if (s.label) tl.to(`.pf-lb${k}`, { autoAlpha: 1, duration: 0.3 }, T(k, 0.6))
      if (has(`.pf-line${k}`)) wipe(gsap, tl, `.pf-line${k}`, T(k, 0.35), 0.4 * D(k), 'right')
    })
    tl.set({}, {}, T(durations.length))
    return tl
  })
}
