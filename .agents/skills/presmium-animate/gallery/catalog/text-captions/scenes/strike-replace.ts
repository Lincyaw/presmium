import { gsapScene } from '@lincyaw/addon-motion/scene'
import { frame, TYPE } from '../../../lengths/scenes/kit/frame.ts'
import { esc } from './lib/text.ts'

// Strike and replace, with GSAP: a common misconception is stated, struck out and corrected. Two ways to
// correct, by `mode`:
//   above — the wrong words stay, struck through and dimmed, and the right words rise above them in the accent,
//           the way a teacher corrects on the page: the contrast stays visible;
//   caret — the wrong words are selected (a soft accent block wipes over them), collapse to a caret, and the
//           right words are typed in their place at 14 characters a second; the sentence closes up around them.
// State `claim` (2 s): 0–0.45 s the sentence fades up (power3.out); then it is read (10 characters, 1.1 s at
// 9 a second).
// State `strike` (1.2 s): above: 0–0.45 s a line in the danger colour draws through the wrong words from the left
// (power2.inOut); as it arrives they dim to the muted colour (cause, then effect). caret: 0–0.4 s the selection
// wipes over them. Then rest.
// State `fix` (2.5 s): above: 0–0.5 s the correction rises above the struck words (expo.out). caret: 0–0.3 s the
// selection and the wrong words collapse, then the right words are typed, the caret solid while typing, then one
// blink on a 0.5 s rhythm (a function of the time) before it is hidden for the hold.
// Then the corrected sentence holds still.
// Adapted from HyperFrames strikethrough-replace and caret-swap.
export default gsapScene(({ root, gsap, at, color, parameters }) => {
  const prefix = (parameters.prefix as string | undefined) ?? '梯度下降总能找到'
  const wrong = (parameters.wrong as string | undefined) ?? '全局最优'
  const right = (parameters.right as string | undefined) ?? '局部最优'
  const suffix = (parameters.suffix as string | undefined) ?? ''
  const mode = (parameters.mode as string | undefined) === 'caret' ? 'caret' : 'above'
  const s = (k: number) => at(k) / 1000
  const wrongEm = [...wrong].length * 1.05   // CJK characters are 1 em wide; an upper bound that collapses to 0
  frame(root, `
    .sr { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
    .sr__line { display: flex; align-items: baseline; font: 600 ${TYPE.title}cqw/1.3 var(--pm-font-sans); white-space: pre; }
    .sr__wrong { position: relative; display: inline-block; }
    .sr__wrong-text { display: inline-block; white-space: pre; overflow: clip; vertical-align: bottom; }
    .sr__strike { position: absolute; left: -0.06em; right: -0.06em; top: 52%; height: 0.08em; border-radius: 0.04em; background: var(--pm-color-danger); transform-origin: 0 50%; }
    .sr__fix { position: absolute; left: 50%; bottom: 88%; transform: translateX(-50%); font-size: 0.62em; color: var(--pm-color-accent); white-space: pre; }
    .sr__sel { position: absolute; inset: 0.08em -0.04em; border-radius: 0.12em; background: var(--pm-color-accent-soft); transform-origin: 0 50%; z-index: -1; }
    .sr__typed { display: inline-block; white-space: pre; color: var(--pm-color-accent); }
    .sr__caret { display: inline-block; width: 0.06em; height: 1em; margin-inline: 0.02em; background: var(--pm-color-accent); vertical-align: -0.12em; }
  `, `<div class="sr"><div class="sr__line"><span>${esc(prefix)}</span><span class="sr__wrong">${mode === 'caret' ? '<span class="sr__sel"></span>' : ''}<span class="sr__wrong-text">${esc(wrong)}</span>${mode === 'above'
    ? `<span class="sr__strike"></span><span class="sr__fix">${esc(right)}</span>`
    : ''}</span>${mode === 'caret' ? '<span class="sr__typed"></span><span class="sr__caret"></span>' : ''}<span>${esc(suffix)}</span></div></div>`)

  const tl = gsap.timeline()
  const line = root.querySelector<HTMLElement>('.sr__line')!
  const wrongText = root.querySelector<HTMLElement>('.sr__wrong-text')!
  gsap.set(line, { autoAlpha: 0, y: '0.3em' })
  tl.to(line, { autoAlpha: 1, y: 0, duration: 0.45, ease: 'power3.out' }, 0.05)
  if (mode === 'above') {
    const strike = root.querySelector('.sr__strike')!, fix = root.querySelector('.sr__fix')!
    gsap.set(strike, { scaleX: 0 })
    gsap.set(fix, { autoAlpha: 0, y: '0.5em' })
    tl.to(strike, { scaleX: 1, duration: 0.45, ease: 'power2.inOut' }, s(1))
    gsap.set(wrongText, { color: color('ink') })
    tl.to(wrongText, { color: color('muted'), duration: 0.3, ease: 'power1.out' }, s(1) + 0.35)
    tl.to(fix, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'expo.out' }, s(2))
  } else {
    const sel = root.querySelector('.sr__sel')!, typed = root.querySelector<HTMLElement>('.sr__typed')!, caret = root.querySelector<HTMLElement>('.sr__caret')!
    gsap.set(sel, { scaleX: 0 })
    gsap.set(caret, { autoAlpha: 0 })
    gsap.set(wrongText, { maxWidth: `${wrongEm}em` })
    tl.to(sel, { scaleX: 1, duration: 0.4, ease: 'power2.inOut' }, s(1))
    tl.to([wrongText], { maxWidth: '0em', duration: 0.3, ease: 'power2.in' }, s(2))
    tl.to(sel, { autoAlpha: 0, duration: 0.2, ease: 'power2.in' }, s(2) + 0.1)
    const cps = 14, start = s(2) + 0.4, typing = [...right].length / cps
    tl.to(typed, { text: { value: right }, duration: typing, ease: 'none' }, start)
    // The caret: shown from the collapse to the end of typing plus one blink; solid while typing, then a 0.5 s blink.
    const end = start + typing + 0.5
    const blink = { t: 0 }
    tl.to(blink, { t: 1, duration: s(3) - s(2), ease: 'none', modifiers: { t: (v: number | string) => {
      const t = s(2) + Number(v) * (s(3) - s(2))
      const on = t >= s(2) + 0.25 && t < end && (t < start + typing || Math.floor((t - start - typing) / 0.25) % 2 === 1)
      caret.style.visibility = on ? 'visible' : 'hidden'
      caret.style.opacity = '1'
      return v
    } } }, s(2))
  }
  return tl
})
