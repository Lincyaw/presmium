import { gsapScene } from '@lincyaw/addon-motion/scene'

// Swapping two array cells with keyframe arrays: `left` goes from one slot to the other while `yPercent`
// goes up and back down (one arc above, one below). Slots are percentages, so the scene stays right if it resizes.
const VALUES = [7, 3, 9, 1, 6, 4]
const slot = (i: number) => `${6 + i * 15}%`

export default gsapScene(({ root, gsap, at, color }) => {
  root.innerHTML = `
    <style>
      .sw__cell { position: absolute; top: 40%; width: 12%; aspect-ratio: 1; display: grid; place-items: center; border-radius: 0.6rem; background: var(--pm-color-surface); border: 3px solid var(--pm-color-line-strong); color: var(--pm-color-ink); font: 600 2rem var(--pm-font-mono); box-sizing: border-box; }
      .sw__idx { position: absolute; top: 72%; width: 12%; text-align: center; color: var(--pm-color-muted); font: 1rem var(--pm-font-mono); }
    </style>
    ${VALUES.map((v, i) => `<div class="sw__cell" data-v="${v}" style="left:${slot(i)}">${v}</div><div class="sw__idx" style="left:${slot(i)}">${i}</div>`).join('')}`
  const s = (k: number) => at(k) / 1000
  const cell = (v: number) => root.querySelector<HTMLElement>(`[data-v="${v}"]`)!
  const [a, b] = [cell(3), cell(6)]
  // Text inside tweened boxes: no 3D layer mid-tween, so a frame looks the same however it was reached.
  const tl = gsap.timeline({ defaults: { force3D: false } })
  // Step 0: cells 1 and 4 are picked out.
  tl.to([a, b], { borderColor: color('accent'), backgroundColor: color('accent-soft'), duration: 0.3 }, s(0))
  // Step 1: they swap, one over the top and one underneath.
  tl.to(a, { keyframes: { left: [slot(1), slot(4)], yPercent: [0, -120, 0], easeEach: 'sine.inOut' }, duration: 1, ease: 'power1.inOut' }, s(1))
  tl.to(b, { keyframes: { left: [slot(4), slot(1)], yPercent: [0, 120, 0], easeEach: 'sine.inOut' }, duration: 1, ease: 'power1.inOut' }, s(1))
  // Step 2: object keyframes: a small squash on landing, then both settle.
  tl.to([a, b], { keyframes: [{ scaleY: 0.85, scaleX: 1.1, duration: 0.12 }, { scaleY: 1, scaleX: 1, duration: 0.25, ease: 'back.out(3)' }] }, s(2))
  tl.to([a, b], { borderColor: color('line-strong'), backgroundColor: color('surface'), duration: 0.3 }, s(2) + 0.4)
  return tl
})
