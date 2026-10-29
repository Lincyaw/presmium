// A paper or film-grain layer for any scene, in inline SVG (an `<img>` or a CSS `url()` would decode after the
// frame is drawn): speckles from `feTurbulence` in the ink colour, optional mottling (the cloudy unevenness of
// paper) and a soft vignette, over a paper tint. The noise is sized in a fixed 1280 × 720 viewBox, so it scales
// with the frame and looks the same in a reading column, on a slide and in the video. Every colour is a token, so
// the layer works on the light and the dark page; it is quiet by default (speckles at 14% where they peak), a
// texture under content, never a subject. `feTurbulence` with a fixed seed is the same picture on every build.
// For film grain that moves, change the seed by the time: `grainSeed(ms, fps)` gives the seed for a time (whole
// numbers that step `fps` times a second), set with `turbulence.setAttribute('seed', …)` in a drawing function,
// or in GSAP with one stepped tween:
//   `tl.to(turbulence, { attr: { seed: 1 + n }, ease: `steps(${n})`, duration: total / 1000 }, 0)` with
//   `n = Math.round(total / 1000 * fps)`.
// Static paper (fps 0) is the usual choice: moving grain draws the eye, and redraws the whole frame each step.
import { uid } from '../../../../lengths/scenes/kit/fx/ids.ts'

export interface GrainOptions {
  /** Opacity of the speckles, 0..1 (default 0.14). */
  strength?: number
  /** Speckle size: the turbulence's base frequency in the 1280-wide frame (default 1.1; lower is coarser). */
  frequency?: number
  /** Opacity of the paper's cloudy mottling, 0 for none (default 0.035). */
  mottle?: number
  /** Opacity of the darkened corners, 0 for none (default 0.1). */
  vignette?: number
  /** Tint the layer's ground like paper (default true); false leaves it transparent, for an overlay. */
  paper?: boolean
  seed?: number
}

/** Markup for an absolutely placed grain layer filling its container; the speckle turbulence has class `pg-turb`. */
export function grainMarkup(options: GrainOptions = {}): string {
  const { strength = 0.14, frequency = 1.1, mottle = 0.035, vignette = 0.1, paper = true, seed = 3 } = options
  const speck = uid('pg-speck'), cloud = uid('pg-mottle')
  // Alpha from the noise's red channel, steepened so that only its peaks show: sparse speckles, not a grey veil.
  const alpha = '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  3.2 0 0 0 -1.35'
  return `<div class="pg-layer" aria-hidden="true" style="position: absolute; inset: 0; pointer-events: none; color: var(--pm-color-ink);
      ${paper ? 'background: color-mix(in oklab, var(--pm-color-surface) 93%, var(--pm-color-warn));' : ''}">
    <svg viewBox="0 0 1280 720" preserveAspectRatio="none" style="position: absolute; inset: 0; width: 100%; height: 100%; display: block;">
      <filter id="${speck}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
        <feTurbulence class="pg-turb" type="fractalNoise" baseFrequency="${frequency}" numOctaves="2" seed="${seed}" stitchTiles="stitch" />
        <feColorMatrix type="matrix" values="${alpha}" result="n" />
        <feFlood flood-color="currentColor" result="c" />
        <feComposite operator="in" in="c" in2="n" />
      </filter>
      ${mottle > 0 ? `<filter id="${cloud}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="4" seed="${seed + 7}" />
        <feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  2.4 0 0 0 -0.95" result="n" />
        <feFlood flood-color="currentColor" result="c" />
        <feComposite operator="in" in="c" in2="n" />
      </filter>` : ''}
      <rect width="1280" height="720" filter="url(#${speck})" fill="white" opacity="${strength}" />
      ${mottle > 0 ? `<rect width="1280" height="720" filter="url(#${cloud})" fill="white" opacity="${mottle}" />` : ''}
    </svg>
    ${vignette > 0 ? `<div style="position: absolute; inset: 0; background: radial-gradient(ellipse 75% 70% at 50% 50%, transparent 55%, color-mix(in oklab, var(--pm-color-shadow) ${Math.round(vignette * 100)}%, transparent));"></div>` : ''}
  </div>`
}

/** The turbulence seed at `ms` for grain that changes `fps` times a second (0: never). */
export const grainSeed = (ms: number, fps: number, seed = 3) => (fps > 0 ? seed + Math.floor((ms / 1000) * fps) : seed)
