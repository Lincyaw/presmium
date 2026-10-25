import { gsapScene } from '@lincyaw/addon-motion/scene'

// Function-based values with a seeded random generator: k-means on 60 points. gsap.utils.random and
// stagger `from: 'random'` use Math.random, so they differ on every load (the lecture video would not match
// the preview); a seeded PRNG gives the same scatter every time. Values are computed per target at build time.
const K = 3
const N = 60
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export default gsapScene(({ root, gsap, at, color }) => {
  const rand = mulberry32(7)
  const centres = [[25, 35], [70, 30], [50, 75]]
  // Points around three true centres (Box-Muller for a normal spread), in % of the scene.
  const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand())
  const pts = Array.from({ length: N }, (_, i) => {
    const [cx, cy] = centres[i % K]
    return [cx + gauss() * 8, cy + gauss() * 9]
  })
  // Two rounds of k-means from poor starting means.
  let means = [[45, 20], [55, 22], [50, 30]]
  const rounds: { label: number[], means: number[][] }[] = []
  for (let r = 0; r < 2; r++) {
    const label = pts.map(p => means.map(m => (m[0] - p[0]) ** 2 + (m[1] - p[1]) ** 2).reduce((b, d, j, ds) => (d < ds[b] ? j : b), 0))
    means = means.map((m, j) => {
      const mine = pts.filter((_, i) => label[i] === j)
      return mine.length ? [0, 1].map(d => mine.reduce((a, p) => a + p[d], 0) / mine.length) : m
    })
    rounds.push({ label, means })
  }
  const start = [[45, 20], [55, 22], [50, 30]]
  const hue = [color('accent'), color('warn'), color('danger')]
  root.innerHTML = `
    <style>
      .sd__p, .sd__m { position: absolute; border-radius: 50%; transform: translate(-50%, -50%); }
      .sd__p { width: 0.7rem; height: 0.7rem; background: var(--pm-color-muted); }
      .sd__m { width: 1.6rem; height: 1.6rem; border: 0.3rem solid var(--pm-color-ink); box-sizing: border-box; opacity: 0; }
    </style>
    ${pts.map(([x, y]) => `<div class="sd__p" style="left:${x}%;top:${y}%"></div>`).join('')}
    ${start.map(([x, y], j) => `<div class="sd__m" style="left:${x}%;top:${y}%;border-color:${hue[j]}"></div>`).join('')}`
  const s = (k: number) => at(k) / 1000
  const means$ = [...root.querySelectorAll<HTMLElement>('.sd__m')]
  const tl = gsap.timeline()
  // Step 0: the points scatter in, in a shuffled but seeded order (function-based delays from the PRNG).
  const order = pts.map(() => rand())
  tl.from('.sd__p', { scale: 0, duration: 0.3, ease: 'back.out(3)', stagger: (i: number) => order[i] * 0.8 }, s(0))
  tl.to(means$, { opacity: 1, duration: 0.3 }, s(0) + 0.9)
  rounds.forEach(({ label, means: m }, r) => {
    // Step 1 + 2r: each point takes the colour of its nearest mean.
    tl.to('.sd__p', { backgroundColor: (i: number) => hue[label[i]], duration: 0.4, stagger: 0.008 }, s(1 + 2 * r))
    // Step 2 + 2r: each mean moves to the centre of its points.
    tl.to(means$, { left: (j: number) => `${m[j][0]}%`, top: (j: number) => `${m[j][1]}%`, duration: 0.8, ease: 'power2.inOut' }, s(2 + 2 * r))
  })
  return tl
})
