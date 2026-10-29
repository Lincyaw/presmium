// Pointers for the cursor and annotation scenes: an arrow with its click ring, an I-beam, a fingertip disc and a
// marker pen. Each is an element with no size whose top left is the pointer's hot spot (the arrow's tip, the I-beam's
// middle, the disc's centre, the pen's nib); `place` puts the hot spot at (x %, y %) of the stage. Their colours are
// the pointer tokens (the same white-on-black arrow on a light and a dark page), the ring and the pen's ink are the
// accent or the ink colour the scene passes. `size` scales a pointer from its hot spot: 1 is a normal cursor, 2.5 an
// oversized "look here" cursor for a video.

export const POINTER_CSS = `
  .pt-layer { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
  .pt { position: absolute; left: 0; top: 0; width: 0; height: 0; transform-origin: 0 0; }
  .pt svg { position: absolute; overflow: visible; max-width: none; max-height: none; }
  .pt__k { position: absolute; left: 0; top: 0; }
  .pt__arrow { left: -0.3cqw; top: -0.2cqw; width: 2.6cqw; height: 2.6cqw; filter: drop-shadow(0 0.1cqw 0.15cqw color-mix(in oklab, var(--pm-color-pointer-stroke) 35%, transparent)); }
  .pt__beam { left: -0.7cqw; top: -1.6cqw; width: 1.4cqw; height: 3.2cqw; }
  .pt__ring { position: absolute; left: -2.6cqw; top: -2.6cqw; width: 5.2cqw; height: 5.2cqw; border-radius: 50%; border: 0.3cqw solid var(--pt-ring, var(--pm-color-accent)); opacity: 0; }
  .pt__disc { position: absolute; left: -2.4cqw; top: -2.4cqw; width: 4.8cqw; height: 4.8cqw; border-radius: 50%;
    background: color-mix(in oklab, var(--pm-color-pointer-stroke) 24%, transparent); border: 0.15cqw solid color-mix(in oklab, var(--pm-color-pointer-fill) 80%, transparent);
    box-shadow: 0 0 0 0.12cqw color-mix(in oklab, var(--pm-color-pointer-stroke) 25%, transparent); }
  .pt__pen { left: 0; top: -9cqw; width: 9cqw; height: 9cqw; transform-origin: 0 100%; filter: drop-shadow(0.3cqw 0.4cqw 0.3cqw color-mix(in oklab, var(--pm-color-pointer-stroke) 30%, transparent)); }
`

const ARROW = `<svg class="pt__arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 2 L20 12 L12 13.6 L8.2 21 Z" fill="var(--pm-color-pointer-fill)" stroke="var(--pm-color-pointer-stroke)" stroke-width="1.6" stroke-linejoin="round" /></svg>`
const BEAM = `<svg class="pt__beam" viewBox="0 0 14 32" aria-hidden="true"><path d="M3 2 Q7 2 7 6 V26 Q7 30 3 30 M11 2 Q7 2 7 6 M7 26 Q7 30 11 30 M4 16 H10" fill="none" stroke="var(--pm-color-pointer-fill)" stroke-width="4" stroke-linecap="round" /><path d="M3 2 Q7 2 7 6 V26 Q7 30 3 30 M11 2 Q7 2 7 6 M7 26 Q7 30 11 30 M4 16 H10" fill="none" stroke="var(--pm-color-pointer-stroke)" stroke-width="1.6" stroke-linecap="round" /></svg>`
/** A marker pen leaning right, its nib at the bottom left of a 100 × 100 box. */
const PEN = (inkVar: string) => `<svg class="pt__pen" viewBox="0 0 100 100" aria-hidden="true">
  <path d="M2 98 L5 84 L16 95 Z" fill="${inkVar}" />
  <path d="M5 84 L14 75 L25 86 L16 95 Z" fill="var(--pm-color-pointer-fill)" stroke="var(--pm-color-pointer-stroke)" stroke-width="2" stroke-linejoin="round" />
  <path d="M14 75 L74 15 L85 26 L25 86 Z" fill="var(--pm-color-pointer-fill)" stroke="var(--pm-color-pointer-stroke)" stroke-width="2" stroke-linejoin="round" />
  <path d="M60 29 L71 18 L82 29 L71 40 Z" fill="${inkVar}" />
  <path d="M74 15 L84 5 Q88 2 92 6 L94 8 Q97 12 94 16 L85 26 Z" fill="var(--pm-color-pointer-stroke)" />
</svg>`

export type PointerKind = 'arrow' | 'beam' | 'touch' | 'pen'

/** The markup of one pointer; `kinds` it can switch between (by `show`), with a ring for clicks. */
export function pointer(cls: string, kinds: PointerKind[], inkVar = 'var(--pm-color-accent)'): string {
  const parts = kinds.map(k => {
    if (k === 'arrow') return `<div class="pt__k" data-k="arrow">${ARROW}</div>`
    if (k === 'beam') return `<div class="pt__k" data-k="beam">${BEAM}</div>`
    if (k === 'touch') return `<div class="pt__k" data-k="touch"><div class="pt__disc"></div></div>`
    return `<div class="pt__k" data-k="pen">${PEN(inkVar)}</div>`
  })
  return `<div class="pt ${cls}"><div class="pt__ring"></div>${parts.join('')}</div>`
}

export interface Placement { x: number, y: number, scale?: number, opacity?: number, ring?: number, rotate?: number }

/** Puts the hot spot at (x %, y %); `ring` 0..1 is a click ring's progress (0 = none). */
export function place(el: HTMLElement, { x, y, scale = 1, opacity = 1, ring = 0, rotate = 0 }: Placement) {
  el.style.left = `${x}%`
  el.style.top = `${y}%`
  el.style.transform = `scale(${scale.toFixed(4)}) rotate(${rotate.toFixed(2)}deg)`
  el.style.opacity = opacity.toFixed(3)
  const r = el.querySelector<HTMLElement>('.pt__ring')
  if (r) {
    r.style.opacity = ring > 0 && ring < 1 ? (0.7 * (1 - ring)).toFixed(3) : '0'
    r.style.transform = `scale(${(0.2 + 0.8 * ring).toFixed(3)})`
  }
}

/** Shows one of the pointer's kinds; `mixTo` (0..1) cross-fades to a second one, for an arrow turning into an I-beam. */
export function show(el: HTMLElement, kind: PointerKind, mixTo?: PointerKind, u = 0) {
  el.querySelectorAll<HTMLElement>('.pt__k').forEach(k => {
    const name = k.dataset.k
    const o = name === kind ? (mixTo ? 1 - u : 1) : name === mixTo ? u : 0
    k.style.opacity = o.toFixed(3)
  })
}
