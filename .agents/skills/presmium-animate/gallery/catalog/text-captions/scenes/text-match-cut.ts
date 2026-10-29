import { defineScene } from '@lincyaw/addon-motion/scene'
import { frame, TYPE } from '../../../lengths/scenes/kit/frame.ts'
import { ease, phase, speed } from '../../../lengths/scenes/kit/fx/time.ts'
import { esc, inOut4 } from './lib/text.ts'

// Text match cut, with defineScene: one word becomes another in the middle of one move. Both ride a single eased curve
// (an easy ease both ends, like power3.inOut); the old word leaves on the first half, the new one arrives on the
// second, and the cut between them falls at the peak of speed, where the eye cannot follow the letters, so the
// two read as one thing changing. For "this turns into that": pixels into concepts, a question into its answer.
// A small label above (`label`) stays still through the cut, so the eye has an anchor. Three moves, by `mode`:
//   push  — the camera pushes through the word: it grows past the frame and the new word arrives from small;
//   track — the letters spread apart into nothing and the new word closes in from wide spacing;
//   slide — the word slides off to the left and the new one comes in from the right.
// Blur along the move is computed from the curve's speed, so it peaks at the cut and is gone at rest.
// State `a` (1.6 s): 0–0.35 s the label and the first word fade up; then it is read.
// State `cut` (0.9 s): the move; the cut at 0.45 s.
// State `b` (2 s): the new word holds still, in the accent.
// Adapted from HyperFrames text-match-cut, shared-axis-z, type-match-cut and wireframe-portal-title.
type Mode = 'push' | 'track' | 'slide'

export default defineScene(({ root, at, width, color, parameters }) => {
  const a = (parameters.from as string | undefined) ?? '像素'
  const b = (parameters.to as string | undefined) ?? '概念'
  const label = (parameters.label as string | undefined) ?? '深层网络把'
  const mode = ((parameters.mode as string | undefined) ?? 'push') as Mode
  const s = (k: number) => at(k) / 1000
  frame(root, `
    .mc { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2cqh; }
    .mc__label { font-size: ${TYPE.lead}cqw; font-weight: 500; color: var(--pm-color-muted); white-space: nowrap; }
    .mc__stage { display: grid; place-items: center; }
    .mc__w { grid-area: 1 / 1; font: 600 ${TYPE.hero * 1.4}cqw/1.15 var(--pm-font-serif); white-space: nowrap; will-change: transform; }
  `, `<div class="mc">${label ? `<div class="mc__label">${esc(label)}</div>` : ''}<div class="mc__stage"><div class="mc__w mc__a">${esc(a)}</div><div class="mc__w mc__b">${esc(b)}</div></div></div>`)

  const wa = root.querySelector<HTMLElement>('.mc__a')!, wb = root.querySelector<HTMLElement>('.mc__b')!
  const intro = [root.querySelector<HTMLElement>('.mc__label'), root.querySelector<HTMLElement>('.mc__stage')].filter(e => e !== null)
  const move = inOut4   // power3.inOut
  const accent = color('accent'), ink = color('ink')
  const cqw = width / 100
  wb.style.color = accent

  // v runs 0 → 1 along one eased curve; the first half belongs to the old word, the second to the new one.
  const pose = (el: HTMLElement, d: number, blur: number) => {
    // d: −1 (fully gone, one side) … 0 (at rest) … 1 (fully gone, the other side)
    const m = Math.abs(d)
    if (mode === 'push') el.style.transform = `scale(${d < 0 ? 1 + 2.2 * m * m : 1 - 0.55 * m})`
    else if (mode === 'slide') el.style.transform = `translateX(${(d * 45 * cqw).toFixed(1)}px)`
    else { el.style.transform = ''; el.style.letterSpacing = `${(m * 1.2).toFixed(3)}em` }
    el.style.opacity = String(Math.max(0, 1 - m * (mode === 'push' ? 1.1 : 1.4)))
    el.style.filter = blur > 0.01 ? `blur(${blur.toFixed(2)}px)` : 'none'
  }
  return (ms: number) => {
    const t = ms / 1000
    // The label, then the word, fade and rise 1% of the width into place, 0.08 s apart.
    intro.forEach((el, i) => {
      const e = ease.out3(phase(t, 0.05 + i * 0.08, 0.35))
      el.style.opacity = e.toFixed(3)
      el.style.visibility = e > 0 ? '' : 'hidden'
      el.style.transform = `translateY(${((1 - e) * 0.01 * width).toFixed(2)}px)`
    })
    const p = phase(t, s(1), s(2) - s(1))
    const v = move(p)
    const blur = p > 0 && p < 1 ? Math.max(0, speed(move, p) - 0.6) * 0.6 * cqw : 0
    const cut = v >= 0.5
    if (!cut) {
      pose(wa, -v * 2, blur)
      wa.style.visibility = 'visible'; wb.style.visibility = 'hidden'
    } else {
      pose(wb, (v - 1) * -2, blur)
      wa.style.visibility = 'hidden'; wb.style.visibility = 'visible'
    }
    wa.style.color = ink
  }
})
