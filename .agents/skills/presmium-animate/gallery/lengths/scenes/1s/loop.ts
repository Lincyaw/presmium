import { defineScene } from '@lincyaw/addon-motion/scene'
import { frame } from '../kit/frame.ts'

// A seamless one-second loop (a loading indicator), drawn by hand with defineScene: every dot's height is a
// function of the phase (ms / 1000) with its own offset, so the frame at 1 s equals the frame at 0 and the loop
// has no seam. Each dot hops for 40% of the period and rests for 60%: a rhythm, not a wobble.
export default defineScene(({ root }) => {
  const f = frame(root, `
    .lp { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 3cqw; }
    .lp__dot { width: 4cqw; height: 4cqw; border-radius: 50%; background: var(--pm-color-accent); }
  `, `<div class="lp">${[0, 1, 2].map(() => '<div class="lp__dot"></div>').join('')}</div>`)
  const dots = [...f.querySelectorAll<HTMLElement>('.lp__dot')]
  return (ms: number) => {
    dots.forEach((dot, i) => {
      const p = (((ms / 1000 - i * 0.14) % 1) + 1) % 1
      const hop = p < 0.4 ? Math.sin((p / 0.4) * Math.PI) : 0
      dot.style.transform = `translateY(${-hop * 120}%) scale(${1 + hop * 0.15}, ${1 - hop * 0.1})`
      dot.style.opacity = String(0.45 + hop * 0.55)
    })
  }
})
