import { gsapScene } from '@lincyaw/addon-motion/scene'

// gsap.utils at build time: `mapRange` turns data into heights, `interpolate` blends two token colours by value,
// `distribute` spreads a wave of delays from the centre, and `wrap` cycles the labels. All are computed once,
// so the timeline holds plain numbers and seeks exactly.
const DATA = [3, 7, 4, 9, 2, 6, 8, 5, 1, 7, 4, 6]

export default gsapScene(({ root, gsap, at, color }) => {
  const { mapRange, interpolate, distribute, wrap } = gsap.utils
  const max = Math.max(...DATA)
  const height = (v: number) => mapRange(0, max, 0, 70, v) // % of the scene's height
  const shade = interpolate(color('line-strong'), color('accent'))
  const label = wrap(['一', '二', '三', '四', '五', '六', '日'])
  const n = DATA.length
  const slot = (i: number) => 6 + i * (88 / n)
  root.innerHTML = `
    <style>
      .ut__bar { position: absolute; bottom: 16%; width: ${88 / n * 0.75}%; height: 0; border-radius: 0.3rem 0.3rem 0 0; background: var(--pm-color-line-strong); }
      .ut__lab { position: absolute; bottom: 6%; width: ${88 / n * 0.75}%; text-align: center; color: var(--pm-color-muted); font: 1rem var(--pm-font-sans); }
    </style>
    ${DATA.map((v, i) => `<div class="ut__bar" data-i="${i}" style="left:${slot(i)}%"></div><div class="ut__lab" data-i="${i}" style="left:${slot(i)}%">${label(i)}</div>`).join('')}`
  const s = (k: number) => at(k) / 1000
  const bars = [...root.querySelectorAll<HTMLElement>('.ut__bar')]
  const labs = [...root.querySelectorAll<HTMLElement>('.ut__lab')]
  // Rank of each bar when sorted by value (ties keep their order).
  const rank = DATA.map((v, i) => DATA.filter((w, j) => w < v || (w === v && j < i)).length)
  const tl = gsap.timeline()
  // Step 0: the bars grow to their values, in a wave from the centre (distribute as the stagger function).
  tl.to(bars, { height: (i: number) => `${height(DATA[i])}%`, duration: 0.6, ease: 'power2.out', stagger: distribute({ base: 0, amount: 0.5, from: 'center' }) }, s(0))
  // Step 1: each bar's colour is mixed by its value.
  tl.to(bars, { backgroundColor: (i: number) => shade(DATA[i] / max), duration: 0.5, stagger: 0.03 }, s(1))
  // Step 2: the bars move to their sorted places, labels with them.
  tl.to(bars, { left: (i: number) => `${slot(rank[i])}%`, duration: 0.9, ease: 'power2.inOut' }, s(2))
  tl.to(labs, { left: (i: number) => `${slot(rank[i])}%`, duration: 0.9, ease: 'power2.inOut' }, s(2))
  return tl
})
