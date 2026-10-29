import { defineScene } from '@lincyaw/addon-motion/scene'
import { frame } from '../../../lengths/scenes/kit/frame.ts'
import { hash } from '../../../lengths/scenes/kit/fx/random.ts'
import { clamp01, mix } from '../../../lengths/scenes/kit/fx/time.ts'

// Stop motion, drawn on stepped time: the steps of a process land one by one as paper cut-outs, animated "on twos"
// like a hand-made film. Everything is driven by one quantized clock, ts = floor(t·fps)/fps (12 fps by default),
// so the picture changes only on those steps and any seek lands on the same step. Two states. `throw` (3 s): every
// 0.7 s the next shape is thrown in from the upper left on an arc, spinning, and lands on the line in its slot
// (0.45 s of flight, about five steps); on the landing step it squashes flat (125% wide, 70% tall, from its contact
// with the ground), then rebounds and settles over three steps, its shadow sharpening as it comes down; two
// sparkles flash for three steps above it, big and small alternating; its label appears on the step after the
// landing. `hold` (2 s): the row rests, and its edges "boil": every vertex is nudged by a hash of the shape, the
// vertex and the boil frame floor(step / 2), so the cut-outs breathe on twos like drawn frames. Turn the boil off
// (`boil: false`) for a dead-still hold. Adapted from HyperFrames stop-motion-cadence.
const W = 1280, H = 720, GROUND = 470
type Shape = 'circle' | 'square' | 'triangle' | 'star'
const SHAPES: Shape[] = ['circle', 'square', 'triangle', 'star']
const FILLS = ['accent', 'warn', 'ok', 'film-violet']

/** The outline of a shape of radius r around (0, 0), its bottom at y = 0, as points. */
function outline(shape: Shape, r: number): [number, number][] {
  const ring = (n: number, rad: (k: number) => number, a0 = -Math.PI / 2) =>
    Array.from({ length: n }, (_, k) => { const a = a0 + (2 * Math.PI * k) / n; return [rad(k) * Math.cos(a), rad(k) * Math.sin(a) - r] as [number, number] })
  if (shape === 'circle') return ring(20, () => r)
  if (shape === 'square') {
    const s = r * 0.88
    const pts: [number, number][] = []
    for (const [x0, y0, x1, y1] of [[-s, -s, s, -s], [s, -s, s, s], [s, s, -s, s], [-s, s, -s, -s]]) {
      for (let k = 0; k < 3; k++) pts.push([mix(x0!, x1!, k / 3), mix(y0!, y1!, k / 3) - s])
    }
    return pts
  }
  if (shape === 'triangle') return ring(3, () => r * 1.15, -Math.PI / 2).map(([x, y]) => [x, y + r * 0.42] as [number, number])
  return ring(10, k => (k % 2 ? r * 0.48 : r * 1.08)).map(([x, y]) => [x, y + r * 0.126] as [number, number])
}

