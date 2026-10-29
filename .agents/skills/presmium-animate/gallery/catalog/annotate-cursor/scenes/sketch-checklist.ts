import { defineScene } from '@lincyaw/addon-motion/scene'
import { frame, pick } from '../../../lengths/scenes/kit/frame.ts'
import { ease } from '../../../lengths/scenes/kit/fx/time.ts'
import { seg, steps } from './lib/time.ts'
import { boil, check, frameBox, ink, loop, underline, type Box, type Ink } from './lib/ink.ts'

// Sketch checklist, with defineScene: a paper card with a marker headline, underlined, one word of it
// circled, and a list whose boxes are ticked one per step: the goals of a lesson, ticked off as each is covered. State
// `title` (3 s): 0–0.45 s the card rises in; 0.3–0.75 s the headline rises; 0.85–1.35 s an underline swipes under it;
// 1.45–2.15 s a loop goes around the key word (the second mark lands only after the first: one focus); 2.2 s the rows
// enter with their empty boxes, 70 ms apart. Then one state per row (`check-1`, …, about 1.4 s): 0.1–0.5 s the tick
// draws in the success colour, a short stroke down and a long one up, thick where the pen slows; at 0.45 s the row's
// text deepens from muted to ink, the tick landing first. Ticks and marks boil every 1/8 s. The headline's word boxes
// are measured when each frame is painted, so the marks fit any font. Adapted from HyperFrames marker-checklist-card.

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')

