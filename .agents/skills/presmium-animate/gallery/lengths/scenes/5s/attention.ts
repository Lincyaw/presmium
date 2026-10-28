import { d3Scene } from '@lincyaw/addon-motion/scene'

// Self-attention as a project-page loop, with D3: a sentence, and one word ("它") reaching out to every other word
// at once. `tokens`: the word lights up. `attend`: arcs grow from it to all the others together (nearest first,
// but within 0.4 s): the point is that no word waits for another. `focus`: each arc thickens to its weight and the
// word it is mostly about ("小猫") lights up. `release`: everything returns to the first frame, so the loop has no
// seam. D3 lays out the arcs; the drawing function sets every attribute from the time.
const TOKENS = ['小猫', '没有', '过', '马路', '因为', '它', '太', '累', '了']
const FROM = 5
// Illustrative weights of 它 over the sentence, not measured from a model.
const WEIGHTS = [0.46, 0.05, 0.04, 0.14, 0.05, 0.08, 0.03, 0.12, 0.03]

export default d3Scene(({ root, d3, at, color, parameters }) => {
  const caption = (parameters.caption as string | undefined) ?? '自注意力：一个词一步就看到整句话（权重为示意）'
  const W = 1280, Y = 470
  const x = d3.scalePoint<number>().domain(d3.range(TOKENS.length)).range([150, 1130])
  const width = d3.scaleLinear().domain([0, 0.5]).range([2, 22])
  const accent = color('accent'), soft = color('accent-soft'), line = color('line-strong'), surface = color('surface'), ink = color('ink'), on = color('on-accent')
  const svg = d3.select(root).append('svg').attr('viewBox', `0 0 ${W} 720`).attr('width', '100%').attr('height', '100%')
    .style('display', 'block').style('font-family', 'var(--pm-font-sans)')
  const arc = (j: number) => {
    const x0 = x(FROM)!, x1 = x(j)!, lift = 40 + Math.abs(x1 - x0) * 0.3
    return `M ${x0} ${Y - 46} Q ${(x0 + x1) / 2} ${Y - 46 - lift * 2} ${x1} ${Y - 46}`
  }
  const others = d3.range(TOKENS.length).filter(j => j !== FROM)
  const arcs = svg.append('g').attr('fill', 'none').attr('stroke-linecap', 'butt').selectAll('path').data(others).join('path')
    .attr('d', arc).attr('pathLength', 1).attr('stroke-dasharray', 1).attr('stroke', accent)
  const chips = svg.append('g').selectAll('g').data(TOKENS).join('g').attr('transform', (_, i) => `translate(${x(i)}, ${Y})`)
  const boxes = chips.append('rect').attr('x', -52).attr('y', -40).attr('width', 104).attr('height', 80).attr('rx', 16).attr('stroke-width', 3)
  const words = chips.append('text').attr('text-anchor', 'middle').attr('dy', '0.35em').attr('font-size', 38).attr('font-weight', 600).text(d => d)
  const note = svg.append('text').attr('x', W / 2).attr('y', 110).attr('text-anchor', 'middle').attr('font-size', 40).attr('font-weight', 600).attr('fill', accent).text('“它”说的是“小猫”')
  svg.append('text').attr('x', W / 2).attr('y', 620).attr('text-anchor', 'middle').attr('font-size', 26).attr('fill', color('muted')).text(caption)

  const ph = (ms: number, k: number, from = 0, to = 1) => Math.max(0, Math.min(1, ((ms - at(k)) / (at(k + 1) - at(k)) - from) / (to - from)))
  const ease = d3.easeCubicInOut
  const reach = d3.scaleLinear().domain([0, d3.max(others, j => Math.abs(j - FROM))!]).range([0, 0.4])
  return (ms: number) => {
    const back = ease(ph(ms, 3, 0, 0.8))                       // release: 1 → 0 over the last state
    const lit = ease(ph(ms, 0, 0.1, 0.6)) * (1 - back)        // 它 lit
    const focus = ease(ph(ms, 2, 0, 0.6)) * (1 - back)        // weights shown, 小猫 lit
    arcs.attr('stroke-dashoffset', j => 1 - ease(ph(ms, 1, reach(Math.abs(j - FROM)), reach(Math.abs(j - FROM)) + 0.5)) * (1 - back))
      .attr('stroke-width', j => 3 + (width(WEIGHTS[j]!) - 3) * focus)
      .attr('stroke-opacity', j => 0.6 + (0.25 + (0.75 * WEIGHTS[j]!) / 0.46 - 0.6) * focus)
    boxes.attr('fill', (_, i) => i === FROM ? d3.interpolateRgb(surface, soft)(lit) : i === 0 ? d3.interpolateRgb(surface, accent)(focus) : surface)
      .attr('stroke', (_, i) => i === FROM ? d3.interpolateRgb(line, accent)(lit) : i === 0 ? d3.interpolateRgb(line, accent)(focus) : line)
    words.attr('fill', (_, i) => i === 0 ? d3.interpolateRgb(ink, on)(focus) : ink)
    note.attr('opacity', ease(ph(ms, 2, 0.3, 0.8)) * (1 - back))
  }
})
