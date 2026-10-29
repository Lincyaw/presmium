import { defineScene } from '@lincyaw/addon-motion/scene'
import { frame, pick } from '../../../lengths/scenes/kit/frame.ts'
import { backdrop, BACKDROP_CSS, FORMULA, guides } from './lib/backdrop.ts'
import { ease, mix } from '../../../lengths/scenes/kit/fx/time.ts'
import { seg, steps } from './lib/time.ts'
import { boil, ink, mark, readBox, type Box, type Ink, type Pt, type Shape } from './lib/ink.ts'
import { place, pointer, POINTER_CSS, show } from './lib/pointer.ts'

// Pen annotate, with defineScene: a marker pen comes onto the stage and hand-draws one mark per step around
// a target given in stage percent (a loop, an underline, a highlighter band, a strike, a box, a bracket or an arrow),
// the ink laid exactly under its nib, then lifts, steps aside and the mark's label appears. One state per mark
// (`mark-1`, `mark-2`, …; about 2.4 s each, the last longer for the hold). In each state: 0–0.5 s the pen glides from
// where it rested (the first time from off the stage, bottom right) to the start of the mark, both ends eased, so
// the eye arrives with it; 0.5 s it touches down; 0.55 s on it draws (an underline 0.55 s, a loop or a box 1 s, an
// arrow 0.9 s with a lift between shaft and head), thick where it moves slowly and thin where it is fast, because a
// real marker lays more ink when it slows; then it lifts and steps 3 % right and 5 % down, so it never covers the mark,
// and only then does the label rise in (cause before effect). As the next mark's pen touches down, the earlier marks
// fade to 40 %: one focus at a time. Finished marks boil, re-posed a fraction of a percent every 1/8 s, so the hold
// lives. In the last state the pen leaves 0.7 s after lifting, and the marks hold alone. The look is a function of the
// time alone: the scene paints each frame from it. Adapted from HyperFrames cursor-annotate.

interface MarkParam extends Partial<Box> { shape?: Shape, label?: string, fromX?: number, fromY?: number }

const DEFAULT_MARKS: MarkParam[] = [
  { shape: 'loop', ...FORMULA.softmax, label: '变成概率' },
  { shape: 'underline', ...FORMULA.den, label: '按维度缩放' },
  { shape: 'arrow', ...FORMULA.v, fromX: 70, fromY: 82, label: '按权重求和' },
]
const DRAW: Record<Shape, number> = { loop: 1, box: 1, arrow: 0.9, underline: 0.55, highlight: 0.6, strike: 0.45, bracket: 0.6 }

