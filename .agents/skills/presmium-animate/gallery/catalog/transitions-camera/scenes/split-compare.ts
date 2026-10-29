import { defineScene } from '@lincyaw/addon-motion/scene'
import { frame, pick } from '../../../lengths/scenes/kit/frame.ts'
import { hash } from '../../../lengths/scenes/kit/fx/random.ts'
import { bezier, mix } from '../../../lengths/scenes/kit/fx/time.ts'
import { beats, esc, num, oneOf, panel, span } from './lib/stage.ts'

// Split compare, with defineScene: the same picture twice, before and after, and a hard edge that sweeps the "after" over
// the "before", stops halfway so both can be compared side by side, then commits. States `before`, `sweep`,
// `compare`, `commit`, `after` (0.7 + 1.6 + 1.5 + 1.2 + 1.5 s). `before`: the plate settles from 105% (0.62 s,
// cubic-bezier(.16,.84,.24,1)) and its tag rises 0.36 s in. `sweep`, 1.6 s on cubic-bezier(.62,0,.14,1), slow to
// leave and slow to land: the edge carries "after" from the left to `split` (62%) of the plate, the edge line fading
// in over its first 0.2 s, the "after" tag rising 0.46 s in. `compare`: the edge stands still (the source held
// 0.8 s; here 1.5 s, long enough to look at both halves). `commit`, 1.2 s on cubic-bezier(.4,0,.05,1), which leaves
// fast and lands softly: "after" takes the rest, the "before" tag fades (0.5 s), the edge fades in the last 0.3 s
// of travel, and the plate pushes in to 103% over 1.5 s, which lands the result instead of stopping on it. `after`:
// hold. The default plate is a chart drawn from the parameters' seed: noisy samples, and the same samples with the
// filtered curve; give `a.image` and `b.image` (same size) to compare two pictures. Use for any before and after of
// the same thing: denoising, a fix, a rendering, a refactored figure. Adapted from HyperFrames grade-split-reveal.
const EASE_PLATE = bezier(0.16, 0.84, 0.24, 1)
const EASE_WIPE = bezier(0.62, 0, 0.14, 1)
const EASE_COMMIT = bezier(0.4, 0, 0.05, 1)
const EASE_TAG = bezier(0.22, 0.8, 0.3, 1)
const EASE_FADE = bezier(0.4, 0, 0.7, 1)

/** The default plate: one signal sampled with noise, drawn raw (before) or with its smooth curve (after). */
function plate(after: boolean, seed: number): string {
  const W = 196, H = 100, N = 64
  const clean = (x: number) => 50 - 26 * Math.sin(x * Math.PI * 2.2) * Math.exp(-x * 0.9) - 8 * x
  const pts = Array.from({ length: N }, (_, i) => {
    const x = i / (N - 1), noise = (hash(seed, i) + hash(seed, i, 7) - 1) * 26
    return { x: 8 + x * (W - 16), y: clean(x) + noise, c: clean(x) }
  })
  const grid = [20, 40, 60, 80].map(y => `<line x1="8" x2="${W - 8}" y1="${y}" y2="${y}" stroke="var(--pm-color-line)" stroke-width="1" vector-effect="non-scaling-stroke" />`).join('')
  const raw = `<polyline points="${pts.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ')}" fill="none" stroke="${after ? 'var(--pm-color-line-strong)' : 'var(--pm-color-ink)'}" stroke-width="${after ? 1 : 1.6}" vector-effect="non-scaling-stroke" />`
  const dots = pts.map(p => `<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="1.1" fill="${after ? 'var(--pm-color-line-strong)' : 'var(--pm-color-ink)'}" />`).join('')
  const smooth = after ? `<polyline points="${pts.map(p => `${p.x.toFixed(2)},${p.c.toFixed(2)}`).join(' ')}" fill="none" stroke="var(--pm-color-accent)" stroke-width="4" stroke-linecap="round" vector-effect="non-scaling-stroke" />` : ''
  return `<svg class="sc__svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">${grid}${after ? '' : raw}${dots}${smooth}</svg>`
}

