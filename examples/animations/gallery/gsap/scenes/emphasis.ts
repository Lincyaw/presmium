import { gsapScene } from '@lincyaw/addon-motion/scene'

// Emphasis with custom eases: CustomBounce (with its squash ease) drops the answers in, a yoyo pulse marks
// the right one, CustomWiggle shakes the wrong one, and a CustomEase curve sweeps an underline.
// The eases are fixed curves made at build time, so they seek exactly; keep `repeat` finite.
export default gsapScene(({ root, gsap, at, color, plugins }) => {
  const { CustomEase, CustomBounce, CustomWiggle } = plugins
  CustomBounce.create('gallery-bounce', { strength: 0.55, squash: 2.5, squashID: 'gallery-bounce-squash' })
  CustomWiggle.create('gallery-shake', { wiggles: 7, type: 'easeOut' })
  CustomEase.create('gallery-sweep', 'M0,0 C0.25,0 0.3,1.15 0.6,1.05 0.8,0.98 0.9,1 1,1')
  root.innerHTML = `
    <style>
      .em { position: absolute; inset: 0; display: flex; justify-content: center; align-items: flex-end; gap: 3rem; padding-bottom: 22%; font-family: var(--pm-font-sans); }
      .em__q { position: absolute; top: 12%; left: 0; right: 0; text-align: center; color: var(--pm-color-ink); font-size: 1.5rem; }
      .em__a { position: relative; width: 9rem; padding: 1rem 0; border-radius: 0.8rem; text-align: center; background: var(--pm-color-surface); border: 3px solid var(--pm-color-line-strong); color: var(--pm-color-ink); font: 600 1.8rem var(--pm-font-mono); }
      .em__line { position: absolute; left: 0; right: 0; bottom: -0.9rem; height: 0.35rem; border-radius: 0.2rem; background: var(--pm-color-ok); transform: scaleX(0); transform-origin: 0 50%; }
    </style>
    <div class="em__q">O(n log n) 的排序是哪一个？</div>
    <div class="em">
      <div class="em__a em__good">归并<div class="em__line"></div></div>
      <div class="em__a em__bad">冒泡</div>
      <div class="em__a">插入</div>
    </div>`
  const s = (k: number) => at(k) / 1000
  // Text inside tweened boxes: no 3D layer mid-tween, so a frame looks the same however it was reached.
  const tl = gsap.timeline({ defaults: { force3D: false } })
  // Step 0: the answers drop and bounce, squashing on each landing.
  tl.from('.em__a', { y: -260, duration: 1.2, ease: 'gallery-bounce', stagger: 0.12 }, s(0))
  tl.to('.em__a', { scaleY: 0.75, scaleX: 1.2, transformOrigin: '50% 100%', duration: 1.2, ease: 'gallery-bounce-squash', stagger: 0.12 }, s(0))
  // Step 1: the wrong answer shakes and turns red.
  tl.to('.em__bad', { x: 14, duration: 0.6, ease: 'gallery-shake' }, s(1))
  tl.to('.em__bad', { borderColor: color('danger'), color: color('danger'), duration: 0.2 }, s(1))
  // Step 2: the right answer pulses twice (yoyo) and turns green.
  tl.to('.em__good', { scale: 1.12, duration: 0.2, yoyo: true, repeat: 3, ease: 'sine.inOut' }, s(2))
  tl.to('.em__good', { borderColor: color('ok'), backgroundColor: color('ok-soft'), duration: 0.3 }, s(2))
  // Step 3: an underline sweeps in on a custom curve that overshoots a little.
  tl.to('.em__line', { scaleX: 1, duration: 0.8, ease: 'gallery-sweep' }, s(3))
  return tl
})
