import { gsapScene } from '@lincyaw/addon-motion/scene'
import { frame, TYPE } from '../../../lengths/scenes/kit/frame.ts'
import { esc } from './lib/text.ts'

// Versus cards, with GSAP: two equal cards side by side, the baseline on the left and ours on the right (one
// spatial convention: left is before, right is after). They open like a book under one shared perspective: each
// is turned 10° towards the centre, so the pair reads as one spread, with its shadow falling outwards.
// State `in` (1.3 s): 0.05–0.85 s the left card swings in from its wing (rotateY from 60° to its 10° rest, sliding
// 18% in, power3.out, opacity first); 0.3–1.1 s the right card does the same, mirrored. Their lines rise 60 ms
// apart as each card lands.
// State `badge` (1.2 s): 0–0.45 s the left badge pops (back.out, 3% overshoot); 0.5–0.95 s the right badge pops
// in the accent and the right card's edge takes the accent: one at a time, the verdict last.
// State `hold` (2 s): everything rests.
// Adapted from HyperFrames split-tilt-cards (and tilt-card, whose depth and glare are the gallery's tilt-glare).
interface Side { title: string, points: string[], badge: string }

export default gsapScene(({ root, gsap, at, color, parameters }) => {
  const left = { title: 'RNN', points: ['逐个词读入', '难以并行', '远处的词会遗忘'], badge: '顺序', ...(parameters.left as Partial<Side> | undefined) }
  const right = { title: 'Transformer', points: ['整句一次读入', '完全并行', '注意力直连任意两词'], badge: '并行', ...(parameters.right as Partial<Side> | undefined) }
  const s = (k: number) => at(k) / 1000
  const card = (side: Side, cls: string) => `<div class="vc__card ${cls}">
    <div class="vc__title">${esc(side.title)}</div>
    <div class="vc__list">${side.points.map(p => `<div class="vc__item">${esc(p)}</div>`).join('')}</div>
    ${side.badge ? `<div class="vc__badge">${esc(side.badge)}</div>` : ''}
  </div>`
  frame(root, `
    .vc { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 4cqw; perspective: 90cqw; }
    .vc__card { position: relative; width: 36cqw; padding: 3.2cqh 2.8cqw 4.2cqh; border-radius: 1.4cqw; background: var(--pm-color-surface);
      border: 0.18cqw solid var(--pm-color-line-strong); transform-style: preserve-3d; will-change: transform; }
    .vc__a { box-shadow: -1.2cqw 1.6cqh 3cqw color-mix(in oklab, var(--pm-color-shadow) 14%, transparent); }
    .vc__b { box-shadow: 1.2cqw 1.6cqh 3cqw color-mix(in oklab, var(--pm-color-shadow) 14%, transparent); }
    .vc__title { font: 600 ${TYPE.lead}cqw/1.2 var(--pm-font-serif); margin-bottom: 2cqh; }
    .vc__list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 1.4cqh; }
    .vc__item { font-size: ${TYPE.body}cqw; line-height: 1.3; padding-left: 1.4em; position: relative; color: var(--pm-color-ink); white-space: nowrap; }
    .vc__item::before { content: ''; position: absolute; left: 0.3em; top: 0.55em; width: 0.4em; height: 0.4em; border-radius: 50%; background: var(--pm-color-line-strong); }
    .vc__b .vc__item::before { background: var(--pm-color-accent); }
    .vc__badge { position: absolute; top: -1.8cqh; padding: 0.6cqh 1.4cqw; border-radius: 99cqw; font-size: ${TYPE.label}cqw; font-weight: 600; white-space: nowrap;
      background: var(--pm-color-sunk); color: var(--pm-color-muted); border: 0.15cqw solid var(--pm-color-line-strong); }
    .vc__a .vc__badge { right: 2cqw; }
    .vc__b .vc__badge { left: 2cqw; background: var(--pm-color-accent); color: var(--pm-color-on-accent); border-color: var(--pm-color-accent); }
  `, `<div class="vc">${card(left, 'vc__a')}${card(right, 'vc__b')}</div>`)

  const tl = gsap.timeline()
  const a = root.querySelector<HTMLElement>('.vc__a')!, b = root.querySelector<HTMLElement>('.vc__b')!
  const TILT = 10
  ;[[a, 1, 0.05], [b, -1, 0.3]].forEach(([el, dir, t]) => {
    const c = el as HTMLElement, d = dir as number, t0 = t as number
    gsap.set(c, { rotationY: 60 * d, xPercent: -18 * d, autoAlpha: 0, transformOrigin: d > 0 ? '0% 50%' : '100% 50%' })
    tl.to(c, { autoAlpha: 1, duration: 0.25, ease: 'power1.out' }, t0)
    tl.to(c, { rotationY: TILT * d, xPercent: 0, duration: 0.8, ease: 'power3.out' }, t0)
    const items = c.querySelectorAll('.vc__item')
    gsap.set(items, { autoAlpha: 0, y: '0.5em' })
    tl.to(items, { autoAlpha: 1, y: 0, duration: 0.35, ease: 'power2.out', stagger: 0.06 }, t0 + 0.4)
  })
  const badges = [a.querySelector('.vc__badge'), b.querySelector('.vc__badge')]
  badges.forEach((badge, i) => {
    if (!badge) return
    gsap.set(badge, { scale: 0, autoAlpha: 0 })
    tl.to(badge, { scale: 1, autoAlpha: 1, duration: 0.45, ease: 'back.out(1.8)' }, s(1) + i * 0.5)
  })
  gsap.set(b, { borderColor: color('line-strong') })
  tl.to(b, { borderColor: color('accent'), duration: 0.3, ease: 'power1.out' }, s(1) + 0.6)
  return tl
})
