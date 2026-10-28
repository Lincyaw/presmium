import { gsapScene } from '@lincyaw/addon-motion/scene'
import { atoms } from '../kit/atoms.ts'
import { frame } from '../kit/frame.ts'

// Replace. 0–0.15 s: the old state is read; 0.15–0.4 s: it leaves upwards, accelerating (0.25 s);
// 0.32–0.77 s: the new one rises in its place, decelerating (0.45 s). Leaving is shorter than arriving,
// and the two overlap so the place is never empty.
export default gsapScene(({ root, gsap, parameters }) => {
  const before = (parameters.before as string | undefined) ?? '草稿'
  const after = (parameters.after as string | undefined) ?? '已发布'
  frame(root, `
    .rp { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 2cqw; }
    .rp__slot { position: relative; width: 22cqw; height: 9cqw; }
    .rp__slot > * { position: absolute; inset: 0; font-size: 3.4cqw; }
    .rp__old { background: var(--pm-color-sunk); color: var(--pm-color-muted); }
    .rp__new { background: var(--pm-color-ok-soft); color: var(--pm-color-ok); }
  `, `<div class="rp"><span class="lf-lead">状态</span><div class="rp__slot"><span class="lf-chip rp__old">${before}</span><span class="lf-chip rp__new">${after}</span></div></div>`)
  const tl = gsap.timeline()
  atoms(gsap, tl).replace('.rp__old', '.rp__new', 0.15)
  return tl
})
