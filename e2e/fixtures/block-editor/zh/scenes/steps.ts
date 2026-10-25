import { gsapScene } from '@lincyaw/addon-motion/scene'
export default gsapScene(({ root, gsap, at }) => {
  root.innerHTML = '<div class="step-box" style="width:30%;height:50%;background:var(--pm-color-accent)"></div>'
  const box = root.querySelector('.step-box')!
  return gsap.timeline().from(box, { opacity: 0, duration: .8 }, 0).to(box, { xPercent: 100, duration: 1.2 }, at(1) / 1000).to(box, { rotate: 90, duration: 1 }, at(2) / 1000)
})
