import { animeScene } from '@lincyaw/addon-motion/scene'

// Breadth-first search, one level per step: the tree edges are drawn over the graph from parent to child
// (createDrawable on an overlay path) and the reached nodes fill. Node fill is an SVG attribute tweened between two rgb() colors.
const NODES: Record<string, [number, number]> = { A: [110, 225], B: [290, 110], C: [290, 340], D: [480, 70], E: [480, 225], F: [480, 380], G: [670, 225] }
const EDGES = ['AB', 'AC', 'BD', 'BE', 'CE', 'CF', 'DG', 'EG', 'FG']
const LEVELS = [['AB', 'AC'], ['BD', 'BE', 'CF'], ['DG']]

export default animeScene(({ root, anime, at, color }) => {
  const ink = color('ink')
  const accent = color('accent')
  const onAccent = color('on-accent')
  const surface = color('surface')
  const line = color('line-strong')
  const seg = (e: string) => {
    const [x1, y1] = NODES[e[0]]
    const [x2, y2] = NODES[e[1]]
    return `M ${x1} ${y1} L ${x2} ${y2}`
  }
  root.innerHTML = `
    <svg viewBox="0 0 800 450" width="100%" height="100%" style="font-family: var(--pm-font-sans)">
      ${EDGES.map(e => `<path class="edge" d="${seg(e)}" stroke="${line}" stroke-width="2.5" />`).join('')}
      ${EDGES.map(e => `<path class="tree" data-e="${e}" d="${seg(e)}" stroke="${accent}" stroke-width="7" stroke-linecap="round" fill="none" />`).join('')}
      ${Object.entries(NODES).map(([n, [x, y]]) => `
        <g class="node" style="transform-box: fill-box; transform-origin: center">
          <circle data-n="${n}" cx="${x}" cy="${y}" r="28" fill="${surface}" stroke="${ink}" stroke-width="2.5" />
          <text data-t="${n}" x="${x}" y="${y + 8}" text-anchor="middle" font-size="24" font-weight="600" fill="${ink}">${n}</text>
        </g>`).join('')}
    </svg>`
  const $ = (s: string) => root.querySelector(s)!
  const reach = (n: string, t: number) => {
    tl.add($(`[data-n="${n}"]`), { fill: [surface, accent], stroke: [ink, accent], duration: 300 }, t)
    tl.add($(`[data-t="${n}"]`), { fill: [ink, onAccent], duration: 300 }, t)
  }
  const tl = anime.createTimeline({ autoplay: false, defaults: { ease: 'outQuad' } })
  // Every overlay starts undrawn; the drawable proxy keeps that until its own tween.
  anime.svg.createDrawable('.tree', 0, 0)
  // Step 0: the graph pops in, and the start node A is reached.
  tl.add('.node', { scale: [0, 1], duration: 400, delay: anime.stagger(60), ease: 'outBack' }, at(0))
  tl.add('.edge', { opacity: [0, 1], duration: 400 }, at(0) + 200)
  reach('A', at(0) + 700)
  // Steps 1-3: one BFS level each: the tree edges draw, then their children fill.
  LEVELS.forEach((level, k) => {
    tl.add(anime.svg.createDrawable(level.map(e => `[data-e="${e}"]`).join(',')), { draw: ['0 0', '0 1'], duration: 500, delay: anime.stagger(120) }, at(k + 1))
    for (const e of level) reach(e[1], at(k + 1) + 500 + level.indexOf(e) * 120)
  })
  return tl
})
