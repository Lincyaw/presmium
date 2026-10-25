import { gsapScene } from '@lincyaw/addon-motion/scene'

// DrawSVG: a breadth-first search draws the tree's edges level by level, then a path to one leaf is traced.
// A `fromTo` placed at a later step leaves the stroke fully drawn before that step, so the empty stroke
// (`drawSVG: 0`) is set once with `gsap.set` when the scene is built.
const NODES: Record<string, [number, number]> = {
  A: [320, 50], B: [170, 150], C: [470, 150],
  D: [90, 270], E: [240, 270], F: [400, 270], G: [550, 270],
}
const EDGES: [string, string][] = [['A', 'B'], ['A', 'C'], ['B', 'D'], ['B', 'E'], ['C', 'F'], ['C', 'G']]
const PATH = ['A', 'C', 'F']

export default gsapScene(({ root, gsap, at, color }) => {
  const line = ([a, b]: [string, string], cls: string) => `<line class="${cls}" data-to="${b}" x1="${NODES[a][0]}" y1="${NODES[a][1]}" x2="${NODES[b][0]}" y2="${NODES[b][1]}"/>`
  const trace = PATH.map(n => NODES[n].join(',')).join(' ')
  root.innerHTML = `
    <style>
      .ds { width: 100%; height: 100%; }
      .ds__edge { stroke: var(--pm-color-line-strong); stroke-width: 4; stroke-linecap: round; }
      .ds__trace { fill: none; stroke: var(--pm-color-accent); stroke-width: 9; stroke-linecap: round; stroke-linejoin: round; opacity: 0.55; }
      .ds__node circle { fill: var(--pm-color-surface); stroke: var(--pm-color-line-strong); stroke-width: 3; }
      .ds__node text { fill: var(--pm-color-ink); font: 600 22px var(--pm-font-mono); text-anchor: middle; dominant-baseline: central; }
    </style>
    <svg class="ds" viewBox="0 0 640 330">
      <polyline class="ds__trace" points="${trace}"/>
      ${EDGES.map(e => line(e, 'ds__edge')).join('')}
      ${Object.entries(NODES).map(([n, [x, y]]) => `<g class="ds__node" data-node="${n}"><circle cx="${x}" cy="${y}" r="24"/><text x="${x}" y="${y}">${n}</text></g>`).join('')}
    </svg>`
  const s = (k: number) => at(k) / 1000
  const edges = (...to: string[]) => to.map(n => root.querySelector(`.ds__edge[data-to="${n}"]`)!)
  const nodes = (...ns: string[]) => ns.map(n => root.querySelector(`[data-node="${n}"] circle`)!)
  const visit = { fill: color('accent'), stroke: color('accent'), duration: 0.3 }
  gsap.set('.ds__edge, .ds__trace', { drawSVG: 0 })
  const tl = gsap.timeline()
  // Step 0: the nodes appear and the root is visited.
  tl.from('.ds__node', { scale: 0, transformOrigin: '50% 50%', duration: 0.4, ease: 'back.out(2)', stagger: 0.06 }, s(0))
  tl.to(nodes('A'), visit, s(0) + 0.6)
  // Step 1: the first level: the edges draw from the root, then B and C are visited.
  tl.to(edges('B', 'C'), { drawSVG: '100%', duration: 0.6, ease: 'power1.inOut' }, s(1))
  tl.to(nodes('B', 'C'), visit, s(1) + 0.6)
  // Step 2: the second level.
  tl.to(edges('D', 'E', 'F', 'G'), { drawSVG: '100%', duration: 0.6, ease: 'power1.inOut' }, s(2))
  tl.to(nodes('D', 'E', 'F', 'G'), { ...visit, stagger: 0.08 }, s(2) + 0.6)
  // Step 3: the path from A to F is traced as one thick stroke.
  tl.to('.ds__trace', { drawSVG: '100%', duration: 0.8, ease: 'power2.inOut' }, s(3))
  return tl
})
