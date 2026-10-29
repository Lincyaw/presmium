import { defineScene } from '@lincyaw/addon-motion/scene'
import { frame, TYPE } from '../../../lengths/scenes/kit/frame.ts'
import { ease, phase } from '../../../lengths/scenes/kit/fx/time.ts'
import { mixColor, splitMarkup } from './lib/text.ts'

// Weight wave, with defineScene: a crest of weight runs along a sentence and leaves the key phrase heavy. The fonts that
// ship have no variable weight axis and Chinese falls back to system fonts, so weight is drawn: a text stroke in
// the text's own colour thickens every glyph, any script, any font. As the crest passes, each character swells
// (stroke up to 0.045 em), rises 6% and leans forward 6°, then relaxes; the characters of the key phrase keep
// their weight and take the accent. The crest is a function of the time, and so is every character.
// State `set` (1.2 s): 0–0.4 s the sentence fades up in a light weight (muted); then it is read.
// State `wave` (1.4 s): the crest crosses the line in 1 s (power1.inOut: it starts and ends gently), each
// character's swell lasting 0.35 s around its passing; the key phrase settles into its weight and colour as the
// crest leaves it.
// State `hold` (2 s): the line holds still, the key phrase heavy and in the accent.
// Adapted from HyperFrames weight-wave, variable-axis-type and caption-weight-shift.
export default defineScene(({ root, at, color, parameters }) => {
  const text = (parameters.text as string | undefined) ?? '注意力是一种加权平均'
  const key = (parameters.key as string | undefined) ?? '加权平均'
  const s = (k: number) => at(k) / 1000
  frame(root, `
    .ww { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font: 400 ${TYPE.title}cqw/1.3 var(--pm-font-sans); }
    .ww-line { white-space: nowrap; }
    .ww-piece, .ww-glyph { display: inline-block; }
    .ww-glyph { -webkit-text-stroke: 0 currentColor; paint-order: stroke fill; transform-origin: 50% 90%; }
  `, `<div class="ww">${splitMarkup(text, 'char', 'ww', key)}</div>`)

  const pieces = [...root.querySelectorAll<HTMLElement>('.ww-piece')]
  const line = root.querySelector<HTMLElement>('.ww')!
  const ink = color('ink'), muted = color('muted'), accent = color('accent')
  const mix = mixColor
  const across = ease.inOut2   // power1.inOut
  const n = pieces.length
  return (ms: number) => {
    const t = ms / 1000
    const shown = ease.out2(phase(t, 0.05, 0.4))
    line.style.opacity = shown.toFixed(3)
    line.style.visibility = shown > 0 ? '' : 'hidden'
    const crest = across(phase(t, s(1), 1)) * (n + 5) - 3   // the crest's position in characters, from 3 before to 2 after the line
    const passed = phase(t, s(1), 1) >= 1
    pieces.forEach((piece, i) => {
      const g = piece.firstElementChild as HTMLElement
      const isKey = piece.classList.contains('ww-key')
      const d = (i - crest) / 1.6                                  // distance to the crest, in swell widths
      const bump = t < s(1) ? 0 : Math.max(0, Math.exp(-d * d) - 0.03) / 0.97   // exactly 0 away from the crest
      // Behind the crest, a key character keeps its weight; everything else relaxes to light.
      const behind = t >= s(1) && (i < crest || passed)
      const keep = isKey && t >= s(1) ? Math.max(0, Math.min(1, (crest - i) / 1.5)) : 0
      const w = Math.max(bump, keep * 0.75)
      g.style.webkitTextStroke = `${(0.045 * w).toFixed(4)}em currentColor`
      g.style.transform = bump > 0.01 ? `translateY(${(-6 * bump).toFixed(2)}%) skewX(${(-6 * bump).toFixed(2)}deg)` : ''
      g.style.color = mix(mix(muted, ink, Math.min(1, bump * 1.4 + (behind ? 0.6 : 0))), accent, keep)
    })
  }
})
