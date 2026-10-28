// Remotion helpers for the fx scenes. A scene gets React from its context, so the element builders take
// `React.createElement` as their first argument; ids come from `fx/ids.ts` (`uid`, once per scene instance).
import type { createElement, ReactNode } from 'react'

type H = typeof createElement

/** Clamp both ends of an `interpolate`: the default keeps going past the range. */
export const CLAMP = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const

/**
 * The same ease, rescaled to start at exactly 0 and end at exactly 1. Remotion's `Easing.exp` is 2^-10 at 0, so
 * `Easing.inOut(Easing.exp)` rests 0.05% short at both ends: 0.6 px of a 1280 px move, a soft edge and a sliver of
 * the other panel.
 */
export function exact(ease: (t: number) => number): (t: number) => number {
  const a = ease(0), b = ease(1)
  return t => (t <= 0 ? 0 : t >= 1 ? 1 : (ease(t) - a) / (b - a))
}

/**
 * A motion trail: the same pure picture drawn at `layers` earlier fractional frames, `lag` frames apart and
 * fainter the older they are, under the picture at `frame`. `moving(f)` says whether the pose at f differs from
 * the rest pose; copies of a resting pose would only thicken the edges, so they are left out.
 */
export function trail(h: H, frame: number, draw: (f: number) => ReactNode, { layers = 4, lag = 0.6, opacity = 0.35, moving = () => true }: { layers?: number, lag?: number, opacity?: number, moving?: (f: number) => boolean } = {}): ReactNode {
  const copies: ReactNode[] = []
  for (let j = 0; j < layers; j++) {
    const f = frame - (layers - j) * lag
    if (!moving(f)) continue
    copies.push(h('div', { key: j, style: { position: 'absolute', inset: 0, opacity: (opacity * (j + 1)) / (layers + 1) } }, draw(f)))
  }
  return h('div', { style: { position: 'absolute', inset: 0 } }, ...copies, h('div', { key: 'now', style: { position: 'absolute', inset: 0 } }, draw(frame)))
}

/**
 * A directional (motion) blur for `filter: url(#id)` on an HTML element: CSS `blur()` is the same in every
 * direction and reads as defocus, `feGaussianBlur` takes "x y". The region is widened so the smear is not clipped.
 */
export function directionalBlur(h: H, id: string, bx: number, by = 0): ReactNode {
  return h('svg', { width: 0, height: 0, style: { position: 'absolute' }, 'aria-hidden': true },
    h('filter', { id, x: '-20%', y: '-20%', width: '140%', height: '140%', colorInterpolationFilters: 'sRGB' },
      h('feGaussianBlur', { stdDeviation: `${bx.toFixed(2)} ${by.toFixed(2)}` })))
}

/**
 * The width of a one-line label in em, from its characters, for a box that must be sized before any font loads:
 * CJK and full-width forms are 1 em in every font; Latin is estimated a little wide, so the box always fits.
 */
export function labelEm(text: string): number {
  let em = 0
  for (const ch of text) {
    const c = ch.codePointAt(0)!
    if (c >= 0x2e80) em += 1
    else if (ch === ' ') em += 0.28
    else if (/[A-Z0-9]/.test(ch)) em += 0.66
    else if (/[ilj.,:;'!|]/.test(ch)) em += 0.3
    else em += 0.56
  }
  return em
}
