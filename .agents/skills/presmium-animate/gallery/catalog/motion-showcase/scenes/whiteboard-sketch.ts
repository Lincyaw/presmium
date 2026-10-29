import { defineScene } from '@lincyaw/addon-motion/scene'
import { frame, pick } from '../../../lengths/scenes/kit/frame.ts'
import { handEllipse } from '../../../lengths/scenes/kit/fx/paths.ts'
import { mulberry32, range } from '../../../lengths/scenes/kit/fx/random.ts'
import { clamp01, ease, mix, phase } from '../../../lengths/scenes/kit/fx/time.ts'

// Whiteboard sketch, drawn by hand: a diagram appears one stroke at a time while a pen rides the tip of the stroke
// being drawn, as a teacher sketches at the board. Two states. `draw` (3.8 s): the strokes are drawn in order, each
// for a time that grows with its length (length^0.7, so short ticks are not lost and long lines do not drag), with
// power2.inOut inside a stroke like a hand that starts and stops; between strokes the pen lifts (grows 12%, its
// shadow drops away) and hops to the next start in 0.14 s. A box's word appears only when the box closes (cause,
// then effect). The last stroke, the loop around the key box, is in the accent. `caption` (2.6 s): 0–0.25 s the pen
// leaves towards the lower right, faster than it came; 0.15–0.6 s the caption rises in under the drawing; then the
// drawing holds. Every stroke is measured once (getTotalLength) and drawn with its dash offset; the pen's place is
// getPointAtLength of the same progress, so pen and ink are one mechanism under any seek. The wobble of the hand is
// seeded. Pass `strokes` (SVG path data, `accent` marks the highlighted one), `labels` and the `viewBox` that frames them to
// draw anything else. Adapted from HyperFrames whiteboard-ink.
interface Stroke { d: string, accent?: boolean }
interface Label { text: string, x: number, y: number, after: number }

/** A rectangle as a hand draws it: edges bow a little, the end runs past the start. */
function handRect(rng: () => number, x: number, y: number, w: number, h: number): string {
  const j = () => range(rng, -3, 3)
  const c: [number, number][] = [[x + j(), y + j()], [x + w + j(), y + j()], [x + w + j(), y + h + j()], [x + j(), y + h + j()]]
  let d = `M ${c[0]![0] + 10} ${c[0]![1] + j()}`
  for (let i = 1; i <= 4; i++) {
    const a = c[i - 1]!, b = c[i % 4]!
    d += ` Q ${(a[0] + b[0]) / 2 + j() * 1.5} ${(a[1] + b[1]) / 2 + j() * 1.5} ${b[0]} ${b[1]}`
  }
  return `${d} L ${c[1]![0] - w * 0.75} ${c[1]![1] + j()}`
}

function defaults(rng: () => number): { strokes: Stroke[], labels: Label[] } {
  const box = (x: number) => handRect(rng, x, 205, 200, 120)
  const arrow = (x0: number, x1: number) => [
    { d: `M ${x0} 266 Q ${(x0 + x1) / 2} ${258 + range(rng, -4, 4)} ${x1} 264` },
    { d: `M ${x1 - 20} 250 L ${x1 + 2} 264 L ${x1 - 20} 279` },
  ]
  return {
    strokes: [{ d: box(60) }, ...arrow(275, 385), { d: box(400) }, ...arrow(615, 725), { d: box(740) },
      { d: handEllipse(rng, 500, 265, 150, 98, 18), accent: true }],
    labels: [{ text: '数据', x: 160, y: 278, after: 0 }, { text: '模型', x: 500, y: 278, after: 3 }, { text: '预测', x: 840, y: 278, after: 6 }],
  }
}

