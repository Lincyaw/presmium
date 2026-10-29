import { d3Scene } from '@lincyaw/addon-motion/scene'
import type { HierarchyNode, HierarchyPointNode } from 'd3'
import { phaser, stage } from '../../../lengths/scenes/kit/d3-fx.ts'
import { columns } from './lib/code.ts'

// Decision tree, with D3: a question tree grows level by level, then one case is walked from the root to its answer.
// D3's tree layout places the nodes; `orientation` is `vertical` (top down, default) or `horizontal` (left to right).
// `root` (1.2 s): the first question pops in (0.45 s, a small overshoot: it is new) and rests.
// `grow` (3 s): one level at a time, each in an equal share of the state: the elbow links draw out of the parent
// (0.45 s), their answer labels fade in at the bend, and each child pops in as its link arrives (cause, then effect).
// `trace` (3 s): one case is followed: an accent line runs down the chosen links, one link at a time, and each node
// it reaches takes an accent outline; the branches not taken dim to a third as the line leaves them behind.
// `answer` (2.3 s): the leaf reached fills with the accent, grows 8% and settles (the payoff), then holds.
// Node widths come from the text's columns (a CJK character is two), never from measuring. Merges HyperFrames
// flowchart-vertical (the same tree, portrait) as `orientation`; the cursor and the typo fix are left out (decor).
// Adapted from HyperFrames flowchart.
interface Node { label: string, edge?: string, children?: Node[] }
const TREE: Node = {
  label: '数据量很大吗？',
  children: [
    { edge: '否', label: '插入排序' },
    {
      edge: '是', label: '需要稳定排序？',
      children: [
        { edge: '是', label: '归并排序' },
        { edge: '否', label: '怕最坏情况？', children: [{ edge: '是', label: '堆排序' }, { edge: '否', label: '快速排序' }] },
      ],
    },
  ],
}
const W = 1280, H = 720, FS = 30, NH = 72