export default defineScene(({ root, at, parameters }) => {
  const labels = (parameters.labels as string[] | undefined) ?? ['收集', '清洗', '训练', '评估']
  const fps = (parameters.fps as number | undefined) ?? 12
  const boil = (parameters.boil as boolean | undefined) ?? true
  const n = Math.min(4, labels.length)
  const R = 62, slot = (i: number) => W / 2 + (i - (n - 1) / 2) * 250
  const f = frame(root, '', `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" style="font-family: var(--pm-font-sans)" aria-hidden="true">
    <line x1="120" x2="${W - 120}" y1="${GROUND}" y2="${GROUND}" stroke="var(--pm-color-line-strong)" stroke-width="4" stroke-linecap="round" />
    ${Array.from({ length: n }, (_, i) => `
      <ellipse class="sm__shadow" cx="${slot(i)}" cy="${GROUND + 4}" rx="${R}" ry="9" fill="var(--pm-color-ink)" />
      <g class="sm__shape"><path class="sm__body" fill="var(--pm-color-${FILLS[i]})" stroke="var(--pm-color-ink)" stroke-width="4" stroke-linejoin="round" />
        <text y="${-R + 14}" text-anchor="middle" font-size="40" font-weight="700" fill="var(--pm-color-on-accent)">${i + 1}</text></g>
      <g class="sm__spark" transform="translate(${slot(i) + R * 0.9} ${GROUND - 2.3 * R})"><path d="M 0 -22 L 0 22 M -22 0 L 22 0" stroke="var(--pm-color-warn)" stroke-width="5" stroke-linecap="round" /></g>
      <g class="sm__spark" transform="translate(${slot(i) - R * 1.1} ${GROUND - 1.7 * R})"><path d="M 0 -14 L 0 14 M -14 0 L 14 0" stroke="var(--pm-color-warn)" stroke-width="4" stroke-linecap="round" /></g>
      <text class="sm__label" x="${slot(i)}" y="${GROUND + 72}" text-anchor="middle" font-size="40" font-weight="600" fill="var(--pm-color-ink)">${labels[i]}</text>`).join('')}
  </svg>`)
  const shapes = [...f.querySelectorAll<SVGGElement>('.sm__shape')]
  const bodies = [...f.querySelectorAll<SVGPathElement>('.sm__body')]
  const shadows = [...f.querySelectorAll<SVGEllipseElement>('.sm__shadow')]
  const sparks = [...f.querySelectorAll<SVGGElement>('.sm__spark')]
  const texts = [...f.querySelectorAll<SVGTextElement>('.sm__label')]
  const outlines = Array.from({ length: n }, (_, i) => outline(SHAPES[i]!, R))
  const throwSpan = at(1) / 1000
  const gap = Math.min(0.7, (throwSpan - 0.6) / Math.max(1, n - 1)), FLIGHT = 0.45
  const SQUASH: [number, number][] = [[1.25, 0.7], [0.9, 1.12], [1.05, 0.96]]

  return (ms: number) => {
    const step = Math.floor((ms / 1000) * fps)
    const ts = step / fps
    const frameNo = boil && ts >= 0.2 ? Math.floor(step / 2) : 0
    for (let i = 0; i < n; i++) {
      const t0 = 0.2 + i * gap, land = t0 + FLIGHT
      const p = clamp01((ts - t0) / FLIGHT)
      const visible = ts >= t0
      const x = mix(slot(i) - 320, slot(i), p)
      const y = mix(-140, GROUND, p * p) - 260 * Math.sin(Math.PI * p) * (1 - p) // falls faster as it nears the ground
      const rot = (1 - p) * -240
      const since = Math.round((ts - land) * fps)   // steps since the landing
      const [sx, sy] = since >= 0 && since < SQUASH.length ? SQUASH[since]! : [1, 1]
      shapes[i]!.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(1)}) scale(${sx} ${sy})`)
      shapes[i]!.style.display = visible ? '' : 'none'
      // The edges boil on twos: each vertex nudged by a hash of (shape, vertex, boil frame).
      const pts = outlines[i]!.map(([px, py], v) => [px + (hash(i, v, frameNo) - 0.5) * 5, py + (hash(i + 7, v, frameNo) - 0.5) * 5])
      bodies[i]!.setAttribute('d', `M ${pts.map(([a, b]) => `${a!.toFixed(1)} ${b!.toFixed(1)}`).join(' L ')} Z`)
      // The shadow is sharp and dark when the shape is down, faint and wide while it is high.
      const height = clamp01((GROUND - y) / 500)
      shadows[i]!.style.opacity = visible ? String(0.18 * (1 - height)) : '0'
      shadows[i]!.setAttribute('rx', String(R * (1 + 0.6 * height)))
      const flash = since >= 0 && since < 3
      sparks[2 * i]!.style.opacity = flash && since % 2 === 0 ? '1' : '0'
      sparks[2 * i + 1]!.style.opacity = flash && since % 2 === 1 ? '1' : '0'
      texts[i]!.style.opacity = since >= 1 ? '1' : '0'
    }
  }
})