export default defineScene(({ root, at, durations, total, parameters }) => {
  const title = (parameters.title as string | undefined) ?? '读懂注意力的三步'
  let keyword = (parameters.keyword as string | undefined) ?? '三步'
  if (!title.includes(keyword)) keyword = ''
  const items = ((parameters.items as string[] | undefined) ?? ['算相似度：Q 乘 K', '归一化：softmax', '加权求和：乘以 V']).slice(0, Math.max(0, durations.length - 1))
  const { starts, end } = steps(at, durations, total)
  const k = keyword ? title.indexOf(keyword) : -1
  const head = k < 0 ? escape(title) : `${escape(title.slice(0, k))}<span class="ck-key">${escape(keyword)}</span>${escape(title.slice(k + keyword.length))}`
  const rowY = (i: number) => 44 + i * (36 / Math.max(3, items.length))
  const boxes: Box[] = items.map((_, i) => ({ x: 32, y: rowY(i), w: 3.4, h: 6 }))
  const boxInk = boxes.map((b, i) => ink(frameBox({ x: b.x + 0.6, y: b.y + 0.9, w: b.w - 1.2, h: b.h - 1.8 }, 60 + i), { width: [3, 5] }))
  const ticks = boxes.map(b => ink(check({ x: b.x + 0.2, y: b.y - 1.5, w: b.w + 1.4, h: b.h + 1.5 }), { width: [5, 11] }))

  const f = frame(root, `
    .ck-card { position: absolute; left: 25%; top: 9%; width: 50%; height: 82%; }
    .ck-head { position: absolute; left: 25%; width: 50%; top: 16%; text-align: center; font: 600 4.2cqw/1.3 var(--pm-font-serif); white-space: nowrap; }
    .ck-head span.ck-in { display: inline-block; }
    .ck-key { display: inline-block; }
    .ck-row { position: absolute; left: 38%; display: flex; align-items: center; font: 500 2.5cqw/1 var(--pm-font-sans); color: var(--pm-color-muted); white-space: nowrap; }
    .ck-ink { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
    .ck-ink path { fill: var(--pm-color-accent); }
    .ck-ink .ck-box { fill: var(--pm-color-line-strong); }
    .ck-ink .ck-tick { fill: var(--pm-color-ok); }
  `, `
    <div class="ck-card lf-card"></div>
    <div class="ck-head"><span class="ck-in">${head}</span></div>
    ${items.map((s, i) => `<div class="ck-row" data-r="${i}" style="top:${rowY(i)}%;height:6%">${escape(s)}</div>`).join('')}
    <svg class="ck-ink" viewBox="0 0 1600 900" aria-hidden="true"><g data-m><path data-u /><path data-o /></g>
      ${items.map((_, i) => `<g data-i="${i}"><path class="ck-box" /><path class="ck-tick" /></g>`).join('')}</svg>`)
  const card = pick(f, '.ck-card'), headEl = pick(f, '.ck-head'), marks = pick(f, 'g[data-m]')
  const cache = new Map<string, { u: Ink, o?: Ink }>()
  const s0 = starts[0]!

  const pctBox = (el: Element): Box | undefined => {
    const fr = f.getBoundingClientRect(), r = el.getBoundingClientRect()
    if (!fr.width) return undefined
    return { x: ((r.left - fr.left) / fr.width) * 100, y: ((r.top - fr.top) / fr.height) * 100, w: (r.width / fr.width) * 100, h: (r.height / fr.height) * 100 }
  }

  const paint = (t: number) => {
    const c = seg(t, s0, 0.45, ease.out3), h = seg(t, s0 + 0.3, 0.45, ease.out3)
    card.style.opacity = c.toFixed(3)
    card.style.transform = `translateY(${((1 - c) * 3).toFixed(2)}cqw)`
    headEl.style.opacity = h.toFixed(3)
    headEl.style.transform = `translateY(${((1 - h) * 1.5).toFixed(2)}cqw)`
    // The marks are drawn once the headline has settled, from its measured boxes.
    if (t >= s0 + 0.75) {
      const all = pctBox(pick(headEl, '.ck-in')), key = keyword ? pctBox(pick(headEl, '.ck-key')) : undefined
      if (all) {
        const id = `${all.x.toFixed(2)},${all.y.toFixed(2)},${all.w.toFixed(2)}${key ? `,${key.x.toFixed(2)}` : ''}`
        let m = cache.get(id)
        if (!m) {
          const tight = (b: Box): Box => ({ x: b.x, y: b.y + b.h * 0.15, w: b.w, h: b.h * 0.7 })
          m = { u: ink(underline(tight(all), 3), { width: [5, 12] }), o: key ? ink(loop(tight(key), 8), { width: [4, 10] }) : undefined }
          cache.set(id, m)
        }
        pick(marks, '[data-u]').setAttribute('d', m.u.d(seg(t, s0 + 0.85, 0.5)))
        pick(marks, '[data-o]').setAttribute('d', m.o ? m.o.d(seg(t, s0 + 1.45, 0.7)) : '')
      }
    } else {
      pick(marks, '[data-u]').setAttribute('d', '')
      pick(marks, '[data-o]').setAttribute('d', '')
    }
    marks.setAttribute('transform', t > s0 + 2.2 ? boil(t, 7, 800, 200, 0.7) : '')
    items.forEach((_, i) => {
      const r = pick(f, `[data-r="${i}"]`), u = seg(t, s0 + 2.2 + i * 0.07, 0.4, ease.out3)
      const g = pick(f, `g[data-i="${i}"]`), tickAt = (starts[i + 1] ?? end) + 0.1
      r.style.opacity = u.toFixed(3)
      r.style.transform = `translateY(${((1 - u) * 1.2).toFixed(2)}cqw)`
      r.style.color = t >= tickAt + 0.35 ? 'var(--pm-color-ink)' : ''
      pick(g, '.ck-box').setAttribute('d', boxInk[i]!.d(seg(t, s0 + 2.2 + i * 0.07, 0.35)))
      pick(g, '.ck-tick').setAttribute('d', ticks[i]!.d(seg(t, tickAt, 0.4)))
      g.setAttribute('transform', t > tickAt + 0.5 ? boil(t, 100 + i, (boxes[i]!.x + 2) * 16, (boxes[i]!.y + 3) * 9, 0.6) : '')
    })
  }
  return (ms: number) => paint(ms / 1000)
})
