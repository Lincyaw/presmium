import { gsapScene } from '@lincyaw/addon-motion/scene'
import { frame } from '../../../lengths/scenes/kit/frame.ts'

// Physical exit, with GSAP: wrong options leave the frame with momentum instead of fading, and the one that is
// left moves to the centre. Three states. `options` (1 s): the question, then the cards rise in 70 ms apart.
// `reject` (2 s, 0.95 s per rejected card): a cross stamps onto the card and its outline turns to danger (0.15 s,
// the cause); 0.25 s later the card leaves by its mode, never fading: `toss` dips 2% and tilts back for 0.12 s
// (anticipation), then flies on a parabola (rises about a tenth of the frame, then falls), spinning faster as it
// goes; `drop` hinges a little and falls under gravity (power2.in, the distance grows as t²); `slide` accelerates
// sideways and stretches 15% along the motion at its fastest. Exits take 0.6–0.7 s and accelerate, so they read
// as faster than the entrances. `remain` (2.2 s): 0–0.6 s the remaining card moves to the centre and grows 10%
// (power3.inOut: it keeps its identity, nothing is re-created); 0.45–0.85 s its outline turns to the accent and a
// tick draws; then it holds. Adapted from HyperFrames physical-exit.
interface Exit { index: number, mode: 'toss' | 'drop' | 'slide' }

export default gsapScene(({ root, gsap, at, width, height, color, parameters }) => {
  const question = (parameters.question as string | undefined) ?? '训练损失不下降，先查什么？'
  const options = (parameters.options as string[] | undefined) ?? ['调大学习率', '换更大的模型', '检查数据与标签']
  const exits = (parameters.exits as Exit[] | undefined) ?? [{ index: 1, mode: 'drop' }, { index: 0, mode: 'toss' }]
  const n = options.length
  const keep = options.findIndex((_, i) => !exits.some(e => e.index === i))
  const cw = width / 100
  const slot = (i: number) => (i - (n - 1) / 2) * 30 * cw
  frame(root, `
    .px__q { position: absolute; left: 0; right: 0; top: 12cqh; text-align: center; }
    .px__card { position: absolute; left: 50%; top: 56cqh; width: 26cqw; height: 32cqh; margin: -16cqh 0 0 -13cqw; display: grid; place-items: center;
      font-size: 3cqw; font-weight: 600; transform-origin: 50% 50%; }
    .px__mark { position: absolute; right: 1.4cqw; top: 1.4cqw; width: 4.4cqw; height: 4.4cqw; overflow: visible; }
    .px__x { stroke: var(--pm-color-danger); }
    .px__tick { stroke: var(--pm-color-accent); }
  `, `<div class="lf-lead px__q">${question}</div>${options.map((o, i) => `<div class="lf-card px__card" data-i="${i}"><span>${o}</span>
    <svg class="px__mark" viewBox="0 0 40 40" aria-hidden="true">${i === keep
      ? '<path class="px__tick" d="M 7 21 L 16 30 L 33 10" fill="none" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" />'
      : '<path class="px__x" d="M 9 9 L 31 31 M 31 9 L 9 31" fill="none" stroke-width="5" stroke-linecap="round" />'}</svg></div>`).join('')}`)

  const S = (k: number) => at(k) / 1000
  const tl = gsap.timeline()
  const cards = gsap.utils.toArray<HTMLElement>('.px__card', root)
  cards.forEach((c, i) => gsap.set(c, { x: slot(i) }))

  // options
  gsap.set('.px__q', { autoAlpha: 0, y: 2 * cw })
  tl.to('.px__q', { autoAlpha: 1, y: 0, duration: 0.45, ease: 'expo.out' }, 0.05)
  gsap.set(cards, { autoAlpha: 0, y: 6 * cw })
  tl.to(cards, { autoAlpha: 1, y: 0, duration: 0.45, ease: 'expo.out', stagger: 0.07 }, 0.3)

  // reject: a stamp, then the exit with momentum
  gsap.set('.px__x, .px__tick', { autoAlpha: 0 })
  const toss = (k: number) => (p: number) => -k * p + (1 + k) * p * p   // rises, then falls: a parabola in time
  exits.forEach((e, k) => {
    const card = cards[e.index]!, t = S(1) + k * 0.95
    const x = card.querySelector('.px__x')!
    tl.fromTo(x, { autoAlpha: 0, scale: 1.5, transformOrigin: '50% 50%' }, { autoAlpha: 1, scale: 1, duration: 0.15, ease: 'power2.out', immediateRender: false }, t)
    tl.to(card, { borderColor: color('danger'), duration: 0.15, ease: 'power2.out' }, t)
    const go = t + 0.25, dir = slot(e.index) <= 0 ? -1 : 1
    if (e.mode === 'toss') {
      tl.to(card, { y: 0.02 * height, rotation: 3 * dir, duration: 0.12, ease: 'power2.out' }, go)
      tl.to(card, { x: slot(e.index) + dir * 55 * cw, duration: 0.7, ease: 'none' }, go + 0.12)
      tl.to(card, { y: 1.05 * height, duration: 0.7, ease: toss(0.9) }, go + 0.12)
      tl.to(card, { rotation: -100 * dir, duration: 0.7, ease: 'power1.in' }, go + 0.12)
    } else if (e.mode === 'drop') {
      tl.to(card, { rotation: -4 * dir, duration: 0.12, ease: 'power2.out', transformOrigin: '0% 0%' }, go)
      tl.to(card, { y: 1.0 * height, rotation: -24 * dir, duration: 0.6, ease: 'power2.in' }, go + 0.12)
    } else {
      tl.to(card, { x: slot(e.index) + dir * 110 * cw, duration: 0.6, ease: 'power2.in' }, go)
      tl.to(card, { keyframes: [{ scaleX: 1.15, skewX: -8 * dir, duration: 0.45, ease: 'power2.in' }, { scaleX: 1.15, duration: 0.15 }] }, go)
    }
  })

  // remain: the survivor moves to the centre and is confirmed
  const t2 = S(2), card = cards[keep]!
  tl.to(card, { x: 0, scale: 1.1, duration: 0.6, ease: 'power3.inOut' }, t2)
  tl.to(card, { borderColor: color('accent'), duration: 0.3, ease: 'power1.out' }, t2 + 0.45)
  const tick = card.querySelector('.px__tick')!
  gsap.set(tick, { drawSVG: '0%' })
  tl.set(tick, { autoAlpha: 1 }, t2 + 0.45)
  tl.to(tick, { drawSVG: '100%', duration: 0.4, ease: 'power2.inOut' }, t2 + 0.45)
  return tl
})
