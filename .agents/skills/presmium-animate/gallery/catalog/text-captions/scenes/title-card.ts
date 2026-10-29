import { gsapScene } from '@lincyaw/addon-motion/scene'
import { frame, TYPE } from '../../../lengths/scenes/kit/frame.ts'
import { esc } from './lib/text.ts'

// Title card, with GSAP: the calm breather between parts, a chapter opener or the closing card of a film. A small
// kicker, the title dead centre, a hairline rule, a subtitle; optionally an accent full stop that lands last (a
// lockup) and a large, faint word behind it all (typography as texture).
// State `in` (1.4 s): 0–0.35 s the kicker fades up (power2.out); 0.15–0.85 s the title settles with one restrained
// move: from 96% and a slight blur to sharp, opacity first (power3.out, no bounce); 0.75 s the accent stop pops
// (back.out, the one overshoot of the card); 0.7–1.2 s the rule draws from the centre outwards (power2.inOut);
// 0.9–1.3 s the subtitle fades up. Each part starts before the last ends.
// State `hold` (2.6 s): the title and subtitle stay still. Only the backdrop word drifts 1.5% of the width, a
// linear drift that keeps a held frame alive without moving anything that is read.
// State `out` (0.4 s): everything lifts and fades in 0.25 s, accelerating, the subtitle first.
// Adapted from HyperFrames titlecard-lockup, titlecard-calm, logo-brand-close and mk-emphasis-type.
export default gsapScene(({ root, gsap, at, total, width, height, parameters }) => {
  const kicker = (parameters.kicker as string | undefined) ?? '第 3 章'
  const title = (parameters.title as string | undefined) ?? '反向传播'
  const sub = (parameters.sub as string | undefined) ?? '链式法则把误差送回每一层'
  const dot = parameters.dot !== false
  const backdrop = (parameters.backdrop as string | undefined) ?? '∂L/∂w'
  const s = (k: number) => at(k) / 1000
  frame(root, `
    .tc { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2.2cqh; text-align: center; }
    .tc__bg { position: absolute; top: 50%; left: 50%; font: 600 24cqw/1 var(--pm-font-serif); white-space: nowrap;
      color: color-mix(in oklab, var(--pm-color-ink) 5%, transparent); pointer-events: none; }
    .tc__kicker { font: 500 ${TYPE.label}cqw/1.2 var(--pm-font-mono); color: var(--pm-color-accent); letter-spacing: 0.12em; }
    .tc__title { font: 600 ${TYPE.hero}cqw/1.15 var(--pm-font-serif); letter-spacing: -0.01em; white-space: nowrap; }
    .tc__dot { display: inline-block; width: 0.16em; height: 0.16em; margin-left: 0.06em; border-radius: 0.03em; background: var(--pm-color-accent); }
    .tc__rule { width: 26cqw; height: 0.25cqh; background: var(--pm-color-line-strong); transform-origin: 50% 50%; }
    .tc__sub { font-size: ${TYPE.body}cqw; color: var(--pm-color-muted); white-space: nowrap; }
  `, `${backdrop ? `<div class="tc__bg">${esc(backdrop)}</div>` : ''}<div class="tc">
    ${kicker ? `<div class="tc__kicker">${esc(kicker)}</div>` : ''}
    <div class="tc__title">${esc(title)}${dot ? '<span class="tc__dot"></span>' : ''}</div>
    <div class="tc__rule"></div>
    ${sub ? `<div class="tc__sub">${esc(sub)}</div>` : ''}
  </div>`)

  const tl = gsap.timeline()
  const q = (sel: string) => root.querySelector<HTMLElement>(sel)
  const kick = q('.tc__kicker'), head = q('.tc__title')!, mark = q('.tc__dot'), rule = q('.tc__rule')!, subEl = q('.tc__sub'), bg = q('.tc__bg')
  if (bg) {
    gsap.set(bg, { autoAlpha: 0, xPercent: -50, yPercent: -50, x: 0 })
    tl.to(bg, { autoAlpha: 1, duration: 0.8, ease: 'power1.out' }, 0)
    tl.to(bg, { x: -0.015 * width, duration: total / 1000, ease: 'none' }, 0)
  }
  if (kick) { gsap.set(kick, { autoAlpha: 0, y: '0.6em' }); tl.to(kick, { autoAlpha: 1, y: 0, duration: 0.35, ease: 'power2.out' }, 0) }
  gsap.set(head, { autoAlpha: 0, scale: 0.96, filter: 'blur(0.4cqw)' })
  tl.to(head, { autoAlpha: 1, duration: 0.35, ease: 'power1.out' }, 0.15)
  tl.to(head, { scale: 1, filter: 'blur(0cqw)', duration: 0.7, ease: 'power3.out' }, 0.15)
  tl.set(head, { filter: 'none' }, 0.87)
  if (mark) { gsap.set(mark, { scale: 0 }); tl.to(mark, { scale: 1, duration: 0.4, ease: 'back.out(3)' }, 0.75) }
  gsap.set(rule, { scaleX: 0 })
  tl.to(rule, { scaleX: 1, duration: 0.5, ease: 'power2.inOut' }, 0.7)
  if (subEl) { gsap.set(subEl, { autoAlpha: 0, y: '0.6em' }); tl.to(subEl, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'power2.out' }, 0.9) }
  const parts = [subEl, rule, head, kick].filter(Boolean)
  tl.to(parts, { autoAlpha: 0, y: -0.012 * height, duration: 0.25, ease: 'power2.in', stagger: 0.03 }, s(2))
  if (bg) tl.to(bg, { autoAlpha: 0, duration: 0.3, ease: 'power2.in' }, s(2))
  return tl
})