export default defineScene(({ root, at, durations, total, parameters }) => {
  const inkName = (parameters.ink as string | undefined) ?? 'accent'
  const inkVar = `var(--pm-color-${inkName})`
  const { starts, n } = steps(at, durations, total)
  const given = (parameters.marks as MarkParam[] | undefined) ?? DEFAULT_MARKS
  const marks = given.slice(0, n).map((m, i) => {
    const shape = m.shape ?? 'loop'
    const box = readBox(m, { x: 40, y: 40, w: 20, h: 20 })
    const from: Pt | undefined = m.fromX !== undefined && m.fromY !== undefined ? [m.fromX, m.fromY] : undefined
    const made = mark(shape, box, 11 + i * 7, from)
    const drawn: Ink = ink(made.strokes, { width: made.width })
    const t0 = starts[i]!, draw = t0 + 0.55, lift = draw + DRAW[shape]
    const tail = from ?? [box.x - 12, box.y + box.h + 20]
    const label: Pt = shape === 'arrow' ? [tail[0], tail[1] + 1.5]
      : shape === 'loop' || shape === 'box' ? [box.x + box.w / 2, box.y - 12 < 3 ? box.y + box.h + 5 : box.y - 12]
        : [box.x + box.w / 2, box.y + box.h + 5]
    const rest: Pt = [drawn.end[0] / 16 + 3, drawn.end[1] / 9 + 5]
    return { i, shape, box, drawn, t0, draw, lift, under: made.under, label, text: m.label ?? '', rest, dur: DRAW[shape] }
  })

  const f = frame(root, `${BACKDROP_CSS}${POINTER_CSS}
    .pa-ink { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
    .pa-ink path { fill: ${inkVar}; }
    .pa-ink--under path { fill: color-mix(in oklab, ${inkVar} 30%, transparent); }
    .pa-label { position: absolute; transform: translateX(-50%); font: 600 2.4cqw/1.2 var(--pm-font-sans); color: ${inkVar}; white-space: nowrap; }
  `, `
    <svg class="pa-ink pa-ink--under" viewBox="0 0 1600 900" aria-hidden="true">${marks.map(m => (m.under ? `<g data-m="${m.i}"><path /></g>` : '')).join('')}</svg>
    ${backdrop(parameters, 'formula')}
    <svg class="pa-ink" viewBox="0 0 1600 900" aria-hidden="true">${marks.map(m => (m.under ? '' : `<g data-m="${m.i}"><path /></g>`)).join('')}</svg>
    ${marks.map(m => `<div class="pa-label" data-l="${m.i}" style="left:${m.label[0]}%;top:${m.label[1]}%">${m.text}</div>`).join('')}
    ${guides(parameters.guides)}
    <div class="pt-layer">${pointer('pa-pen', ['pen'], inkVar)}</div>`)
  const pen = pick(f, '.pa-pen')
  show(pen, 'pen')
  const groups = marks.map(m => pick<SVGGElement>(f, `g[data-m="${m.i}"]`))
  const labels = marks.map(m => pick(f, `[data-l="${m.i}"]`))
  const offstage: Pt = [108, 112]

  const paint = (t: number) => {
    let p: Pt = offstage, lifted = 1
    marks.forEach((m, j) => {
      const fr = seg(t, m.draw, m.dur)
      const g = groups[j]!
      g.firstElementChild!.setAttribute('d', m.drawn.d(fr))
      const next = marks[j + 1]
      const dim = next ? 1 - 0.6 * seg(t, next.t0 + 0.5, 0.3) : 1
      g.setAttribute('opacity', dim.toFixed(3))
      const [cx, cy] = [(m.box.x + m.box.w / 2) * 16, (m.box.y + m.box.h / 2) * 9]
      g.setAttribute('transform', t > m.lift ? boil(t, 31 + j, cx, cy) : '')
      const l = labels[j]!, u = seg(t, m.lift + 0.05, 0.4, ease.out3)
      l.style.opacity = (u * dim).toFixed(3)
      l.style.transform = `translate(-50%, ${((1 - u) * 40).toFixed(1)}%)`
      if (t < m.t0) return
      // The pen: glide to the start, draw, step aside.
      const before = j === 0 ? offstage : marks[j - 1]!.rest
      const startPt: Pt = [m.drawn.start[0] / 16, m.drawn.start[1] / 9]
      if (t < m.t0 + 0.5) {
        const u2 = seg(t, m.t0, 0.5, ease.inOut3)
        p = [mix(before[0], startPt[0], u2), mix(before[1], startPt[1], u2)]
        lifted = 1.06 - 0.06 * seg(t, m.t0 + 0.4, 0.1)
      } else if (t < m.lift) {
        const nib = m.drawn.nib(fr)
        p = [nib.p[0] / 16, nib.p[1] / 9]
        lifted = nib.down || fr === 0 ? 1 : 1.04
      } else {
        const u3 = seg(t, m.lift, 0.35, ease.out3)
        const endPt: Pt = [m.drawn.end[0] / 16, m.drawn.end[1] / 9]
        p = [mix(endPt[0], m.rest[0], u3), mix(endPt[1], m.rest[1], u3)]
        lifted = 1 + 0.06 * u3
        if (j === marks.length - 1) {
          const u4 = seg(t, m.lift + 0.7, 0.4, ease.in2)
          p = [mix(p[0], offstage[0], u4), mix(p[1], offstage[1], u4)]
        }
      }
    })
    place(pen, { x: p[0], y: p[1], scale: lifted })
  }

  return (ms: number) => paint(ms / 1000)
})
