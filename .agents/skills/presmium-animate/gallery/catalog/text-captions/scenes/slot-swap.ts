import { gsapScene } from '@lincyaw/addon-motion/scene'
import { frame, TYPE } from '../../../lengths/scenes/kit/frame.ts'
import { esc } from './lib/text.ts'

// Slot swap, with GSAP: a sentence holds still while one word in it is replaced, again and again, until the
// right one lands. The fixed words never move; only the slot does (one focus at a time). The slot is as wide as
// its widest option (all options share one grid cell, so nothing is measured and the sentence never reflows).
// Two ways to change the word, by `mode`:
//   roll — a reel: the old word and the next ride one strip upwards through the slot's mask, a row apart,
//          with a vertical smear while fast; the last option lands with a small overshoot (a click into place);
//   axis — a shared-axis swap: the old word lifts and fades, the new one rises from below and sharpens; calmer,
//          for editorial sentences.
// State `set` (1.6 s): 0–0.45 s the sentence with the first option fades up (power3.out); then it is read.
// State `roll` (3 s): the middle options, each given an equal share; in each share the swap takes 0.45 s
// (power3.inOut, a move between two places) and the word then rests for the rest of its share, at least 0.6 s,
// so every option can be read (two-character words at 9 characters a second, twice).
// State `land` (2 s): 0–0.5 s the final option rolls in on back.out(1.6); 0.35 s it takes the accent; 0.45–0.9 s
// an accent underline draws under it from the left (the effect after the cause); then it holds still.
// Adapted from HyperFrames kinetic-type-swap, slot-machine-roll, ticker-takeover, line-swap, shared-axis-y and
// text-state-swap.
export default gsapScene(({ root, gsap, at, color, parameters }) => {
  const prefix = (parameters.prefix as string | undefined) ?? '大模型的本质是'
  const suffix = (parameters.suffix as string | undefined) ?? ''
  const options = (parameters.options as string[] | undefined) ?? ['记忆', '检索', '压缩', '预测']
  const mode = (parameters.mode as string | undefined) === 'axis' ? 'axis' : 'roll'
  const s = (k: number) => at(k) / 1000
  frame(root, `
    .ss { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
    .ss__line { display: flex; align-items: baseline; font: 600 ${TYPE.title}cqw/1.3 var(--pm-font-sans); white-space: pre; }
    .ss__slot { position: relative; display: inline-grid; justify-items: start; overflow: clip; padding-block: 0.12em; margin-block: -0.12em; padding-inline: 0.1em; }
    .ss__opt { grid-area: 1 / 1; position: relative; display: inline-block; }
    .ss__line--axis .ss__slot { overflow: visible; }
    .ss__under { position: absolute; left: 0; right: 0; bottom: 0; height: 0.07em; border-radius: 0.05em; background: var(--pm-color-accent); transform-origin: 0 50%; }
  `, `<div class="ss"><div class="ss__line ss__line--${mode}"><span>${esc(prefix)}</span><span class="ss__slot">${options.map((o, i) => `<span class="ss__opt">${esc(o)}${i === options.length - 1 ? '<span class="ss__under"></span>' : ''}</span>`).join('')}</span><span>${esc(suffix)}</span></div></div>`)

  const tl = gsap.timeline()
  const line = root.querySelector<HTMLElement>('.ss__line')!
  const opts = [...root.querySelectorAll<HTMLElement>('.ss__opt')]
  const under = root.querySelector<HTMLElement>('.ss__under')!
  const swap = 0.45
  gsap.set(line, { autoAlpha: 0, y: '0.3em' })
  tl.to(line, { autoAlpha: 1, y: 0, duration: 0.45, ease: 'power3.out' }, 0.05)
  gsap.set(opts.slice(1), mode === 'roll' ? { yPercent: 110 } : { yPercent: 40, autoAlpha: 0, filter: 'blur(0.4cqw)' })
  gsap.set(under, { scaleX: 0 })

  // One swap from option i − 1 to option i at time t; the last lands with an overshoot.
  const change = (i: number, t: number, last: boolean) => {
    const prev = opts[i - 1]!, next = opts[i]!
    if (mode === 'roll') {
      // The reel: both words ride one strip, so they stay a row apart and never overlap.
      const ease = last ? 'back.out(1.4)' : 'power3.inOut', d = last ? 0.55 : swap
      tl.to(prev, { yPercent: -110, duration: d, ease }, t)
      tl.to(next, { yPercent: 0, duration: d, ease }, t)
      // The smear: the reel blurs in y while it moves fastest, and is sharp at rest.
      tl.fromTo([prev, next], { filter: 'blur(0cqw)' }, { keyframes: [
        { filter: 'blur(0.25cqw)', duration: d * 0.4, ease: 'power1.in' },
        { filter: 'blur(0cqw)', duration: d * 0.4, ease: 'power1.out' },
      ], immediateRender: false }, t + d * 0.1)
      tl.set([prev, next], { filter: 'none' }, t + d + 0.02)
    } else {
      tl.to(prev, { yPercent: -40, autoAlpha: 0, filter: 'blur(0.4cqw)', duration: 0.25, ease: 'power2.in' }, t)
      tl.to(next, { yPercent: 0, autoAlpha: 1, filter: 'blur(0cqw)', duration: 0.45, ease: last ? 'back.out(1.6)' : 'power3.out' }, t + 0.17)
      tl.set(next, { filter: 'none' }, t + 0.65)
    }
  }
  const middle = opts.length - 2
  const share = middle > 0 ? (s(2) - s(1)) / middle : 0
  for (let i = 1; i <= middle; i++) change(i, s(1) + (i - 1) * share, false)
  if (opts.length > 1) change(opts.length - 1, s(2), true)
  const final = opts.at(-1)!
  gsap.set(final, { color: color('ink') })
  tl.to(final, { color: color('accent'), duration: 0.25, ease: 'power1.out' }, s(2) + 0.35)
  tl.to(under, { scaleX: 1, duration: 0.45, ease: 'power2.inOut' }, s(2) + 0.45)
  return tl
})
