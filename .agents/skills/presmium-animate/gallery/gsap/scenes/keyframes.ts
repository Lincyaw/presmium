import { gsapScene } from '@lincyaw/addon-motion/scene'

// Keyframes in a binary search: the mid pointer hops with array keyframes (`left` and `yPercent` together,
// `easeEach` per segment), discarded halves fade, and the found cell pulses with object keyframes.
// The search is run in JS while building, so every hop is known ahead of time.
const A = [2, 5, 8, 12, 16, 23, 38, 56, 72, 91]
const TARGET = 23
const slot = (i: number) => 5 + i * 9.2 // % of the width

export default gsapScene(({ root, gsap, at, color }) => {
  root.innerHTML = `
    <style>
      .kf__cell { position: absolute; top: 45%; width: 8%; aspect-ratio: 1; display: grid; place-items: center; border-radius: 0.5rem; background: var(--pm-color-surface); border: 2px solid var(--pm-color-line-strong); color: var(--pm-color-ink); font: 600 1.4rem var(--pm-font-mono); box-sizing: border-box; }
      .kf__ptr { position: absolute; top: 22%; width: 8%; text-align: center; color: var(--pm-color-accent); font: 600 1.1rem var(--pm-font-mono); }
      .kf__goal { position: absolute; left: 5%; top: 8%; color: var(--pm-color-muted); font: 1.1rem var(--pm-font-sans); }
    </style>
    <div class="kf__goal">查找 ${TARGET}</div>
    ${A.map((v, i) => `<div class="kf__cell" data-i="${i}" style="left:${slot(i)}%">${v}</div>`).join('')}
    <div class="kf__ptr">mid<br>▼</div>`
  const s = (k: number) => at(k) / 1000
  const cells = [...root.querySelectorAll<HTMLElement>('.kf__cell')]
  // Run the search now and record each probe.
  const probes: { mid: number, drop: number[] }[] = []
  let lo = 0
  let hi = A.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const drop: number[] = []
    if (A[mid] < TARGET) { for (let i = lo; i <= mid; i++) drop.push(i); lo = mid + 1 }
    else if (A[mid] > TARGET) { for (let i = mid; i <= hi; i++) drop.push(i); hi = mid - 1 }
    probes.push({ mid, drop })
    if (A[mid] === TARGET) break
  }
  gsap.set('.kf__ptr', { left: `${slot(probes[0].mid)}%`, opacity: 0 })
  // Text inside tweened boxes: no 3D layer mid-tween, so a frame looks the same however it was reached.
  const tl = gsap.timeline({ defaults: { force3D: false } })
  let at0 = probes[0].mid
  probes.forEach(({ mid, drop }, k) => {
    // Step k: the pointer hops to mid (array keyframes), then the half that cannot hold the target fades.
    if (k === 0) tl.to('.kf__ptr', { opacity: 1, duration: 0.3 }, s(0))
    else tl.to('.kf__ptr', { keyframes: { left: [`${slot(at0)}%`, `${slot(mid)}%`], yPercent: [0, -60, 0], easeEach: 'power1.inOut' }, duration: 0.6 }, s(k))
    tl.to(cells[mid], { borderColor: color('accent'), duration: 0.2 }, s(k) + 0.6)
    if (drop.length) tl.to(drop.map(i => cells[i]), { opacity: 0.2, duration: 0.4, stagger: 0.03 }, s(k) + 0.9)
    else tl.to(cells[mid], { keyframes: [{ scale: 1.3, backgroundColor: color('accent'), color: color('on-accent'), duration: 0.2 }, { scale: 1, duration: 0.3, ease: 'back.out(3)' }] }, s(k) + 0.9)
    at0 = mid
  })
  return tl
})
