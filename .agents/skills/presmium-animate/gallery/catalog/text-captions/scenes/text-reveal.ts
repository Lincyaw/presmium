import { gsapScene } from '@lincyaw/addon-motion/scene'
import { frame, TYPE } from '../../../lengths/scenes/kit/frame.ts'
import { splitMarkup, wave, type Unit } from './lib/text.ts'

// Text reveal, with GSAP: one block of text (one or two lines) enters piece by piece, holds perfectly still, and
// can leave. Six entrances in one scene, chosen by `style`:
//   rise  — each piece rises out of its own slot (a mask), the way a line is set in type;
//   drop  — the same from above, a staircase coming down;
//   blur  — each piece fades up from a soft focus to sharp (a focus pull), the calm keynote entrance;
//   track — each line closes in from wide letter-spacing, for one-line headings and labels;
//   wipe  — each piece is uncovered left to right by a clip, like a caption written as it is spoken;
//   slide — each line slides in from the left, and leaves to the right.
// Pieces are characters, words or lines (`unit`); words come from the browser's dictionary segmenter, so a
// Chinese line splits into words although it has no spaces, and punctuation rides with the word before it.
// State `in` (1.2 s): from 0.1 s the pieces arrive 45 ms apart (characters) or 80 ms apart (words, lines), the
// whole wave capped at 0.7 s so a long line does not crawl; each piece takes 0.55 s on power3.out (expo.out lands
// in three frames and the move is never seen), opacity arriving first. When the last piece lands, the key phrase
// (`key`) takes the accent in 0.3 s: the colour comes on landing, as the effect after the cause.
// State `hold` (2.5 s): nothing moves. A landed line is read, so it stays still; the default 10 characters need
// 1.1 s at 9 characters a second, read twice.
// State `out` (0.5 s): the pieces leave in 0.25 s, accelerating (power2.in), 20 ms apart, the way they came
// (up through the slot, blurring upwards, to the right); the rest of the state is empty.
// Steps may stop at `hold` and skip `out` when the next shot cuts.
// Adapted from HyperFrames per-word-rise, bottom-up-letters, top-down-letters, staggered-fade-up,
// per-word-crossfade, soft-blur-in, focus-blur-resolve, blur-out-up, tracking-in, caption-clip-wipe,
// line-by-line-slide and text-stagger.
type Style = 'rise' | 'drop' | 'blur' | 'track' | 'wipe' | 'slide'

export default gsapScene(({ root, gsap, at, width, color, parameters }) => {
  const text = (parameters.text as string | undefined) ?? '注意力，\n就是加权求和'
  const key = (parameters.key as string | undefined) ?? '加权求和'
  const style = ((parameters.style as string | undefined) ?? 'rise') as Style
  const lineWise = style === 'track' || style === 'slide'
  // Line-wise styles move whole lines, but the markup is still split into words so the key phrase alone takes the accent.
  const unit: Unit = lineWise ? 'word' : ((parameters.unit as Unit | undefined) ?? 'char')
  const size = (parameters.size as string | undefined) === 'lead' ? TYPE.lead : TYPE.title
  const s = (k: number) => at(k) / 1000
  const masked = style === 'rise' || style === 'drop'
  frame(root, `
    .tr { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.2em;
      font: 600 ${size}cqw/1.25 var(--pm-font-serif); text-align: center; }
    .tr-line { white-space: nowrap; }
    .tr-piece { display: inline-block; ${masked ? 'overflow: clip; padding-block: 0.14em; margin-block: -0.14em; vertical-align: top;' : ''} }
    .tr-glyph { display: inline-block; }
  `, `<div class="tr">${splitMarkup(text, unit, 'tr', key)}</div>`)

  const tl = gsap.timeline()
  const cqw = width / 100
  const lines = [...root.querySelectorAll<HTMLElement>('.tr-line')]
  const glyphs = lineWise ? lines : [...root.querySelectorAll<HTMLElement>('.tr-glyph')]
  const keys = [...root.querySelectorAll<HTMLElement>('.tr-key .tr-glyph')]
  const gap = wave(glyphs.length, unit === 'char' ? 0.045 : 0.08, 0.7)
  const t0 = 0.1, move = 0.55
  const landed = t0 + gap * (glyphs.length - 1) + move

  const from: Record<Style, gsap.TweenVars> = {
    rise: { yPercent: 105 },
    drop: { yPercent: -105 },
    blur: { y: 0.6 * cqw, filter: 'blur(0.7cqw)' },
    track: { letterSpacing: '0.7em', filter: 'blur(0.35cqw)' },
    wipe: { clipPath: 'inset(-20% 100% -20% 0%)' },
    slide: { x: -5 * cqw },
  }
  const rest: Record<Style, gsap.TweenVars> = {
    rise: { yPercent: 0 },
    drop: { yPercent: 0 },
    blur: { y: 0, filter: 'blur(0cqw)' },
    track: { letterSpacing: '0em', filter: 'blur(0cqw)' },
    wipe: { clipPath: 'inset(-20% 0% -20% 0%)' },
    slide: { x: 0 },
  }
  gsap.set(glyphs, { opacity: 0, ...from[style] })
  tl.to(glyphs, { ...rest[style], duration: move, ease: style === 'wipe' ? 'power2.out' : 'power3.out', stagger: gap }, t0)
  tl.to(glyphs, { opacity: 1, duration: move * 0.45, ease: 'power1.out', stagger: gap }, t0)
  if (style === 'blur' || style === 'track') tl.set(glyphs, { filter: 'none' }, landed + 0.02)
  if (style === 'wipe') tl.set(glyphs, { clipPath: 'none' }, landed + 0.02)
  if (keys.length) {
    gsap.set(keys, { color: color('ink') })
    tl.to(keys, { color: color('accent'), duration: 0.3, ease: 'power1.inOut' }, landed)
  }

  // The exit: faster than the entrance, the way each style came in.
  const out: Record<Style, gsap.TweenVars> = {
    rise: { yPercent: -105 },
    drop: { yPercent: 105 },
    blur: { y: -0.8 * cqw, filter: 'blur(0.6cqw)', opacity: 0 },
    track: { letterSpacing: '0.3em', opacity: 0 },
    wipe: { clipPath: 'inset(-20% 0% -20% 100%)' },
    slide: { x: 5 * cqw, opacity: 0 },
  }
  const t2 = s(2)
  if (style === 'wipe') tl.set(glyphs, { clipPath: 'inset(-20% 0% -20% 0%)' }, t2 - 0.001)
  if (style === 'blur') tl.set(glyphs, { filter: 'blur(0cqw)' }, t2 - 0.001)
  tl.to(glyphs, { ...out[style], duration: 0.25, ease: 'power2.in', stagger: wave(glyphs.length, 0.02, 0.15) }, t2)
  if (masked) tl.set(glyphs, { opacity: 0 }, t2 + 0.45)
  return tl
})
