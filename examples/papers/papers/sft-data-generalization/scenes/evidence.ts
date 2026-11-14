import { C, svg, tx, path, rect, escape } from './visual.ts'
import type { Shot } from './visual.ts'
import budgetFigure from '../figures/budget.png'
import mixFigure from '../figures/mix.png'
import coverageFigure from '../figures/coverage.png'

const label = (s: Shot, index: number) => s.labels[index] ?? ''
const number = (s: Shot, index: number) => s.values?.[index] ?? 0

function figure(s: Shot): string {
  const figures: Record<string, string> = { budget: budgetFigure, mix: mixFigure, coverage: coverageFigure }
  const src = figures[s.figure ?? '']
  if (!src) return ''
  const note = (text: string, color: string = C.ink, large = false) =>
    '<div class="evidence-note" style="color:' + color + ';font-size:' + (large ? '2.65' : '1.95') + 'cqw">' + escape(text) + '</div>'
  let notes = ''
  if (s.figure === 'budget') {
    notes = note(label(s, 0), C.muted) + note(label(s, 1), C.orange, true) +
      note(label(s, 2), C.pink) + note(label(s, 3), C.orange) + note(label(s, 4), C.blue)
  } else if (s.figure === 'mix') {
    notes = note(label(s, 0), C.orange) + note(label(s, 1), C.blue) +
      note(label(s, 2), C.orange, true) + note(label(s, 3), C.pink)
  } else {
    notes = note(label(s, 0), C.muted) + note(label(s, 1), C.muted) +
      note(label(s, 2), C.orange, true) + note(label(s, 3))
  }
  // The paper raster remains intact and visible throughout; only the companion
  // scenes animate additions. Large Chinese notes carry the phone-sized reading.
  return '<style>.evidence-notes{position:absolute;left:72cqw;top:26cqh;width:25cqw;display:flex;flex-direction:column;gap:2.2cqh}.evidence-note{font-weight:700;line-height:1.35;overflow-wrap:anywhere}</style>' +
    '<div class="paper-figure"><img src="' + src + '" alt="' + escape(s.title) + '"></div>' +
    '<div class="evidence-notes">' + notes + '</div>'
}

function coverage(s: Shot): string {
  const total = number(s, 0), initial = number(s, 1), final = number(s, 2)
  let art = ''
  for (let i = 0; i < total; i++) {
    const x = 10 + (i % 23) * 3.75, y = 35 + Math.floor(i / 23) * 5.5
    // Empty sockets stay in the drawing. The new 31 fills are the only hidden
    // objects at the start, so the original 101 methods never disappear.
    art += '<circle cx="' + x + '" cy="' + y + '" r="1.22" fill="' + C.surface + '" stroke="' + C.line + '" stroke-width="0.3"/>'
    if (i < final) art += '<circle class="' + (i >= initial ? 'new-method' : '') + '" cx="' + x + '" cy="' + y + '" r="1.22" fill="' + C.orange + '"/>'
  }
  art += tx(label(s, 0), 122, 35, 4.2) + tx(label(s, 1), 122, 43, 2.9, C.muted)
  art += tx(label(s, 2), 122, 54, 3.6, C.orange) + tx(label(s, 3), 122, 65, 3.6, C.orange, 'middle', 'reveal')
  art += tx(label(s, 4), 51, 74, 2.6, C.muted)
  return svg(art)
}

function tail(s: Shot): string {
  const values = [number(s, 0), number(s, 1)]
  const maximum = Math.max(20, Math.ceil(Math.max(...values) / 20) * 20)
  const bottom = 66, height = 30, left = 17, right = 104
  let art = path(left, 35, left, bottom) + path(left, bottom, right, bottom)
  for (let tick = 0; tick <= maximum; tick += maximum / 3) {
    const y = bottom - tick / maximum * height
    art += '<path d="M' + left + ',' + y + ' H' + right + '" fill="none" stroke="' + C.line + '" stroke-width="0.2"/>'
    art += tx(String(Math.round(tick)), left - 4, y + 1, 2.5, C.muted, 'end')
  }
  values.forEach((value, i) => {
    const x = 29 + i * 42, h = value / maximum * height
    const color = i === 0 ? C.muted : C.orange
    art += rect(x, bottom - h, 24, h, color, i ? 'grow' : '', color)
    art += tx(label(s, i + 3), x + 12, bottom - h - 2.5, 5, color, 'middle', i ? 'reveal' : '')
    art += tx(label(s, i + 1), x + 12, 73, 3.1)
  })
  const meaning = label(s, 5)
  art += tx(label(s, 0), 131, 39, 4)
  art += tx(meaning.slice(0, 8), 131, 51, 3.2) + tx(meaning.slice(8), 131, 58, 3.2)
  return svg(art)
}

function scope(s: Shot): string {
  if (s.mode === 'models') {
    let art = tx(label(s, 0), 80, 32, 4.2)
    art += rect(21, 38, 53, 21) + rect(86, 38, 53, 21, C.surface, '', C.pink)
    art += tx(label(s, 1), 47.5, 52, 6, C.ink, 'middle', 'reveal')
    art += tx(label(s, 2), 112.5, 52, 6, C.pink, 'middle', 'reveal')
    art += rect(43, 65, 37, 6, C.orange, '', C.orange) + rect(80, 65, 37, 6, C.blue, '', C.blue)
    art += tx(label(s, 4), 61.5, 69.2, 2.0, C.ink) + tx(label(s, 5), 98.5, 69.2, 2.0, C.surface)
    art += tx(label(s, 3), 80, 74, 3.4)
    return svg(art)
  }
  let art = ''
  const xs = [8, 47, 86, 125]
  xs.forEach((x, i) => {
    art += rect(x, 37, 28, 19, C.surface, '', i === 0 ? C.orange : C.line)
    art += tx(label(s, i), x + 14, 48, 3.1)
    if (i < xs.length - 1) {
      art += path(x + 28, 46.5, x + 38, 46.5, C.line, 'ink-path')
      art += '<path d="M' + (x + 35) + ',44.8 l3,1.7 -3,1.7" fill="none" stroke="' + C.line + '" stroke-width="0.55"/>'
    }
  })
  // The short brace marks the controlled training stage; the long brace makes
  // the wider process visible without assigning an unreported total cost.
  art += '<path d="M86,59 v3 h28 v-3 M8,64 v3 h145 v-3" fill="none" stroke="' + C.line + '" stroke-width="0.5"/>'
  art += tx(label(s, 4), 80, 74, 3.5, C.ink, 'middle', 'reveal')
  return svg(art)
}

export function renderEvidence(s: Shot): string {
  if (s.kind === 'figure') return figure(s)
  if (s.kind === 'coverage') return coverage(s)
  if (s.kind === 'tail') return tail(s)
  if (s.kind === 'scope') return scope(s)
  return ''
}
