import { defineScene } from '@lincyaw/addon-motion/scene'
import { frame, pick } from '../../../lengths/scenes/kit/frame.ts'
import { ease, mix } from '../../../lengths/scenes/kit/fx/time.ts'
import { press, seg, steps } from './lib/time.ts'
import type { Pt } from './lib/ink.ts'
import { place, pointer, POINTER_CSS, show } from './lib/pointer.ts'

// Text select, with defineScene: an arrow comes onto a document, turns into an I-beam as it enters the
// text, drags a selection across a phrase character by character, and a small format toolbar rises over the
// selection; the I-beam turns back into an arrow, clicks Bold, and the phrase turns bold. For demonstrating an editing
// operation in a tool tutorial. Two states. `select` (2.2 s): 0–0.55 s the pointer glides from the lower right to just
// before the phrase, both ends eased, cross-fading to an I-beam over the last 30 % of the way (the shape changes where
// the text begins, as a real cursor does); 0.6 s it presses; 0.65–1.6 s it drags at a steady pace and the highlight
// grows behind it one character at a time; 1.65 s it releases; 1.75–2.1 s the toolbar fades up 1 % above the
// selection, centred on it. `format` (2.4 s): 0–0.45 s the pointer, an arrow again, moves to B; 0.5 s the press, the
// button takes the accent, and in the same frame the phrase turns bold (cause and effect together, as an editor
// does); 1.0–1.4 s the pointer drifts aside and the toolbar fades out, leaving the bold, selected phrase to read. The
// characters' positions are measured when each frame is painted, so the drag follows the text in any font. Adapted
// from HyperFrames cursor-text-select.

