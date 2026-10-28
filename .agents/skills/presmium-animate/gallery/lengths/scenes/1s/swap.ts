import { gsapScene } from '@lincyaw/addon-motion/scene'
import { EASE } from '../kit/atoms.ts'
import { frame } from '../kit/frame.ts'

// Swap: two cards trade places on arcs, one over and one under, so their paths never cross and each keeps its
// identity (the same card, now elsewhere). 0–0.15 s: both are read; 0.15–0.25 s: both are picked up (accent
// outline); 0.15–0.8 s: the arcs; 0.8–1 s: rest.
export default gsapScene(({ root, gsap, parameters }) => {
  const [a, b] = (parameters.items as [string, string] | undefined) ?? ['7', '3']
  frame(root, `
    .sw { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 8cqw; }
    .sw__card { width: 16cqw; height: 16cqw; display: grid; place-items: center; font: 500 7cqw/1 var(--pm-font-mono); }
  `, `<div class="sw"><div class="sw__card lf-card sw__a">${a}</div><div class="sw__card lf-card sw__b">${b}</div></div>`)
  const tl = gsap.timeline()
  // The distance between the two centres is a card plus the gap: 24% of the frame width = 150% of a card.
  const d = 150
  tl.to(['.sw__a', '.sw__b'], { borderColor: 'var(--pm-color-accent)', duration: 0.1 }, 0.15)
  tl.to('.sw__a', { keyframes: { xPercent: [0, d / 2, d], yPercent: [0, -70, 0], ease: 'none' }, duration: 0.65, ease: EASE.move }, 0.15)
  tl.to('.sw__b', { keyframes: { xPercent: [0, -d / 2, -d], yPercent: [0, 70, 0], ease: 'none' }, duration: 0.65, ease: EASE.move }, 0.15)
  return tl
})
