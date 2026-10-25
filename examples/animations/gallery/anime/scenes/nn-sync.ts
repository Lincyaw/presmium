import { animeScene } from '@lincyaw/addon-motion/scene'

// Timeline labels and sync: each layer's activation is its own paused animation (anime.animate, autoplay: false),
// placed on the timeline with tl.sync at a label. A synced child is seeked with the timeline; it must not autoplay.
const LAYERS = [3, 5, 5, 2]
const X = [130, 320, 510, 690]
const y = (n: number, i: number) => 225 + (i - (n - 1) / 2) * 78

export default animeScene(({ root, anime, at, color }) => {
  const ink = color('ink')
  const accent = color('accent')
  const surface = color('surface')
  const line = color('line')
  let edges = ''
  for (let l = 0; l + 1 < LAYERS.length; l++) {
    for (let i = 0; i < LAYERS[l]; i++) {
      for (let j = 0; j < LAYERS[l + 1]; j++) edges += `<line class="w w${l}" x1="${X[l]}" y1="${y(LAYERS[l], i)}" x2="${X[l + 1]}" y2="${y(LAYERS[l + 1], j)}" stroke="${line}" stroke-width="1.5" />`
    }
  }
  root.innerHTML = `
    <svg viewBox="0 0 800 450" width="100%" height="100%" style="font-family: var(--pm-font-sans)">
      ${edges}
      ${LAYERS.map((n, l) => Array.from({ length: n }, (_, i) => `<circle class="n n${l}" cx="${X[l]}" cy="${y(n, i)}" r="20" fill="${surface}" stroke="${ink}" stroke-width="2" />`).join('')).join('')}
      ${['输入', '隐藏层 1', '隐藏层 2', '输出'].map((t, l) => `<text x="${X[l]}" y="430" text-anchor="middle" font-size="18" fill="${color('muted')}">${t}</text>`).join('')}
    </svg>`
  const layer = (l: number) => {
    // One layer's activation: the incoming weights glow, then its neurons fill.
    const a = anime.createTimeline({ autoplay: false })
    if (l > 0) a.add(`.w${l - 1}`, { stroke: [line, accent], strokeWidth: [1.5, 3], duration: 300, ease: 'outQuad' }, 0)
    a.add(`.n${l}`, { fill: [surface, accent], duration: 300, delay: anime.stagger(50) }, l > 0 ? 250 : 0)
    if (l > 0) a.add(`.w${l - 1}`, { stroke: line, strokeWidth: 1.5, duration: 300 }, 550)
    return a
  }
  const tl = anime.createTimeline({ autoplay: false })
  // Step 0: the network fades in.
  tl.add('.n, .w', { opacity: [0, 1], duration: 500, ease: 'outQuad' }, at(0))
  // Step 1: the forward pass, one label per layer.
  LAYERS.forEach((_, l) => tl.label(`layer${l}`, at(1) + l * 550))
  LAYERS.forEach((_, l) => tl.sync(layer(l), `layer${l}`))
  // Step 2: the output with the larger value is the prediction.
  tl.add(root.querySelectorAll('.n3')[0], { r: [20, 28], duration: 400, ease: 'outBack' }, at(2))
  tl.add(root.querySelectorAll('.n3')[1], { fill: surface, duration: 400 }, at(2))
  return tl
})