export default defineScene(({ root, at, durations, total, parameters }) => {
  const title = (parameters.title as string | undefined) ?? '第 3 讲 · 注意力'
  const text = (parameters.text as string | undefined) ?? '自注意力让序列中的每个位置都能直接看到其他所有位置，因此长距离依赖不再需要一步步传递。'
  let phrase = (parameters.phrase as string | undefined) ?? '直接看到其他所有位置'
  if (!text.includes(phrase)) phrase = text.slice(Math.floor(text.length / 3), Math.floor(text.length / 3) + 6)
  const { starts } = steps(at, durations, total)
  const s0 = starts[0]!, s1 = starts[1] ?? s0 + 2.2
  const k0 = text.indexOf(phrase), chars = [...phrase]
  const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const f = frame(root, `${POINTER_CSS}
    .ts-doc { position: absolute; left: 15%; top: 14%; width: 70%; height: 66%; padding: 5cqw 6cqw; }
    .ts-h { font: 600 3.2cqw/1.2 var(--pm-font-serif); margin-bottom: 2.4cqw; }
    .ts-p { font: 400 2.6cqw/1.9 var(--pm-font-serif); }
    .ts-c { position: relative; }
    .ts-c.is-sel { background: color-mix(in oklab, var(--pm-color-accent) 28%, transparent); }
    .ts-bar { position: absolute; display: flex; gap: 0.4cqw; padding: 0.5cqw; transform: translate(-50%, -100%); border-radius: 0.8cqw; background: var(--pm-color-surface); border: 0.15cqw solid var(--pm-color-line-strong); box-shadow: 0 0.4cqw 1.2cqw var(--pm-color-shadow); }
    .ts-bar span { width: 3.6cqw; height: 3.6cqw; display: grid; place-items: center; border-radius: 0.5cqw; font: 600 2cqw/1 var(--pm-font-serif); color: var(--pm-color-ink); }
    .ts-bar span:nth-child(2) { font-style: italic; }
    .ts-bar span:nth-child(3) { text-decoration: underline; }
  `, `
    <div class="ts-doc lf-card"><div class="ts-h">${escape(title)}</div>
      <div class="ts-p">${escape(text.slice(0, k0))}<span class="ts-ph">${chars.map(c => `<span class="ts-c">${escape(c)}</span>`).join('')}</span>${escape(text.slice(k0 + phrase.length))}</div></div>
    <div class="ts-bar"><span>B</span><span>I</span><span>U</span><span>¶</span></div>
    <div class="pt-layer">${pointer('ts-pt', ['arrow', 'beam'])}</div>`)
  const pt = pick(f, '.ts-pt'), bar = pick(f, '.ts-bar'), bold = pick(f, '.ts-bar span'), ph = pick(f, '.ts-ph')
  const cells = [...f.querySelectorAll<HTMLElement>('.ts-c')]
  const off: Pt = [90, 100]

  const pct = (r: DOMRect, fr: DOMRect, ux: number, uy: number): Pt => [((r.left + r.width * ux - fr.left) / fr.width) * 100, ((r.top + r.height * uy - fr.top) / fr.height) * 100]

  const paint = (t: number) => {
    const fr = f.getBoundingClientRect()
    if (!fr.width) return
    // DOM state first (what is selected, what is bold), then measure, then place the pointer and the toolbar.
    const drag = seg(t, s0 + 0.65, 0.95)
    const sel = t < s0 + 0.65 ? 0 : Math.round(drag * chars.length)
    const clickB = s1 + 0.5
    cells.forEach((c, i) => c.classList.toggle('is-sel', i < sel))
    ph.style.fontWeight = t >= clickB ? '700' : ''
    bold.style.background = t >= clickB ? 'var(--pm-color-accent)' : ''
    bold.style.color = t >= clickB ? 'var(--pm-color-on-accent)' : ''
    const first = cells[0]!.getBoundingClientRect(), last = cells[cells.length - 1]!.getBoundingClientRect()
    const startPt = pct(first, fr, 0, 0.5)
    const edge = (i: number): Pt => (i === 0 ? startPt : pct(cells[i - 1]!.getBoundingClientRect(), fr, 1, 0.5))
    // The toolbar centres over the selection's first line.
    const top = pct(first, fr, 0, 0)[1], left = startPt[0]
    const right = Math.abs(last.top - first.top) < 2 ? pct(last, fr, 1, 0)[0] : left + 14
    const barAt: Pt = [(left + right) / 2, top - 1]
    bar.style.left = `${barAt[0]}%`
    bar.style.top = `${barAt[1]}%`
    const b = bold.getBoundingClientRect(), bPt = pct(b, fr, 0.5, 0.55)
    const barIn = seg(t, s0 + 1.75, 0.35, ease.out3) * (1 - seg(t, s1 + 1.0, 0.35, ease.in2))
    bar.style.opacity = barIn.toFixed(3)
    bar.style.transform = `translate(-50%, calc(-100% + ${((1 - barIn) * 0.8).toFixed(2)}cqw))`

    let p: Pt = off, scale = 1.5, ring = 0
    if (t < s0 + 0.55) {
      const u = seg(t, s0, 0.55, ease.inOut3)
      p = [mix(off[0], startPt[0], u), mix(off[1], startPt[1], u)]
      show(pt, 'arrow', 'beam', seg(t, s0 + 0.38, 0.17))
    } else if (t < s1) {
      const x = drag * chars.length, i = Math.floor(x), m = x - i
      const a = edge(Math.min(i, chars.length)), z = edge(Math.min(i + 1, chars.length))
      p = [mix(a[0], z[0], m), mix(a[1], z[1], m)]
      scale = 1.5 * press(t, s0 + 0.6, 0.92)
      show(pt, 'beam')
    } else {
      const from = edge(chars.length), u = seg(t, s1, 0.45, ease.inOut3)
      p = [mix(from[0], bPt[0], u), mix(from[1], bPt[1], u)]
      show(pt, 'beam', 'arrow', seg(t, s1, 0.15))
      scale = 1.5 * press(t, clickB)
      ring = seg(t, clickB, 0.5, ease.out3)
      const aside = seg(t, s1 + 1.0, 0.4, ease.out3)
      p = [mix(p[0], p[0] + 6, aside), mix(p[1], p[1] + 12, aside)]
    }
    place(pt, { x: p[0], y: p[1], scale, ring })
  }
  return (ms: number) => paint(ms / 1000)
})
