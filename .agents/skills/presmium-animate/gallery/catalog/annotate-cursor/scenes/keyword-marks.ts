import { defineScene } from '@lincyaw/addon-motion/scene'
import { frame, pick } from '../../../lengths/scenes/kit/frame.ts'
import { ease } from '../../../lengths/scenes/kit/fx/time.ts'
import { seg, steps } from './lib/time.ts'
import { boil, curve, ink, mark, type Box, type Ink, type Shape } from './lib/ink.ts'

// Keyword marks, with defineScene: a sentence is read, then its keywords are marked one per step, each in
// its own hand-drawn style (underline, loop, highlighter band, strike, box or bracket), and a mark may carry a short
// note joined to it by a thin drawn connector, the gesture of a Vox explainer. Aiming is by the words themselves: the
// scene finds each keyword's box on the stage when it paints, so the mark fits any font and line break. One state per
// keyword (`mark-1`, …). State 1: 0–0.55 s the sentence rises in; 0.9 s the first mark draws (0.6 s; a loop 0.8 s),
// thick where slow; at 60 % of the stroke the word takes the ink's colour and pops 6 % (the ink lands, then the word
// reacts). Later states start their mark at 0.15 s. With a note: 0.36 s into the mark the connector grows up from it
// (0.45 s), and the note fades in at its end (above the word on the first line, below it on a lower line) at 0.66 s, so mark, line and note read as one gesture. As each new mark
// starts, the earlier ones fade to 45 %: one focus. Finished marks boil every 1/8 s, so the hold lives. The look is a
// function of the time; the words' boxes are measured at each paint, so seeking in any order gives the same frame.
// Adapted from HyperFrames marker-highlight, vox-annotate, hw-underline and inline-highlight.

interface MarkParam { word: string, style?: Shape, note?: string }
const DEFAULT_MARKS: MarkParam[] = [
  { word: '每个词', style: 'underline' },
  { word: '所有词', style: 'loop' },
  { word: '加权平均', style: 'highlight', note: '权重 = softmax(相似度)' },
]
const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