export default defineScene(({ root, at, parameters }) => {
  const rng = mulberry32((parameters.seed as number | undefined) ?? 5)
  const preset = defaults(rng)
  const strokes = (parameters.strokes as Stroke[] | undefined) ?? preset.strokes
  const labels = (parameters.labels as Label[] | undefined) ?? preset.labels
  const viewBox = (parameters.viewBox as string | undefined) ?? (parameters.strokes ? '0 0 1000 560' : '30 140 940 260')
  const caption = (parameters.caption as string | undefined) ?? '从数据学一个映射，再用它做预测'
  const f = frame(root, `
    .wb { position: absolute; left: 6cqw; top: 18cqh; width: 88cqw; height: 50cqh; }
    .wb__ink { fill: none; stroke: var(--pm-color-ink); stroke-width: 5; stroke-linecap: round; stroke-linejoin: round; }
    .wb__ink--accent { stroke: var(--pm-color-accent); stroke-width: 6; }
    .wb__label { font-family: var(--pm-font-serif); font-weight: 600; fill: var(--pm-color-ink); text-anchor: middle; }
    .wb__caption { position: absolute; left: 0; right: 0; top: 78cqh; text-align: center; }
  `, `<svg class="wb" viewBox="${viewBox}" aria-hidden="true">
    ${strokes.map(s => `<path class="wb__ink${s.accent ? ' wb__ink--accent' : ''}" d="${s.d}" />`).join('')}
    ${labels.map(l => `<text class="wb__label" x="${l.x}" y="${l.y}" font-size="46">${l.text}</text>`).join('')}
    <g class="wb__pen">
      <ellipse class="wb__shadow" cx="6" cy="10" rx="13" ry="5" fill="var(--pm-color-ink)" opacity="0.15" />
      <g transform="rotate(35)">
        <rect x="-9" y="-70" width="18" height="54" fill="var(--pm-color-surface)" stroke="var(--pm-color-ink)" stroke-width="3" />
        <rect x="-9" y="-82" width="18" height="12" fill="var(--pm-color-accent)" stroke="var(--pm-color-ink)" stroke-width="3" />
        <path d="M 0 0 L -9 -16 L 9 -16 Z" fill="var(--pm-color-surface)" stroke="var(--pm-color-ink)" stroke-width="3" stroke-linejoin="round" />
        <path d="M 0 0 L -3.4 -6 L 3.4 -6 Z" fill="var(--pm-color-ink)" />
      </g>
    </g>
  </svg><div class="lf-lead wb__caption">${caption}</div>`)
  const paths = [...f.querySelectorAll<SVGPathElement>('.wb__ink')]
  const texts = [...f.querySelectorAll<SVGTextElement>('.wb__label')]
  const pen = pick<SVGGElement>(f, '.wb__pen'), shadow = pick<SVGEllipseElement>(f, '.wb__shadow')
  const cap = pick(f, '.wb__caption')
  const lens = paths.map(p => p.getTotalLength())
  paths.forEach((p, i) => { p.style.strokeDasharray = `${lens[i]} ${lens[i]}` })

  // The schedule: each stroke's start and length in seconds, hops between them.
  const HOP = 0.14, T0 = 0.2
  const drawTime = at(1) / 1000 - T0 - 0.3 - HOP * (paths.length - 1)
  const weights = lens.map(l => Math.max(l, 60) ** 0.7)
  const sum = weights.reduce((a, b) => a + b, 0)
  const spans: [number, number][] = []
  let t = T0
  for (const w of weights) { const d = (drawTime * w) / sum; spans.push([t, d]); t += d + HOP }
  const tip = (i: number, p: number) => paths[i]!.getPointAtLength(lens[i]! * clamp01(p))

  return (ms: number) => {
    const s = ms / 1000
    let x = 0, y = 0, lift = 0
    spans.forEach(([start, d], i) => {
      const p = ease.inOut2(phase(s, start, d))
      paths[i]!.style.strokeDashoffset = String(lens[i]! * (1 - p))
      paths[i]!.style.visibility = s < start ? 'hidden' : 'visible'
    })
    // Where the pen is: on a stroke, hopping between two, or before the first.
    const k = spans.findIndex(([start, d]) => s < start + d)
    if (k === -1) { const pt = tip(paths.length - 1, 1); x = pt.x; y = pt.y }
    else {
      const [start] = spans[k]!
      if (s >= start) { const pt = tip(k, ease.inOut2(phase(s, start, spans[k]![1]))); x = pt.x; y = pt.y }
      else if (k === 0) { const pt = tip(0, 0); x = pt.x + 40 * (1 - phase(s, 0, T0)); y = pt.y + 30 * (1 - phase(s, 0, T0)) }
      else {
        const u = ease.inOut2(phase(s, start - HOP, HOP))
        const a = tip(k - 1, 1), b = tip(k, 0)
        x = mix(a.x, b.x, u); y = mix(a.y, b.y, u); lift = Math.sin(Math.PI * u)
      }
    }
    // Leaving: the pen accelerates out towards the lower right once the drawing is done.
    const out = ease.in2(phase(s, at(1) / 1000, 0.25))
    x += out * 420; y += out * 320
    pen.setAttribute('transform', `translate(${x} ${y}) scale(${1 + 0.12 * lift})`)
    pen.style.opacity = String(1 - out)
    shadow.setAttribute('transform', `translate(${10 * lift} ${14 * lift})`)
    shadow.style.opacity = String(0.15 * (1 - 0.6 * lift))
    // A box's word appears once the box is closed.
    labels.forEach((l, i) => {
      const [start, d] = spans[l.after]!
      const p = ease.out3(phase(s, start + d, 0.3))
      texts[i]!.style.opacity = String(p)
      texts[i]!.setAttribute('transform', `translate(0 ${10 * (1 - p)})`)
    })
    const c = ease.outExpo(phase(s, at(1) / 1000 + 0.15, 0.45))
    cap.style.opacity = String(c)
    cap.style.transform = `translateY(${40 * (1 - c)}%)`
  }
})
