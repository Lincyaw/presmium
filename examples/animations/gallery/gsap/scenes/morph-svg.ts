import { gsapScene } from '@lincyaw/addon-motion/scene'

// MorphSVG: one <path> morphs between activation functions (step, sigmoid, tanh, ReLU); the name changes with
// `tl.set(..., { textContent })`. MorphSVG parses both shapes when the tween first renders and then only
// interpolates, so seeking is exact. The curve is drawn on with DrawSVG first (empty stroke set at build time).
const W = 600
const H = 330
const X0 = -4, X1 = 4, Y0 = -1.5, Y1 = 4.5
const px = (x: number) => 40 + (x - X0) / (X1 - X0) * (W - 80)
const py = (y: number) => H - 20 - (y - Y0) / (Y1 - Y0) * (H - 40)
const curve = (f: (x: number) => number) => {
  const pts: string[] = []
  for (let i = 0; i <= 80; i++) {
    const x = X0 + (X1 - X0) * i / 80
    pts.push(`${px(x).toFixed(1)},${py(f(x)).toFixed(1)}`)
  }
  return `M ${pts.join(' L ')}`
}
const FUNCTIONS = [
  { name: 'step(x)', d: curve(x => (x < 0 ? 0 : 1)) },
  { name: 'σ(x) = 1 / (1 + e⁻ˣ)', d: curve(x => 1 / (1 + Math.exp(-x))) },
  { name: 'tanh(x)', d: curve(Math.tanh) },
  { name: 'ReLU(x) = max(0, x)', d: curve(x => Math.max(0, x)) },
]

export default gsapScene(({ root, gsap, at }) => {
  root.innerHTML = `
    <style>
      .ms { width: 100%; height: 100%; }
      .ms__axis { stroke: var(--pm-color-line-strong); stroke-width: 1.5; }
      .ms__curve { fill: none; stroke: var(--pm-color-accent); stroke-width: 5; stroke-linejoin: round; stroke-linecap: round; }
      .ms__name { fill: var(--pm-color-ink); font: 600 24px var(--pm-font-mono); }
      .ms__tick { fill: var(--pm-color-muted); font: 14px var(--pm-font-mono); }
    </style>
    <svg class="ms" viewBox="0 0 ${W} ${H}">
      <line class="ms__axis" x1="${px(X0)}" y1="${py(0)}" x2="${px(X1)}" y2="${py(0)}"/>
      <line class="ms__axis" x1="${px(0)}" y1="${py(Y0)}" x2="${px(0)}" y2="${py(Y1)}"/>
      <text class="ms__tick" x="${px(0) + 6}" y="${py(1) + 5}">1</text>
      <line class="ms__axis" x1="${px(0) - 5}" y1="${py(1)}" x2="${px(0) + 5}" y2="${py(1)}"/>
      <path class="ms__curve" d="${FUNCTIONS[0].d}"/>
      <text class="ms__name" x="60" y="50">${FUNCTIONS[0].name}</text>
    </svg>`
  const s = (k: number) => at(k) / 1000
  gsap.set('.ms__curve', { drawSVG: 0 })
  const tl = gsap.timeline()
  // Step 0: the perceptron's step function is drawn.
  tl.to('.ms__curve', { drawSVG: '100%', duration: 0.9, ease: 'power1.inOut' }, s(0))
  tl.from('.ms__name', { opacity: 0, y: 10, duration: 0.3 }, s(0))
  // Steps 1-3: the same path becomes sigmoid, tanh, then ReLU.
  FUNCTIONS.slice(1).forEach((f, i) => {
    tl.to('.ms__curve', { morphSVG: f.d, duration: 0.9, ease: 'power2.inOut' }, s(i + 1))
    tl.to('.ms__name', { opacity: 0, duration: 0.15 }, s(i + 1))
    tl.set('.ms__name', { textContent: f.name }, s(i + 1) + 0.15)
    tl.to('.ms__name', { opacity: 1, duration: 0.2 }, s(i + 1) + 0.15)
  })
  return tl
})
