import { gsapScene } from '@lincyaw/addon-motion/scene'
import { TYPE, frame } from '../../../lengths/scenes/kit/frame.ts'
import { grainMarkup } from './lib/grain.ts'

// A quotation from a historical source on paper: the grain layer of `lib/grain.ts` under a two-line quote and its
// citation, for a lesson that opens with what someone wrote (a paper, a letter, a law). The paper says "this is a
// document" without a word; the quote is the content. One state, `play` (5 s): 0–0.3 s the empty sheet; 0.3–0.75 s
// the first line rises out of its slot (a mask, not a fade); 0.9–1.35 s the second, key line rises the same way;
// 1.5–2.0 s a marker line draws under the key words, left to right; 2.3–2.7 s the citation rises, in the muted
// colour; 2.7–5 s hold, while the text block grows by 1% over the whole piece so the hold is alive. The grain is
// static by default (`flicker: 0`); with `flicker` (steps a second) its seed steps with the time in one stepped
// GSAP tween, so it is film grain that is still exact at every seek. Parameters: the quote's lines (the last one is
// marked), the citation, and the grain's strength, mottling and flicker.
// Adapted from HyperFrames grain-overlay and grain-field (and the paper board of yt-lcd-background).

export default gsapScene(({ root, gsap, total, parameters }) => {
  const lines = (parameters.lines as string[] | undefined) ?? ['“我建议考虑这样一个问题：', '机器能思考吗？”']
  const mark = (parameters.mark as string | undefined) ?? '机器能思考吗'
  const cite = (parameters.cite as string | undefined) ?? '图灵，《计算机器与智能》，1950'
  const strength = (parameters.strength as number | undefined) ?? 0.14
  const mottle = (parameters.mottle as number | undefined) ?? 0.035
  const flicker = (parameters.flicker as number | undefined) ?? 0
  const last = lines.length - 1
  const marked = (text: string) => {
    const at = text.indexOf(mark)
    return at < 0 ? text : `${text.slice(0, at)}<span class="pq-mark"><i class="pq-bar"></i>${mark}</span>${text.slice(at + mark.length)}`
  }
  const el = frame(root, `
    .pq-block { position: absolute; left: 12cqw; right: 12cqw; top: 50%; }
    .pq-slot { overflow: hidden; padding-bottom: 0.6cqh; }
    .pq-line { font: 400 ${TYPE.title * 0.8}cqw/1.3 var(--pm-font-serif); white-space: nowrap; }
    .pq-line.is-key { font-weight: 600; }
    .pq-mark { position: relative; isolation: isolate; }
    .pq-bar { position: absolute; left: -0.3cqw; right: -0.3cqw; bottom: 0.4cqh; height: 1.6cqh; background: var(--pm-color-accent); opacity: 0.35; transform-origin: 0 50%; z-index: -1; }
    .pq-cite { margin-top: 3cqh; font-size: ${TYPE.body}cqw; color: var(--pm-color-muted); white-space: nowrap; }
  `, `${grainMarkup({ strength, mottle })}
    <div class="pq-block">
      ${lines.map((l, i) => `<div class="pq-slot"><div class="pq-line${i === last ? ' is-key' : ''}">${i === last ? marked(l) : l}</div></div>`).join('')}
      <div class="pq-slot"><div class="pq-cite">${cite}</div></div>
    </div>`)
  const tl = gsap.timeline()
  const rows = el.querySelectorAll('.pq-line')
  gsap.set(rows, { yPercent: 105 })
  gsap.set('.pq-cite', { yPercent: 105, opacity: 0 })
  gsap.set('.pq-bar', { scaleX: 0 })
  rows.forEach((row, i) => tl.to(row, { yPercent: 0, duration: 0.45, ease: 'expo.out' }, 0.3 + i * 0.6))
  const after = 0.3 + last * 0.6 + 0.6
  tl.to('.pq-bar', { scaleX: 1, duration: 0.5, ease: 'power2.inOut' }, after)
  tl.to('.pq-cite', { yPercent: 0, opacity: 1, duration: 0.4, ease: 'expo.out' }, after + 0.8)
  tl.fromTo('.pq-block', { yPercent: -50, scale: 1 }, { yPercent: -50, scale: 1.01, duration: total / 1000, ease: 'none' }, 0)
  if (flicker > 0) {
    const n = Math.max(1, Math.round((total / 1000) * flicker))
    tl.fromTo('.pg-turb', { attr: { seed: 3 } }, { attr: { seed: 3 + n }, duration: total / 1000, ease: `steps(${n})` }, 0)
  }
  return tl
})