export default defineScene(ctx => {
  const { root, parameters } = ctx
  const a = panel(parameters.a, { title: '滤波前' }), b = panel(parameters.b, { title: '滤波后' })
  const split = num(parameters.split, 62, 25, 85)
  const edge = oneOf(parameters.edge, ['hairline', 'bold', 'hidden'] as const)
  const seed = num(parameters.seed, 7)
  const note = typeof parameters.note === 'string' ? parameters.note : '示例数据'
  const art = (p: typeof a, after: boolean) => (p.image ? `<img class="sc__img" src="${esc(p.image)}" alt="" />` : plate(after, seed))
  const el = frame(root, `
    .sc { position: absolute; inset: 0; background: var(--pm-color-bg); }
    .sc__plate { position: absolute; left: 8cqw; top: 12cqh; width: 84cqw; height: 76cqh; border-radius: 1.2cqw; overflow: hidden;
      border: 0.18cqw solid var(--pm-color-line-strong); transform-origin: 50% 50%; }
    .sc__layer { position: absolute; inset: 0; }
    .sc__before { background: var(--pm-color-surface); }
    .sc__after { background: var(--pm-color-accent-soft); }
    .sc__svg, .sc__img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .sc__edge { position: absolute; top: 0; bottom: 0; left: 0; width: ${edge === 'bold' ? 0.6 : 0.25}cqw; margin-left: -${edge === 'bold' ? 0.3 : 0.125}cqw;
      background: var(--pm-color-accent); opacity: 0; ${edge === 'hidden' ? 'display: none;' : ''} }
    .sc__tag { position: absolute; top: 2.4cqh; opacity: 0; }
    .sc__tag--before { right: 1.6cqw; background: var(--pm-color-surface); color: var(--pm-color-ink); border: 0.15cqw solid var(--pm-color-line-strong); }
    .sc__tag--after { left: 1.6cqw; }
    .sc__note { position: absolute; right: 8cqw; bottom: 4.5cqh; }
  `, `<div class="sc"><div class="sc__plate">
      <div class="sc__layer sc__before">${art(a, false)}</div>
      <div class="sc__layer sc__after">${art(b, true)}</div>
      <div class="sc__edge"></div>
      <div class="lf-chip sc__tag sc__tag--before">${esc(a.title)}</div><div class="lf-chip sc__tag sc__tag--after">${esc(b.title)}</div>
    </div>${note && !a.image ? `<div class="lf-caption sc__note">${esc(note)}</div>` : ''}</div>`)
  const plateEl = pick(el, '.sc__plate'), after = pick(el, '.sc__after'), edgeEl = pick(el, '.sc__edge')
  const tagBefore = pick(el, '.sc__tag--before'), tagAfter = pick(el, '.sc__tag--after')
  const { at } = beats(ctx)

  return (ms: number) => {
    const t = ms / 1000
    const c0 = at(3)
    const w = t < c0 ? split * EASE_WIPE(span(t, at(1), 1.6)) : mix(split, 100, EASE_COMMIT(span(t, c0, 1.2)))
    after.style.clipPath = `inset(0 ${(100 - w).toFixed(3)}% 0 0)`
    edgeEl.style.left = `${w}%`
    edgeEl.style.opacity = (EASE_FADE(span(t, at(1), 0.2)) * (1 - EASE_FADE(span(t, c0 + 0.95, 0.3)))).toFixed(3)
    const s = t < c0 ? mix(1.05, 1, EASE_PLATE(span(t, 0, 0.62))) : mix(1, 1.03, EASE_COMMIT(span(t, c0, 1.5)))
    plateEl.style.transform = `scale(${s.toFixed(4)})`
    const tb = EASE_TAG(span(t, 0.36, 0.34)), ta = EASE_TAG(span(t, at(1) + 0.46, 0.34))
    tagBefore.style.opacity = (0.82 * tb * (1 - EASE_FADE(span(t, c0, 0.5)))).toFixed(3)
    tagBefore.style.transform = `translateY(${(1 - tb).toFixed(3)}cqh)`
    tagAfter.style.opacity = ta.toFixed(3)
    tagAfter.style.transform = `translateY(${(1 - ta).toFixed(3)}cqh)`
  }
})
