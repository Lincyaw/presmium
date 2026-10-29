// Shared by the transition and camera scenes of this deck, which all draw every frame from the time alone
// (defineScene): the two panels a transition goes between, the seconds of the states, the GSAP eases the kit lacks,
// and a blur along one axis.
//
// A transition in Presmium happens inside one scene, between two of its states: sections are separate pages, so
// panel A and panel B are both parameters of the scene. A panel is a title with an optional kicker, line, icon
// (a name of kit/icons.ts) or image (a URL; prefer an inline SVG or a data URI, because a bitmap that loads after a
// frame is drawn shows up blank in the export).
import { blurFilter } from '../../../../lengths/scenes/kit/fx/defs.ts'
import { uid } from '../../../../lengths/scenes/kit/fx/ids.ts'
import { phase } from '../../../../lengths/scenes/kit/fx/time.ts'
import { ICONS } from '../../../../lengths/scenes/kit/icons.ts'

export interface Panel { kicker?: string, title: string, line?: string, icon?: string, image?: string }
export type Tone = 'plain' | 'accent'

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : undefined)

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** The panel an author gave (used as given, so no default field leaks into it), or the scene's default. */
export function panel(raw: unknown, fallback: Panel): Panel {
  if (typeof raw === 'string' && raw.trim()) return { title: raw }
  if (!raw || typeof raw !== 'object') return fallback
  const o = raw as Record<string, unknown>
  return { kicker: str(o.kicker), title: str(o.title) ?? '', line: str(o.line), icon: str(o.icon), image: str(o.image) }
}

export const PANEL_CSS = `
  .tp { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; overflow: hidden; }
  .tp--plain { background: var(--pm-color-surface); }
  .tp--accent { background: var(--pm-color-accent-soft); }
  .tp--accent .tp__title { color: var(--pm-color-accent); }
  .tp__body { display: flex; flex-direction: column; align-items: center; gap: 2.4cqh; text-align: center; transform-origin: 50% 50%; }
  .tp__line { font-weight: 400; color: var(--pm-color-muted); }
  .tp__icon { width: 18cqh; height: 18cqh; border-radius: 50%; display: flex; align-items: center; justify-content: center;
    background: var(--pm-color-accent-soft); color: var(--pm-color-accent); }
  .tp--accent .tp__icon { background: var(--pm-color-surface); }
  .tp__icon svg { width: 58%; height: 58%; }
  .tp__img { display: block; max-width: 64cqw; max-height: 48cqh; border-radius: 1.2cqw; object-fit: contain; }
`

/** One full-bleed panel: its picture (image or icon), kicker, title and line, centred. */
export function panelHtml(p: Panel, tone: Tone, className = ''): string {
  const icon = p.icon && p.icon in ICONS ? ICONS[p.icon as keyof typeof ICONS] : undefined
  const art = p.image ? `<img class="tp__img" src="${esc(p.image)}" alt="" />` : icon ? `<div class="tp__icon">${icon}</div>` : ''
  return `<div class="tp tp--${tone} ${className}"><div class="tp__body">${art}
    ${p.kicker ? `<div class="lf-chip tp__kicker">${esc(p.kicker)}</div>` : ''}
    <div class="lf-title tp__title">${esc(p.title)}</div>
    ${p.line ? `<div class="lf-lead tp__line">${esc(p.line)}</div>` : ''}</div></div>`
}

/** Progress 0..1 of the interval from `start` lasting `duration` (s); a zero-length interval is a step at `start`. */
export const span = (t: number, start: number, duration: number) => (duration <= 0 ? (t >= start ? 1 : 0) : phase(t, start, duration))

// GSAP eases the kit's `ease` table lacks, by the power they are: GSAP's powerN is a power of N + 1, so the source
// pieces' power2.inOut is `ease.inOut3` there, and these are power3.in, power3.inOut, power4.in, power4.out, sine.inOut.
export const in4 = (p: number) => p ** 4
export const inOut4 = (p: number) => (p < 0.5 ? 8 * p ** 4 : 1 - (-2 * p + 2) ** 4 / 2)
export const in5 = (p: number) => p ** 5
export const out5 = (p: number) => 1 - (1 - p) ** 5
export const sineInOut = (p: number) => -(Math.cos(Math.PI * p) - 1) / 2

/** Seconds of the scene's states: where state k starts and how long it lasts. */
export function beats(ctx: { at(k: number): number, durations: readonly number[], total: number }) {
  return { at: (k: number) => ctx.at(k) / 1000, len: (k: number) => (ctx.durations[k] ?? 0) / 1000, total: ctx.total / 1000 }
}

/**
 * A blur along one axis for one element: an SVG feGaussianBlur with "x 0" (or "0 y"), because CSS blur() is the
 * same in every direction and reads as defocus. Returns `set(cqw)`, which removes the filter below half a pixel so
 * the element is sharp at rest. `width` is the scene's width in px, to turn container units into user units.
 */
export function axisBlur(host: HTMLElement, el: HTMLElement, width: number, axis: 'x' | 'y' = 'x') {
  const id = uid('tc-blur')
  host.insertAdjacentHTML('beforeend', `<svg class="tc-defs" aria-hidden="true"><defs>${blurFilter(id, 0, 0, { x: -4000, y: -4000, w: 12000, h: 12000 })}</defs></svg>`)
  const node = host.querySelector(`.${id}__blur`)!
  return (cqw: number) => {
    const px = (Math.abs(cqw) * width) / 100
    if (px < 0.5) { el.style.filter = ''; return }
    node.setAttribute('stdDeviation', axis === 'x' ? `${px.toFixed(2)} 0` : `0 ${px.toFixed(2)}`)
    el.style.filter = `url(#${id})`
  }
}

export const DEFS_CSS = `.tc-defs { position: absolute; width: 0; height: 0; overflow: hidden; }`

/** One of `options`, or the first. */
export const oneOf = <T extends string>(v: unknown, options: readonly T[]): T => (options.includes(v as T) ? (v as T) : options[0]!)
export const num = (v: unknown, fallback: number, lo = -Infinity, hi = Infinity) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : fallback)
