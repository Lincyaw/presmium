import { d3Scene } from '@lincyaw/addon-motion/scene'
import { H, W, clamp, phase, stage } from './kit/stage.ts'

// d3.forceSimulation settles a graph, then a breadth-first shortest path lights up. The simulation is stopped
// and ticked a fixed number of times at build, keeping every tick's positions; a frame lerps between two ticks.
// Pitfalls: forceLink replaces source/target with the node objects (keep the index pairs apart), and the
// simulation's jitter uses its own random source; randomSource(d3.randomLcg(…)) makes the seed explicit.
export default d3Scene(({ root, d3, at, color }) => {
  const rnd = d3.randomLcg(9)
  const N = 34
  const pairs: [number, number][] = []
  for (let i = 1; i < N; i++) pairs.push([i, Math.floor(rnd() * i)]) // a random tree
  for (let k = 0; k < 12; k++) {
    const a = Math.floor(rnd() * N), b = Math.floor(rnd() * N)
    if (a !== b && !pairs.some(([s, t]) => (s === a && t === b) || (s === b && t === a))) pairs.push([a, b])
  }
  const nodes = d3.range(N).map(id => ({ id })) as { id: number, x?: number, y?: number }[]
  const sim = d3.forceSimulation(nodes).randomSource(d3.randomLcg(1))
    .force('link', d3.forceLink(pairs.map(([source, target]) => ({ source, target }))).distance(34))
    .force('charge', d3.forceManyBody().strength(-120))
    .force('x', d3.forceX(W / 2).strength(0.06)).force('y', d3.forceY(H / 2).strength(0.1))
    .stop()
  const frames = [nodes.map(n => [n.x!, n.y!] as const)]
  for (let i = 0; i < 200; i++) { sim.tick(); frames.push(nodes.map(n => [n.x!, n.y!] as const)) }
  // Fit the last frame into the box (the first frames are D3's phyllotaxis start, around the origin).
  const last = frames.at(-1)!
  const fx = d3.scaleLinear(d3.extent(last, d => d[0]) as [number, number], [40, W - 40])
  const fy = d3.scaleLinear(d3.extent(last, d => d[1]) as [number, number], [30, H - 30])
  const s = Math.min((fx.range()[1]! - fx.range()[0]!) / (fx.domain()[1]! - fx.domain()[0]!), (fy.range()[1]! - fy.range()[0]!) / (fy.domain()[1]! - fy.domain()[0]!))
  // Each frame is centred on its own mean, so the start (around the origin) and the end share the middle.
  const centres = frames.map(f => [d3.mean(f, d => d[0])!, d3.mean(f, d => d[1])!] as const)
  const fit = ([x, y]: readonly [number, number], [cx, cy]: readonly [number, number]) => [W / 2 + (x - cx) * s, H / 2 + (y - cy) * s] as const
  // Shortest path by BFS from node 0 to the farthest node.
  const adj = d3.range(N).map(() => [] as number[])
  pairs.forEach(([a, b]) => { adj[a]!.push(b); adj[b]!.push(a) })
  const prev = new Array<number>(N).fill(-1), dist = new Array<number>(N).fill(Infinity)
  dist[0] = 0
  for (const q = [0]; q.length;) { const u = q.shift()!; for (const v of adj[u]!) if (dist[v] === Infinity) { dist[v] = dist[u]! + 1; prev[v] = u; q.push(v) } }
  const goal = d3.maxIndex(dist)
  const path = [goal]
  while (path[0] !== 0) path.unshift(prev[path[0]!]!)
  const onPath = new Set(path.slice(1).map((v, i) => `${Math.min(v, path[i]!)}-${Math.max(v, path[i]!)}`))
  const svg = stage(d3, root)
  const lines = svg.append('g').attr('stroke-linecap', 'round').selectAll('line').data(pairs).join('line')
  const dots = svg.append('g').selectAll('circle').data(nodes).join('circle').attr('stroke', color('bg')).attr('stroke-width', 1.5)
  const packet = svg.append('circle').attr('r', 7).attr('fill', color('danger'))
  const muted = color('line-strong'), accent = color('accent'), danger = color('danger')
  return (ms: number) => {
    const p = phase(at, ms)
    const f = d3.easeCubicOut(p(1)) * (frames.length - 1)
    const a = frames[Math.floor(f)]!, b = frames[Math.min(frames.length - 1, Math.floor(f) + 1)]!
    const ca = centres[Math.floor(f)]!, cb = centres[Math.min(frames.length - 1, Math.floor(f) + 1)]!
    const c = [d3.interpolateNumber(ca[0], cb[0])(f % 1), d3.interpolateNumber(ca[1], cb[1])(f % 1)] as const
    const pos = nodes.map((_, i) => fit([d3.interpolateNumber(a[i]![0], b[i]![0])(f % 1), d3.interpolateNumber(a[i]![1], b[i]![1])(f % 1)], c))
    const appear = p(0)
    // Step 2: the path is walked edge by edge; the packet travels along it.
    const walk = p(2) * (path.length - 1)
    const reached = new Set(path.slice(0, Math.floor(walk) + 1))
    lines.attr('x1', d => pos[d[0]]![0]).attr('y1', d => pos[d[0]]![1]).attr('x2', d => pos[d[1]]![0]).attr('y2', d => pos[d[1]]![1])
      .attr('stroke', ([u, v]) => (onPath.has(`${Math.min(u, v)}-${Math.max(u, v)}`) && reached.has(u) && reached.has(v) ? danger : muted))
      .attr('stroke-width', ([u, v]) => (onPath.has(`${Math.min(u, v)}-${Math.max(u, v)}`) && reached.has(u) && reached.has(v) ? 4 : 1.5))
      .attr('opacity', clamp(appear * 2 - 1) * (1 - 0.5 * p(2, 0, 0.1)) + 0.5 * p(2, 0, 0.1) * clamp(appear * 2 - 1))
    dots.attr('cx', (_, i) => pos[i]![0]).attr('cy', (_, i) => pos[i]![1])
      .attr('r', (d, i) => (reached.has(i) && p(2) > 0 ? 8 : 6) * d3.easeBackOut(clamp(appear * 1.5 - (i / N) * 0.5)))
      .attr('fill', (_, i) => (p(2) > 0 && (i === 0 || i === goal || reached.has(i)) ? danger : accent))
    const seg = Math.min(path.length - 2, Math.floor(walk))
    const u = pos[path[seg]!]!, v = pos[path[seg + 1]!]!
    const t = walk - seg
    packet.attr('cx', d3.interpolateNumber(u[0], v[0])(t)).attr('cy', d3.interpolateNumber(u[1], v[1])(t)).attr('opacity', p(2) > 0 && p(2) < 1 ? 1 : 0)
  }
})
