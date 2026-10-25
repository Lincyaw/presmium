import { gsapScene } from '@lincyaw/addon-motion/scene'

// Three dots light up one per step, so a screenshot tells which step the scene is in.
export default gsapScene(({ root, gsap, at, durations, color }) => {
  root.innerHTML = `<div style="display:flex;gap:2rem;justify-content:center;align-items:center;height:100%">${durations.map(() => `<span class="dot" style="width:3rem;height:3rem;border-radius:50%;background:${color('line-strong')}"></span>`).join('')}</div>`
  const dots = [...root.querySelectorAll('.dot')]
  const tl = gsap.timeline()
  durations.forEach((d, k) => tl.to(dots[k]!, { backgroundColor: color('accent'), scale: 1.3, duration: d / 1000 }, at(k) / 1000))
  return tl
})
