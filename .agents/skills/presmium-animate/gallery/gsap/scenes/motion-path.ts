import { gsapScene } from '@lincyaw/addon-motion/scene'

// MotionPath: a request travels along a curved SVG path to the server with `autoRotate`, the response comes back
// along another, then several packets stream with a stagger. Packets are hidden (opacity 0) until their step and
// sit at the path's start (`motionPath` with `end: 0`, set at build time).
export default gsapScene(({ root, gsap, at }) => {
  root.innerHTML = `
    <style>
      .mp { width: 100%; height: 100%; }
      .mp__box rect { fill: var(--pm-color-surface); stroke: var(--pm-color-line-strong); stroke-width: 3; }
      .mp__box text { fill: var(--pm-color-ink); font: 600 20px var(--pm-font-sans); text-anchor: middle; dominant-baseline: central; }
      .mp__route { fill: none; stroke: var(--pm-color-line-strong); stroke-width: 2.5; stroke-dasharray: 8 8; }
      .mp__req { fill: var(--pm-color-accent); }
      .mp__res { fill: var(--pm-color-ok); }
    </style>
    <svg class="mp" viewBox="0 0 640 330">
      <path id="mp-go" class="mp__route" d="M 130 150 C 250 20, 390 20, 510 150"/>
      <path id="mp-back" class="mp__route" d="M 510 185 C 390 315, 250 315, 130 185"/>
      <g class="mp__box"><rect x="30" y="125" width="100" height="85" rx="12"/><text x="80" y="167">客户端</text></g>
      <g class="mp__box"><rect x="510" y="125" width="100" height="85" rx="12"/><text x="560" y="167">服务器</text></g>
      <path class="mp__pkt mp__req mp__one" d="M -16 -10 L 16 0 L -16 10 Z"/>
      <path class="mp__pkt mp__res mp__two" d="M -16 -10 L 16 0 L -16 10 Z"/>
      ${'<path class="mp__pkt mp__req mp__many" d="M -12 -8 L 12 0 L -12 8 Z"/>'.repeat(5)}
    </svg>`
  const s = (k: number) => at(k) / 1000
  const along = (path: string) => ({ path, align: path, alignOrigin: [0.5, 0.5] as [number, number], autoRotate: true })
  gsap.set('.mp__one, .mp__many', { motionPath: { ...along('#mp-go'), end: 0 }, opacity: 0 })
  gsap.set('.mp__two', { motionPath: { ...along('#mp-back'), end: 0 }, opacity: 0 })
  const tl = gsap.timeline()
  // Step 0: the request flies to the server, turning with the curve.
  tl.to('.mp__one', { opacity: 1, duration: 0.15 }, s(0))
  tl.to('.mp__one', { motionPath: along('#mp-go'), duration: 1.2, ease: 'power1.inOut' }, s(0))
  tl.to('.mp__one', { opacity: 0, duration: 0.15 }, s(0) + 1.2)
  // Step 1: the response comes back along the lower path.
  tl.to('.mp__two', { opacity: 1, duration: 0.15 }, s(1))
  tl.to('.mp__two', { motionPath: along('#mp-back'), duration: 1.2, ease: 'power1.inOut' }, s(1))
  tl.to('.mp__two', { opacity: 0, duration: 0.15 }, s(1) + 1.2)
  // Step 2: a stream of packets, one after another on the same path.
  tl.to('.mp__many', { opacity: 1, duration: 0.1, stagger: 0.25 }, s(2))
  tl.to('.mp__many', { motionPath: along('#mp-go'), duration: 1.1, ease: 'none', stagger: 0.25 }, s(2))
  tl.to('.mp__many', { opacity: 0, duration: 0.1, stagger: 0.25 }, s(2) + 1.1)
  return tl
})