export default defineScene(({ root, at, durations, total, parameters }) => {
  const text = (parameters.text as string | undefined) ?? '注意力把每个词的表示，变成所有词表示的加权平均。'
  const inkName = (parameters.ink as string | undefined) ?? 'accent'
  const inkVar = `var(--pm-color-${inkName})`
  const { starts, n } = steps(at, durations, total)
  const marks = ((parameters.marks as MarkParam[] | undefined) ?? DEFAULT_MARKS).slice(0, n)
  // Split the sentence at the first occurrence of each keyword, in reading order.
  const found = marks.map((m, i) => ({ ...m, i, at: text.indexOf(m.word) })).filter(m => m.at >= 0).sort((a, b) => a.at - b.at)
  let html = '', from = 0
  for (const m of found) {
    if (m.at < from) continue
    html += escape(text.slice(from, m.at)) + `<span class="km-w" data-w="${m.i}"><span class="km-in">${escape(m.word)}</span></span>`
    from = m.at + m.word.length
  }
  html += escape(text.slice(from))

  const f = frame(root, `
    .km { position: absolute; left: 10%; right: 10%; top: 0; bottom: 0; display: flex; align-items: center; justify-content: center; text-align: center; font: 500 4.4cqw/1.7 var(--pm-font-serif); }
    .km-w { display: inline-block; white-space: nowrap; }
    .km-in { display: inline-block; }
    .km-ink { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
    .km-ink path { fill: ${inkVar}; }
    .km-ink--under path { fill: color-mix(in oklab, ${inkVar} 30%, transparent); }
    .km-note { position: absolute; transform: translate(-50%, -100%); padding: 0.5cqw 1cqw; border-radius: 0.5cqw; font: 500 1.9cqw/1.2 var(--pm-font-mono); color: ${inkVar}; background: var(--pm-color-surface); border: 0.15cqw solid ${inkVar}; white-space: nowrap; }
  `, `
    <svg class="km-ink km-ink--under" viewBox="0 0 1600 900" aria-hidden="true">${marks.map((_, i) => `<g data-u="${i}"><path /></g>`).join('')}</svg>
    <div class="km"><div class="km-line">${html}</div></div>
    <svg class="km-ink" viewBox="0 0 1600 900" aria-hidden="true">${marks.map((_, i) => `<g data-o="${i}"><path /><path data-c /></g>`).join('')}</svg>
    ${marks.map((m, i) => (m.note ? `<div class="km-note" data-n="${i}">${escape(m.note)}</div>` : '')).join('')}`)
  const line = pick(f, '.km-line')

  const cache = new Map<string, { drawn: Ink, under: boolean, link?: Ink, note?: [number, number], below?: boolean, box: Box }>()
  const measure = (i: number) => {
    const w = f.querySelector<HTMLElement>(`[data-w="${i}"]`)
    if (!w) return undefined
    const fr = f.getBoundingClientRect(), r = w.getBoundingClientRect()
    if (!fr.width) return undefined
    const box: Box = { x: ((r.left - fr.left) / fr.width) * 100, y: ((r.top - fr.top) / fr.height) * 100, w: (r.width / fr.width) * 100, h: (r.height / fr.height) * 100 }
    const key = `${i}:${box.x.toFixed(2)},${box.y.toFixed(2)},${box.w.toFixed(2)},${box.h.toFixed(2)}`
    let got = cache.get(key)
    if (!got) {
      const m = marks[i]!
      const made = mark(m.style ?? 'underline', { x: box.x, y: box.y + box.h * 0.12, w: box.w, h: box.h * 0.76 }, 5 + i * 9)
      got = { drawn: ink(made.strokes, { width: made.width }), under: made.under, box }
      if (m.note) {
        // Above the word on the first line, below it on a lower one, so the note never sits on the sentence.
        const lr = line.getBoundingClientRect(), below = r.top - lr.top > r.height * 0.5, nx = box.x + box.w / 2, ny = below ? box.y + box.h + 13 : Math.max(14, box.y - 13)
        got.note = [nx, ny]
        got.below = below
        got.link = ink([below ? curve([nx + 0.5, box.y + box.h + 1.5], [nx + 2, ny - 1], -0.2) : curve([nx + 0.5, box.y - 0.5], [nx + 2, ny + 1], 0.2)], { width: [3, 5] })
      }
      cache.set(key, got)
    }
    return got
  }

  const paint = (t: number) => {
    const rise = seg(t, starts[0]!, 0.55, ease.out3)
    line.style.opacity = rise.toFixed(3)
    line.style.transform = `translateY(${((1 - rise) * 30).toFixed(1)}%)`
    marks.forEach((m, i) => {
      const s = starts[i]!, d0 = s + (i === 0 ? 0.9 : 0.15), dur = m.style === 'loop' ? 0.8 : 0.6
      const got = measure(i)
      const under = pick(f, `[data-u="${i}"]`), over = pick(f, `[data-o="${i}"]`)
      const g = got?.under ? under : over, other = got?.under ? over : under
      other.firstElementChild!.setAttribute('d', '')
      if (!got) return
      const fr = seg(t, d0, dur)
      g.firstElementChild!.setAttribute('d', got.drawn.d(fr))
      const dim = i + 1 < marks.length ? 1 - 0.55 * seg(t, starts[i + 1]!, 0.3) : 1
      g.setAttribute('opacity', dim.toFixed(3))
      g.setAttribute('transform', t > d0 + dur + 0.6 ? boil(t, 17 + i, (got.box.x + got.box.w / 2) * 16, (got.box.y + got.box.h / 2) * 9) : '')
      const inner = pick(f, `[data-w="${i}"] .km-in`)
      const hit = seg(t, d0 + dur * 0.6, 0.12)
      inner.style.color = hit > 0 ? (dim < 1 ? `color-mix(in oklab, ${inkVar} ${Math.round(dim * 100)}%, var(--pm-color-ink))` : inkVar) : ''
      const pop = t < d0 + dur * 0.6 ? 1 : t < d0 + dur * 0.6 + 0.12 ? 1 + 0.06 * seg(t, d0 + dur * 0.6, 0.12) : 1.06 - 0.06 * seg(t, d0 + dur * 0.6 + 0.12, 0.4, ease.backOut(2))
      inner.style.transform = `scale(${pop.toFixed(4)})`
      if (got.link && got.note) {
        const c = over.querySelector('[data-c]')!
        c.setAttribute('d', got.link.d(seg(t, d0 + 0.36, 0.45)))
        const note = pick(f, `[data-n="${i}"]`), u = seg(t, d0 + 0.66, 0.3, ease.out3)
        note.style.left = `${got.note[0] + 2}%`
        note.style.top = `${got.note[1]}%`
        note.style.opacity = (u * dim).toFixed(3)
        note.style.transform = `translate(-50%, ${((got.below ? 0 : -100) + (1 - u) * (got.below ? -30 : 30)).toFixed(1)}%)`
      }
    })
  }

  return (ms: number) => paint(ms / 1000)
})
