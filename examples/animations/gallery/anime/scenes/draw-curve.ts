import { animeScene } from '@lincyaw/addon-motion/scene'

// svg.createDrawable: the axes draw themselves, then sin x, then a highlighted window slides along the curve.
// `draw: 'start end'` is a fraction of the length; the proxy sets pathLength=1000, so dash attributes must not be set by hand.
const X0 = 70
const Y0 = 225
const plot = (f: (x: number) => number) => {
  const points: string[] = []
  for (let i = 0; i <= 120; i++) {
    const x = (i / 120) * 2 * Math.PI
    points.push(`${i ? 'L' : 'M'} ${(X0 + x * 105).toFixed(1)} ${(Y0 - f(x) * 140).toFixed(1)}`)
  }
  return points.join(' ')
}

export default animeScene(({ root, anime, at, color }) => {
  const ink = color('ink')
  const accent = color('accent')
  const muted = color('muted')
  root.innerHTML = `
    <svg viewBox="0 0 800 450" width="100%" height="100%" style="font-family: var(--pm-font-sans)">
      <path class="axis" d="M ${X0} ${Y0} L 760 ${Y0}" stroke="${muted}" stroke-width="2" fill="none" />
      <path class="axis" d="M ${X0} 400 L ${X0} 50" stroke="${muted}" stroke-width="2" fill="none" />
      <text class="label" x="770" y="${Y0 + 6}" fill="${muted}" font-size="20">x</text>
      <text class="label" x="${X0 - 8}" y="40" fill="${muted}" font-size="20" text-anchor="middle">y</text>
      <path id="sin" d="${plot(Math.sin)}" stroke="${ink}" stroke-width="3" fill="none" />
      <path id="window" d="${plot(Math.sin)}" stroke="${accent}" stroke-width="9" stroke-linecap="round" fill="none" />
      <text class="label" x="300" y="70" fill="${ink}" font-size="26" font-style="italic">y = sin x</text>
    </svg>`
  const tl = anime.createTimeline({ autoplay: false, defaults: { ease: 'inOutQuad' } })
  // Step 0: the axes, one after the other.
  tl.add(anime.svg.createDrawable('.axis'), { draw: ['0 0', '0 1'], duration: 600, delay: anime.stagger(150) }, at(0))
  tl.add('.label', { opacity: [0, 1], duration: 300 }, at(0) + 600)
  // Step 1: the curve, from its start to its end.
  tl.add(anime.svg.createDrawable('#sin'), { draw: ['0 0', '0 1'], duration: 1400, ease: 'inOutSine' }, at(1))
  // Step 2: a window of a fifth of the curve slides from start to end.
  tl.add(anime.svg.createDrawable('#window'), { draw: ['0 0', '0 0.2'], duration: 300 }, at(2))
  tl.add(anime.svg.createDrawable('#window'), { draw: '0.8 1', duration: 1400, ease: 'linear' }, at(2) + 300)
  return tl
})