export default d3Scene(({ root, d3, at, color, parameters }) => {
  const tree = (parameters.tree as Node | undefined) ?? TREE
  const choice = Array.isArray(parameters.path) ? (parameters.path as number[]) : [1, 1, 1]
  const vertical = parameters.orientation !== 'horizontal'
  const h = d3.hierarchy(tree, d => d.children)
  const depth = h.height
  const span = vertical ? [W - 160, H - 160] : [H - 120, W - 300]
  d3.tree<Node>().size([span[0]!, span[1]!]).separation((a, b) => (a.parent === b.parent ? 1 : 1.25))(h)
  // The layout's breadth is centred on the frame: an unbalanced tree would otherwise lean to one side.
  const xs = h.descendants().map(d => (d as HierarchyPointNode<Node>).x)
  const shift = (span[0]! - (Math.max(...xs) + Math.min(...xs))) / 2
  const pos = (d: HierarchyNode<Node>): [number, number] => {
    const p = d as HierarchyPointNode<Node>
    return vertical ? [80 + p.x + shift, 80 + p.y] : [150 + p.y, 60 + p.x + shift]
  }
  const width = (d: HierarchyNode<Node>) => columns(d.data.label) * FS * 0.5 + 48
  // The walked path: the nodes from the root down the chosen children.
  const walked: HierarchyNode<Node>[] = [h]
  for (const c of choice) { const next = walked.at(-1)!.children?.[c]; if (!next) break; walked.push(next) }
  const onPath = new Set(walked)

  const ink = color('ink'), muted = color('muted'), accent = color('accent'), surface = color('surface')
  const svg = stage(d3, root)
  const link = (d: HierarchyNode<Node>) => {
    const [px, py] = pos(d.parent!), [cx, cy] = pos(d)
    if (vertical) { const m = (py + NH / 2 + cy - NH / 2) / 2; return `M ${px} ${py + NH / 2} V ${m} H ${cx} V ${cy - NH / 2}` }
    const sx = px + width(d.parent!) / 2, ex = cx - width(d) / 2, m = (sx + ex) / 2
    return `M ${sx} ${py} H ${m} V ${cy} H ${ex}`
  }
  const nodes = h.descendants(), kids = nodes.filter(d => d.parent)
  const links = svg.append('g').selectAll('path').data(kids).join('path').attr('d', link).attr('fill', 'none')
    .attr('stroke', color('line-strong')).attr('stroke-width', 3).attr('pathLength', 1).attr('stroke-dasharray', '1 1')
  const traced = svg.append('g').selectAll('path').data(walked.slice(1)).join('path').attr('d', link).attr('fill', 'none')
    .attr('stroke', accent).attr('stroke-width', 6).attr('stroke-linecap', 'round').attr('pathLength', 1).attr('stroke-dasharray', '1 1')
  const edgeLabel = svg.append('g').selectAll('text').data(kids).join('text').attr('font-size', 22).attr('font-weight', 600).attr('text-anchor', 'middle')
    .attr('x', d => (vertical ? pos(d)[0] + (pos(d)[0] < pos(d.parent!)[0] ? -22 : 22) : (pos(d.parent!)[0] + width(d.parent!) / 2 + pos(d)[0] - width(d) / 2) / 2))
    .attr('y', d => (vertical ? (pos(d.parent!)[1] + pos(d)[1]) / 2 + 30 : pos(d)[1] - 12)).text(d => d.data.edge ?? '')
  const g = svg.append('g').selectAll('g').data(nodes).join('g')
  const box = g.append('rect').attr('x', d => -width(d) / 2).attr('y', -NH / 2).attr('width', width).attr('height', NH).attr('rx', d => (d.children ? 12 : NH / 2))
  const label = g.append('text').attr('text-anchor', 'middle').attr('y', FS * 0.36).attr('font-size', FS).attr('font-weight', d => (d.children ? 600 : 500)).text(d => d.data.label)

  const ph = phaser(at)
  const pop = d3.easeBackOut.overshoot(1.7)
  // In `grow`, level L (1..depth) has the slice [(L−1)/depth, L/depth) of the state: link first, then the child.
  const level = (ms: number, d: HierarchyNode<Node>, from: number, to: number) => ph(ms, 1, (d.depth - 1 + from) / depth, (d.depth - 1 + to) / depth)
  // In `trace`, link i of the path has the slice [i/n, (i+1)/n).
  const steps = Math.max(1, walked.length - 1)
  const along = (ms: number, i: number, from = 0, to = 1) => ph(ms, 2, (i + from) / steps, (i + to) / steps)
  const reached = (ms: number, d: HierarchyNode<Node>) => {
    const i = walked.indexOf(d)
    return i < 0 ? 0 : i === 0 ? ph(ms, 2, 0, 0.05) : d3.easeCubicOut(along(ms, i - 1, 0.6, 0.8))
  }
  // A node off the path dims once the trace has passed its parent.
  const dim = (ms: number, d: HierarchyNode<Node>) => {
    if (onPath.has(d) || !d.parent) return 0
    const i = walked.indexOf(d.parent)
    return i < 0 ? ph(ms, 2, 0, 0.15) : d3.easeCubicInOut(along(ms, i, 0.3, 0.7))
  }
  const leaf = walked.at(-1)!

  return (ms: number) => {
    const shown = (d: HierarchyNode<Node>) => (d.depth === 0 ? ph(ms, 0, 0.05, 0.45) : level(ms, d, 0.45, 0.85))
    links.attr('stroke-dashoffset', d => 1 - d3.easeCubicInOut(level(ms, d, 0, 0.55))).attr('opacity', d => 1 - 0.68 * dim(ms, d))
    edgeLabel.attr('opacity', d => level(ms, d, 0.35, 0.65) * (1 - 0.68 * dim(ms, d)))
      .attr('fill', d => (onPath.has(d) ? d3.interpolateRgb(muted, accent)(reached(ms, d)) : muted))
    traced.attr('stroke-dashoffset', (_, i) => 1 - d3.easeCubicInOut(along(ms, i, 0, 0.65)))
      .attr('opacity', (_, i) => (along(ms, i) > 0 ? 1 : 0))
    const fill = (d: HierarchyNode<Node>) => (d === leaf ? d3.easeCubicOut(ph(ms, 3, 0, 0.18)) : 0)
    g.attr('transform', d => {
      // The answer's emphasis: 8% out in 150 ms, back in 400 ms with a small settle.
      const [x, y] = pos(d), s = shown(d), grow = d === leaf ? 1 + 0.08 * (d3.easeQuadOut(ph(ms, 3, 0, 0.065)) - d3.easeBackOut(ph(ms, 3, 0.065, 0.24))) : 1
      return `translate(${x}, ${y}) scale(${(s > 0 ? 0.6 + 0.4 * pop(s) : 0.6) * grow})`
    }).attr('opacity', d => Math.min(1, shown(d) * 3) * (1 - 0.68 * dim(ms, d)))
    box.attr('fill', d => d3.interpolateRgb(d.children ? surface : color('sunk'), accent)(fill(d)))
      .attr('stroke', d => d3.interpolateRgb(color('line-strong'), accent)(reached(ms, d))).attr('stroke-width', d => 2 + 2 * reached(ms, d))
    label.attr('fill', d => d3.interpolateRgb(ink, color('on-accent'))(fill(d)))
  }
})
