import { animeScene } from '@lincyaw/addon-motion/scene'

// svg.morphTo: the Taylor polynomials of sin x morph one into the next (x, x - x^3/3!, ...).
// The target curves live in <defs> (never drawn; morphTo only reads them). Every curve has the same commands, so morphTo(target, 0) interpolates point by point in x; the default precision
// resamples by arc length, which slides points sideways between curves of different lengths. morphTo returns [from, to],
// and a later [from, to] on the same property is not restored by a backward seek (Anime.js 4.5), so only the first morph
// uses morphTo; the next ones tween `d` to the target's string, starting where the previous one ended.
const N = 160
const X0 = 400
const Y0 = 225
const SX = 52
const SY = 110
const curve = (f: (x: number) => number) => {
  const points: string[] = []
  for (let i = 0; i <= N; i++) {
    const x = -7 + (14 * i) / N
    const y = Math.max(-4, Math.min(4, f(x)))
    points.push(`${i ? 'L' : 'M'} ${(X0 + x * SX).toFixed(1)} ${(Y0 - y * SY).toFixed(1)}`)
  }
  return points.join(' ')
}
const fact = (n: number): number => (n <= 1 ? 1 : n * fact(n - 1))
const taylor = (terms: number) => (x: number) => {
  let s = 0
  for (let k = 0; k < terms; k++) s += ((-1) ** k * x ** (2 * k + 1)) / fact(2 * k + 1)
  return s
}
const LABELS = ['x', 'x − x³/3!', '… + x⁵/5!', '… − x⁷/7! + x⁹/9!']
const TERMS = [1, 2, 3, 5]

export default animeScene(({ root, anime, at, color }) => {
  const ink = color('ink')
  const accent = color('accent')
  const muted = color('muted')
  root.innerHTML = `
    <svg viewBox="0 0 800 450" width="100%" height="100%" style="font-family: var(--pm-font-sans)">
      <path d="M 30 ${Y0} L 770 ${Y0} M ${X0} 20 L ${X0} 430" stroke="${muted}" stroke-width="1.5" />
      <path d="${curve(Math.sin)}" stroke="${ink}" stroke-width="2.5" stroke-dasharray="6 6" fill="none" />
      <text x="40" y="50" font-size="22" fill="${ink}">sin x</text>
      <defs>
        <clipPath id="plot"><rect x="20" y="10" width="760" height="430" /></clipPath>
        ${TERMS.map((t, i) => `<path id="p${i}" d="${curve(taylor(t))}" />`).join('')}
      </defs>
      <path id="approx" d="${curve(taylor(1))}" stroke="${accent}" stroke-width="4" fill="none" opacity="0" clip-path="url(#plot)" />
      ${LABELS.map((l, i) => `<text class="label" x="760" y="50" text-anchor="end" font-size="24" fill="${accent}" opacity="0">${l}</text>`).join('')}
    </svg>`
  const labels = root.querySelectorAll('.label')
  const tl = anime.createTimeline({ autoplay: false, defaults: { ease: 'inOutQuad' } })
  // Step 0: the first approximation, y = x.
  tl.add('#approx', { opacity: [0, 1], duration: 500 }, at(0))
  tl.add(labels[0], { opacity: [0, 1], duration: 400 }, at(0))
  // Steps 1-3: morph into the next polynomial while the label changes.
  for (let k = 1; k < TERMS.length; k++) {
    const d = k === 1 ? anime.svg.morphTo('#p1', 0) : root.querySelector(`#p${k}`)!.getAttribute('d')!
    tl.add('#approx', { d, duration: 1000 }, at(k))
    tl.add(labels[k - 1], { opacity: 0, duration: 300 }, at(k))
    tl.add(labels[k], { opacity: [0, 1], duration: 300 }, at(k) + 300)
  }
  return tl
})
