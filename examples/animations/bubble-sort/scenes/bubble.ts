import { gsapScene } from '@lincyaw/addon-motion/scene'

// One pass of bubble sort over 5 2 4 1 3: the 5 is compared with its right neighbour and swapped
// until it reaches the end. Each step of the deck plays one part of this GSAP timeline.
const VALUES = [5, 2, 4, 1, 3]
const slot = (i: number) => `${4 + i * 19}%`

export default gsapScene(({ root, gsap, at, color }) => {
  root.innerHTML = `
    <div class="bs" style="position:relative;height:100%;font-family:var(--pm-font-mono)">
      ${VALUES.map((v, i) => `<div class="bs__bar" data-value="${v}" style="position:absolute;bottom:14%;left:${slot(i)};width:16%;height:${v * 14}%;border-radius:var(--pm-radius-control) var(--pm-radius-control) 0 0;background:${color('muted')};display:flex;align-items:flex-start;justify-content:center;color:${color('bg')};font-size:clamp(var(--pm-text-sm),3.6vw,calc(var(--pm-text-lg) * 1.6));line-height:1;padding-top:min(var(--pm-space-2),1vw);box-sizing:border-box">${v}</div>`).join('')}
    </div>`
  const bar = (v: number) => root.querySelector<HTMLElement>(`[data-value="${v}"]`)!
  const s = (k: number) => at(k) / 1000
  const lit = color('accent')
  const plain = color('muted')
  const tl = gsap.timeline()
  // Step 0: the bars rise.
  tl.from('.bs__bar', { scaleY: 0, transformOrigin: '50% 100%', duration: 0.5, stagger: 0.08, ease: 'power2.out' }, s(0))
  // Step 1: compare 5 and 2.
  tl.to([bar(5), bar(2)], { backgroundColor: lit, duration: 0.3 }, s(1))
  // Step 2: 5 > 2, swap them.
  tl.to(bar(5), { left: slot(1), duration: 0.6, ease: 'power1.inOut' }, s(2))
  tl.to(bar(2), { left: slot(0), duration: 0.6, ease: 'power1.inOut' }, s(2))
  tl.to(bar(2), { backgroundColor: plain, duration: 0.3 }, s(2) + 0.6)
  // Step 3: compare 5 with 4 and swap.
  tl.to(bar(4), { backgroundColor: lit, duration: 0.3 }, s(3))
  tl.to(bar(5), { left: slot(2), duration: 0.6 }, s(3) + 0.3)
  tl.to(bar(4), { left: slot(1), duration: 0.6 }, s(3) + 0.3)
  tl.to(bar(4), { backgroundColor: plain, duration: 0.2 }, s(3) + 0.9)
  // Step 4: 5 passes 1 and 3 and settles at the end, sorted.
  tl.to(bar(5), { left: slot(3), duration: 0.5 }, s(4))
  tl.to(bar(1), { left: slot(2), duration: 0.5 }, s(4))
  tl.to(bar(5), { left: slot(4), duration: 0.5 }, s(4) + 0.6)
  tl.to(bar(3), { left: slot(3), duration: 0.5 }, s(4) + 0.6)
  tl.to(bar(5), { backgroundColor: color('ok'), duration: 0.3 }, s(4) + 1.1)
  return tl
})
