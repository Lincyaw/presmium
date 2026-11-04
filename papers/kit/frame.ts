// Shared by the scenes of every paper film: a 16:9 frame in container units (1cqw = 1% of the scene's width, 1cqh = 1%
// of its height), so a scene looks the same in the reading column, on a slide and in the video; an SVG layer whose
// units are square (160 × 90 across the frame); the type scale; and the colours, used the same way in every film.
//
// The whole frame is usable, but what must be read stays above 77% of the height: a burned two-line caption takes the
// bottom of the frame from about 78%. Charts put their x axis at 61 of the layer's 90 units, so the axis title clears it.

import { BRAND, MARK } from './brand.ts'

export const TYPE = { tiny: 1.25, small: 1.5, label: 1.75, body: 2.0, lead: 2.6, title: 3.6, hero: 5.2 }

/**
 * Colours by meaning. The neutral ones are the design system's; the paper's own encoding (its methods, its fitted and
 * held-out models, its prediction and baseline) is kept from the paper's figures, so a crop of a figure and the
 * animation beside it share one legend. Each film adds its own in its scenes and keeps one meaning per colour.
 */
export const PALETTE = `
  --c-ink: var(--pm-color-ink); --c-muted: var(--pm-color-muted); --c-line: var(--pm-color-line); --c-line-strong: var(--pm-color-line-strong);
  --c-surface: var(--pm-color-surface); --c-sunk: var(--pm-color-sunk); --c-accent: var(--pm-color-accent); --c-accent-soft: var(--pm-color-accent-soft);
  --c-ours: #d1495b; --c-ours-soft: color-mix(in srgb, #d1495b 14%, var(--pm-color-surface));
  --c-held: #eda100; --c-held-soft: color-mix(in srgb, #eda100 16%, var(--pm-color-surface));
  --c-base: var(--pm-color-ink);
  --c-fit: color-mix(in srgb, var(--pm-color-ink) 62%, var(--pm-color-surface));
`

const ROOT = `.fx { position: absolute; inset: 0; container-type: size; overflow: hidden; font-family: var(--pm-font-sans);
  color: var(--pm-color-ink); line-height: 1.35; ${PALETTE} }`
const BASE = `
  * { box-sizing: border-box; }
  .abs { position: absolute; }
  .muted { color: var(--pm-color-muted); }
  .mono { font-family: var(--pm-font-mono); }
  .num { font-variant-numeric: tabular-nums; }
  .note { font-size: ${TYPE.tiny}cqw; color: var(--pm-color-muted); white-space: nowrap; }
  .kw { position: absolute; white-space: nowrap; font-size: ${TYPE.lead}cqw; font-weight: 700; }
  .chip { display: inline-flex; align-items: center; gap: 0.5cqw; padding: 0.35cqw 1cqw; border-radius: 99cqw; white-space: nowrap;
    font-size: ${TYPE.small}cqw; font-weight: 650; }
  .card { position: absolute; border-radius: 1cqw; background: var(--pm-color-surface); border: 0.15cqw solid var(--pm-color-line-strong); }
  svg.layer { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
  svg.layer text { font-family: var(--pm-font-sans); fill: currentColor; }
  .brand { position: absolute; left: 2.4cqw; top: 2.4cqh; display: flex; align-items: center; gap: 0.7cqw; font-size: ${TYPE.small}cqw;
    color: var(--pm-color-muted); white-space: nowrap; }
  .brand b { color: var(--pm-color-ink); font-weight: 700; }
  .brand__m { width: 2.6cqw; height: 2.6cqw; border-radius: 0.6cqw; overflow: hidden; box-shadow: 0 0 0 0.1cqw var(--c-line-strong); }
  .brand__m svg { width: 100%; height: 100%; display: block; }
`

/** Draw the scene's HTML into a 16:9 frame; `css` is scoped to it. */
export function frame(root: HTMLElement, css: string, html: string): HTMLElement {
  root.innerHTML = `<div class="fx"><style>${ROOT}@scope {${BASE}${css}}</style>${html}</div>`
  return root.firstElementChild as HTMLElement
}

/** The film's docked mark, top left: the series' mark and name, and the paper's short name. */
export function brand(paper: string): string {
  return `<div class="brand"><span class="brand__m">${MARK}</span><span>${BRAND.name}</span><b>${escape(paper)}</b></div>`
}

export function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Frame coordinates (x in cqw, y in cqh) to the units of the SVG layer, whose viewBox is "0 0 160 90". */
export const vx = (cqw: number) => cqw * 1.6
export const vy = (cqh: number) => cqh * 0.9
export const LAYER = 'viewBox="0 0 160 90"'

/**
 * Times inside a scene. `at(k)` is where state k starts; a beat is placed at a fraction of its state's length, so that
 * when a lecture gives each state the length of its step's voiceover, every beat moves with its sentence.
 */
export function clock(at: (k: number) => number, durations: readonly number[]) {
  const S = (k: number) => at(k) / 1000
  const D = (k: number) => (durations[k] ?? 0) / 1000
  /** The time, in seconds, `f` of the way through state k (f in [0, 1]). */
  const T = (k: number, f = 0) => S(k) + f * D(k)
  return { S, D, T }
}

/** A seeded generator (mulberry32), so every random choice is the same on every render. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Is the page drawn dark? Decided from the surface colour the page shows. */
export function isDark(color: (name: string) => string): boolean {
  const [r = 255, g = 255, b = 255] = (color('surface').match(/[\d.]+/g) ?? []).map(Number)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128
}

/** Superscript digits, for powers of ten written as text (10²³). */
export function sup(n: number | string): string {
  const map: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' }
  return String(n).split('').map(c => map[c] ?? c).join('')
}
