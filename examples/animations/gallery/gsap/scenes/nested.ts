import { gsapScene } from '@lincyaw/addon-motion/scene'

// Nested timelines and labels: selection sort is simulated in JS while building, and each pass is a small
// timeline from `pass()` added at the label `step-k`. Building from a simulation keeps the scene's look a
// function of time: nothing is decided while it plays.
const VALUES = [6, 3, 8, 1, 5]
const slot = (i: number) => `${12 + i * 16}%`

export default gsapScene(({ root, gsap, at, color }) => {
  root.innerHTML = `
    <style>
      .ns__bar { position: absolute; bottom: 14%; width: 12%; display: flex; justify-content: center; padding-top: 0.4rem; border-radius: 0.4rem 0.4rem 0 0; background: var(--pm-color-line-strong); color: var(--pm-color-bg); font: 600 1.5rem var(--pm-font-mono); box-sizing: border-box; }
    </style>
    ${VALUES.map((v, i) => `<div class="ns__bar" data-v="${v}" style="left:${slot(i)};height:${v * 9}%">${v}</div>`).join('')}`
  const bars = VALUES.map(v => root.querySelector<HTMLElement>(`[data-v="${v}"]`)!)
  const order = [...bars]
  const lit = color('accent')
  const plain = color('line-strong')
  const done = color('ok')
  // One pass: scan for the minimum, then swap it to the front of the unsorted part.
  function pass(start: number) {
    const sub = gsap.timeline()
    let min = start
    sub.to(order[start], { backgroundColor: lit, duration: 0.15 })
    for (let j = start + 1; j < order.length; j++) {
      sub.to(order[j], { backgroundColor: lit, duration: 0.12 })
      if (Number(order[j].dataset.v) < Number(order[min].dataset.v)) {
        sub.to(order[min], { backgroundColor: plain, duration: 0.12 }, '<')
        min = j
      }
      else sub.to(order[j], { backgroundColor: plain, duration: 0.12 }, '+=0.05')
    }
    if (min !== start) {
      sub.to(order[min], { left: slot(start), duration: 0.5, ease: 'power1.inOut' })
      sub.to(order[start], { left: slot(min), duration: 0.5, ease: 'power1.inOut' }, '<')
      ;[order[start], order[min]] = [order[min], order[start]]
    }
    sub.to(order[start], { backgroundColor: done, duration: 0.2 })
    return sub
  }
  const tl = gsap.timeline()
  for (let k = 0; k < VALUES.length - 1; k++) {
    tl.addLabel(`step-${k}`, at(k) / 1000)
    tl.add(pass(k), `step-${k}`)
  }
  // The last bar is sorted when the others are.
  tl.to(order[VALUES.length - 1], { backgroundColor: done, duration: 0.2 }, '>')
  return tl
})
