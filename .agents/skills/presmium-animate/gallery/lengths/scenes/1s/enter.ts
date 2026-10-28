import { gsapScene } from '@lincyaw/addon-motion/scene'
import { atoms } from '../kit/atoms.ts'
import { frame } from '../kit/frame.ts'

// Enter. 0–0.59 s: three cards rise into place one after another (0.45 s each, 70 ms apart, decelerating);
// 0.59–1 s: they rest, so the last 40% of the second shows the result still.
export default gsapScene(({ root, gsap, parameters }) => {
  const items = (parameters.items as string[] | undefined) ?? ['网页', '幻灯片', '视频']
  frame(root, `
    .en { position: absolute; inset: 0; display: flex; gap: 3cqw; align-items: center; justify-content: center; }
    .en__card { width: 20cqw; height: 26cqh; display: grid; place-items: center; font-size: 3cqw; font-weight: 600; }
  `, `<div class="en">${items.map(item => `<div class="en__card lf-card">${item}</div>`).join('')}</div>`)
  const tl = gsap.timeline()
  atoms(gsap, tl).enter('.en__card', 0)
  return tl
})
