import { animeScene } from '@lincyaw/addon-motion/scene'

// Seeded randomness: the points come from anime.createSeededRandom, and stagger({ from: 'random', seed }) orders their entrance,
// so every load and every export frame is the same. Plain Math.random or stagger({ from: 'random' }) without a seed is not.
// Then two rounds of k-means: points take their nearest centroid's color, centroids move to their clusters' means.
const CENTERS: Array<[number, number]> = [[220, 140], [560, 120], [420, 330]]

export default animeScene(({ root, anime, at, color }) => {
  const rnd = anime.createSeededRandom(42)
  const gauss = () => (rnd(0, 1000) + rnd(0, 1000) + rnd(0, 1000) - 1500) / 1500
  const points = Array.from({ length: 90 }, (_, i) => {
    const [cx, cy] = CENTERS[i % 3]
    return [cx + gauss() * 120, cy + gauss() * 85] as [number, number]
  })
  const palette = [color('accent'), color('warn'), color('ok')]
  const muted = color('muted')
  // k-means, run up front: the assignments and centroid positions of each round.
  let cents: Array<[number, number]> = [[150, 380], [300, 60], [700, 400]]
  const rounds: Array<{ assign: number[], cents: Array<[number, number]> }> = []
  for (let r = 0; r < 2; r++) {
    const assign = points.map(([x, y]) => {
      const d = cents.map(([cx, cy]) => (x - cx) ** 2 + (y - cy) ** 2)
      return d.indexOf(Math.min(...d))
    })
    const next = cents.map((c, k) => {
      const mine = points.filter((_, i) => assign[i] === k)
      return mine.length ? [mine.reduce((s, p) => s + p[0], 0) / mine.length, mine.reduce((s, p) => s + p[1], 0) / mine.length] as [number, number] : c
    })
    rounds.push({ assign, cents: next })
    cents = next
  }
  const start: Array<[number, number]> = [[150, 380], [300, 60], [700, 400]]
  root.innerHTML = `
    <svg viewBox="0 0 800 450" width="100%" height="100%">
      ${points.map(([x, y]) => `<circle class="pt" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="${muted}" />`).join('')}
      ${start.map(([x, y], k) => `<g transform="translate(${x} ${y})"><g class="c" data-k="${k}" style="transform-box: fill-box; transform-origin: center"><path d="M -14 -14 L 14 14 M 14 -14 L -14 14" stroke="${palette[k]}" stroke-width="7" stroke-linecap="round" /></g></g>`).join('')}
    </svg>`
  const pts = [...root.querySelectorAll('.pt')]
  const cs = [...root.querySelectorAll('.c')]
  const tl = anime.createTimeline({ autoplay: false, defaults: { ease: 'outQuad' } })
  // Step 0: the data appear in a seeded random order.
  tl.add(pts, { r: [0, 7], opacity: [0, 0.9], duration: 300, ease: 'outBack', delay: anime.stagger(12, { from: 'random', seed: 3 }) }, at(0))
  // Step 1: three centroids are placed, and each point takes the color of the nearest.
  tl.add(cs, { scale: [0, 1], rotate: [-90, 0], duration: 500, ease: 'outBack', delay: anime.stagger(120) }, at(1))
  pts.forEach((p, i) => tl.add(p, { fill: [muted, palette[rounds[0].assign[i]]], duration: 300 }, at(1) + 600 + (p as SVGCircleElement).cx.baseVal.value))
  // Steps 2-3: centroids move to their clusters' means; the points recolor.
  rounds.forEach((round, r) => {
    const t = at(2 + r)
    cs.forEach((c, k) => {
      // Bare `to` values: each move starts where the previous one ended (a later [from, to] breaks backward seeks).
      tl.add(c, { translateX: round.cents[k][0] - start[k][0], translateY: round.cents[k][1] - start[k][1], duration: 800, ease: 'inOutCubic' }, t)
    })
    if (r + 1 < rounds.length) {
      pts.forEach((p, i) => {
        const a = round.assign[i]
        const b = rounds[r + 1].assign[i]
        if (a !== b) tl.add(p, { fill: palette[b], duration: 300 }, t + 900)
      })
    }
  })
  return tl
})
