import { defineScene } from '@lincyaw/addon-motion/scene'
import { frame, pick } from '../../../lengths/scenes/kit/frame.ts'
import { ease } from '../../../lengths/scenes/kit/fx/time.ts'
import { beats, esc, num, oneOf, panel, PANEL_CSS, panelHtml, span } from './lib/stage.ts'

// Dolly zoom (the vertigo shot), with defineScene: the camera tracks away from the subject while the lens zooms in, so the
// subject holds its size and the world behind it rushes forward. States `a`, `dolly`, `b` (0.6 + 4.0 + 1.4 s).
// The effect is one constraint, not taste: the subject's size is focal length / distance, so the focal length is
// solved from the distance every frame (f = d), never keyframed beside it. Then a layer at depth z behind the
// subject is drawn at scale d / (d + z): the subject (z = 0) stays at 1, near layers barely change and far ones
// change most. `dolly`, 4 s on power2.inOut: d goes from 1400 to 2800 (`strength` 2; `direction: in` divides
// instead, and the world falls away). The world is five labelled frames of context at depths 0.25 to 2.8 times
// the start distance, joined at their corners by rails that converge on the vanishing point; every scale is
// computed in 2D from the projection, so nothing depends on the browser's 3D. `b`: the move has ended, the subject
// unchanged, its world rearranged. Use when the thing stays the same and its frame of reference changes: the
// same sentence in a longer context, the same result against a bigger corpus. Adapted from HyperFrames
// camera-dolly-zoom.
const D0 = 1400
const DEPTHS = [0.25, 0.6, 1.1, 1.8, 2.8].map(k => k * D0)
const START = [0.97, 0.8, 0.64, 0.47, 0.34]     // each frame's size on screen at the start, as a fraction of the frame

export default defineScene(ctx => {
  const { root, parameters } = ctx
  const a = panel(parameters.a, { kicker: '同一个词', title: '苹果', line: '意思由上下文决定' })
  const given = Array.isArray(parameters.layers) ? (parameters.layers as unknown[]).filter((v): v is string => typeof v === 'string') : []
  const labels = given.length ? given.slice(0, 5) : ['这句话', '这一段', '这篇文章', '这个领域', '全部语料']
  const strength = num(parameters.strength, 2, 1.1, 4)
  const d1 = oneOf(parameters.direction, ['out', 'in'] as const) === 'out' ? D0 * strength : D0 / strength
  const n = labels.length
  // World size of each frame, so that it shows at START[i] of the screen when the camera is at D0.
  const size = DEPTHS.slice(0, n).map((z, i) => START[i]! / (D0 / (D0 + z)))
  const el = frame(root, `${PANEL_CSS}
    .dz { position: absolute; inset: 0; background: var(--pm-color-bg); }
    .dz__svg { position: absolute; inset: 0; width: 100%; height: 100%; }
    .dz__frame { fill: none; stroke: var(--pm-color-line-strong); vector-effect: non-scaling-stroke; stroke-width: 1.5; }
    .dz__rail { fill: none; stroke: var(--pm-color-line); vector-effect: non-scaling-stroke; stroke-width: 1; }
    .dz__label { fill: var(--pm-color-muted); font-family: var(--pm-font-sans); }
    .dz__subject { position: absolute; left: 31cqw; top: 31cqh; width: 38cqw; height: 38cqh; border-radius: 1.4cqw; overflow: hidden;
      border: 0.2cqw solid var(--pm-color-accent); box-shadow: 0 1cqw 3cqw color-mix(in oklab, var(--pm-color-shadow) 14%, transparent); }
    .dz__subject .lf-title { font-size: 4.6cqw; }
    .dz__subject .lf-lead { font-size: 2.2cqw; }
  `, `<div class="dz"><svg class="dz__svg" viewBox="0 0 160 90" preserveAspectRatio="none" aria-hidden="true">
      <path class="dz__rail" />${labels.map((l, i) => `<rect class="dz__frame" style="opacity: ${1 - i * 0.14}" /><text class="dz__label">${esc(l)}</text>`).join('')}
    </svg><div class="dz__subject">${panelHtml(a, 'accent')}</div></div>`)
  const rects = [...el.querySelectorAll<SVGRectElement>('.dz__frame')]
  const texts = [...el.querySelectorAll<SVGTextElement>('.dz__label')]
  const rail = pick<SVGPathElement>(el, '.dz__rail')
  const { at, len } = beats(ctx)
  const dolly = ease.inOut3

  return (ms: number) => {
    const t = ms / 1000
    const d = D0 + (d1 - D0) * dolly(span(t, at(1), len(1) || 4))
    const corners: [number, number, number, number][] = []
    DEPTHS.slice(0, n).forEach((z, i) => {
      const s = size[i]! * (d / (d + z))    // f = d: the subject plane is drawn at 1
      const w = 80 * s, h = 45 * s
      rects[i]!.setAttribute('x', (80 - w).toFixed(3)); rects[i]!.setAttribute('y', (45 - h).toFixed(3))
      rects[i]!.setAttribute('width', (2 * w).toFixed(3)); rects[i]!.setAttribute('height', (2 * h).toFixed(3))
      texts[i]!.setAttribute('x', (80 - w + 2.2 * s).toFixed(3)); texts[i]!.setAttribute('y', (45 - h + 5 * s).toFixed(3))
      texts[i]!.setAttribute('font-size', (3.6 * s).toFixed(3))
      corners.push([80 - w, 45 - h, 80 + w, 45 + h])
    })
    // Four rails through the frames' corners, from the nearest to the farthest.
    const rail4 = [[0, 1], [2, 1], [2, 3], [0, 3]].map(([xi, yi]) => `M ${corners.map(c => `${c[xi!]!.toFixed(2)} ${c[yi!]!.toFixed(2)}`).join(' L ')}`)
    rail.setAttribute('d', rail4.join(' '))
  }
})
