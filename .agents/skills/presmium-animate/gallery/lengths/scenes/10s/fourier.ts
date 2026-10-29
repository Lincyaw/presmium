import { d3Scene } from '@lincyaw/addon-motion/scene'
import claude from '../logos/claude-color.svg?raw'
import { alpha, defId, glow, phaser, stage } from '../kit/d3-fx.ts'
import { bezierPath, error, joints, point, series } from '../kit/fourier.ts'
import type { Point } from '../kit/fx/paths.ts'
import { samplePath } from '../kit/fx/sample.ts'
import { accentGlow, glowAlpha, isDark } from '../kit/fx/theme.ts'

// Any outline drawn by circles: a Fourier series fitted round by round, with D3. `shape`: the outline to fit
// appears with the points it will be measured at, and the chart beside it (circles against error, both on log
// axes) is set up empty, the encoding first. `c1`: one large circle grows from the centre with an overshoot and
// turns once; a whisker from each measuring point to the pen is drawn as the pen passes, and the error readout is
// the RMS of the whiskers so far, so the number is visibly a measurement. `c2`…`c128`: each round doubles the
// circles; the new, smaller ones pop out at the tip of the chain, the previous trace stays as a ghost while the
// chain turns once more, and every whisker shrinks to its new length as the pen passes it, so the readout and the
// chart's new point fall during the turn and land on the round's error. The rounds get shorter (an accelerating
// build), while each one still turns exactly once. `vector`: the chain fades, the fitted curve becomes a filled
// path in the logo's colour with a light sweeping across it, its anchors and handles pop in along the outline as
// a vector editor shows a selected path, and the path data types out under it. The Bézier anchors come from the
// series itself (`bezierPath`: exact tangents, split where the curve turns), so the vector is the fit, not a
// tracing of the original. Parameters: `svg` (an SVG file as text; its first path is fitted) or `path` with
// `viewBox` and `fill`, and `terms`, the circles of each round (as many as the scene has rounds).
const ROUNDS = [1, 2, 4, 8, 16, 32, 64, 128]
const SAMPLES = 1024, MEASURE = 128, TRACE = 720

export default d3Scene(({ root, d3, at, durations, color, parameters }) => {
  const file = (parameters.svg as string | undefined) ?? claude
  const d = (parameters.path as string | undefined) ?? file.match(/\sd="([^"]+)"/)![1]!
  const [vx, vy, vw, vh] = ((parameters.viewBox as string | undefined) ?? file.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 24 24').split(/[\s,]+/).map(Number) as [number, number, number, number]
  const fillRule = file.match(/fill-rule="([^"]+)"/)?.[1] ?? 'nonzero'
  const rounds = ((parameters.terms as number[] | undefined) ?? ROUNDS).slice(0, durations.length - 2)
  const R = rounds.length, VECTOR = R + 1, KMAX = rounds.at(-1)!

  const ink = color('ink'), muted = color('muted'), accent = color('accent'), warn = color('warn'), ok = color('ok')
  const surface = color('surface'), bg = color('bg'), sheen = color('sheen'), line = color('line')
  const brand = (parameters.fill as string | undefined) ?? file.match(/fill="(#[0-9a-fA-F]{3,8})"/)?.[1] ?? accent
  const dark = isDark(bg)

  // The outline in the stage's units: a 580-unit box centred left of the middle, the chart on the right.
  const BOX = 580, CX = 460, CY = 352
  const k = BOX / Math.max(vw, vh)
  const place = (p: Point): Point => [CX + (p[0] - vx - vw / 2) * k, CY + (p[1] - vy - vh / 2) * k]
  const outline = samplePath(d, SAMPLES).map(place)
  const s = series(outline)
  const targets = d3.range(MEASURE).map(j => outline[(j * SAMPLES) / MEASURE]!)
  const tau = (j: number) => j / MEASURE
  // Per round: the curve it draws, where it puts the pen at each measuring point, and its error there.
  const traces = rounds.map(K => d3.range(TRACE + 1).map(i => point(s, K, (2 * Math.PI * i) / TRACE)))
  const marks = rounds.map(K => targets.map((_, j) => point(s, K, 2 * Math.PI * tau(j))))
  const errors = rounds.map(K => error(s, K, targets))
  const fit = bezierPath(s, KMAX, 2)

  const svg = stage(d3, root)
  const defs = svg.append('defs')
  const polyline = (points: readonly Point[]) => (points.length > 1 ? `M ${points.map(p => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L ')}` : '')

  // The outline to fit, faint, with its measuring points.
  const target = svg.append('g').attr('transform', `translate(${CX - (vx + vw / 2) * k} ${CY - (vy + vh / 2) * k}) scale(${k})`)
  target.append('path').attr('d', d).attr('fill', brand).attr('fill-opacity', dark ? 0.16 : 0.12).attr('fill-rule', fillRule)
  target.append('path').attr('d', d).attr('fill', 'none').attr('stroke', muted).attr('stroke-width', 2).attr('stroke-dasharray', '6 7').attr('vector-effect', 'non-scaling-stroke')
  const ghost = svg.append('path').attr('fill', 'none').attr('stroke', accent).attr('stroke-width', 3).attr('stroke-linejoin', 'round')
  const whiskers = svg.append('g').attr('stroke', warn).attr('stroke-width', 2.2).attr('stroke-linecap', 'round').selectAll('line').data(targets).join('line')
  const dots = svg.append('g').attr('fill', muted).selectAll('circle').data(targets).join('circle').attr('cx', p => p[0]).attr('cy', p => p[1])

  // The chain: circles (larger ones darker), the arms through the joints, the centre, the trace with a glowing tail.
  const circles = svg.append('g').attr('fill', 'none').attr('stroke', muted).selectAll('circle').data(d3.range(KMAX)).join('circle')
    .attr('stroke-width', i => (i < 3 ? 2 : 1.3)).attr('stroke-opacity', i => 0.75 - 0.5 * Math.sqrt(i / KMAX))
  const arms = svg.append('path').attr('fill', 'none').attr('stroke', ink).attr('stroke-width', 2).attr('stroke-linejoin', 'round').attr('stroke-opacity', 0.7)
  const center = svg.append('circle').attr('cx', s.center[0]).attr('cy', s.center[1]).attr('fill', ink)
  const tail = svg.append('path').attr('fill', 'none').attr('stroke', accent).attr('stroke-width', dark ? 11 : 9).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round')
    .attr('filter', glow(svg, accent, bg, 5))
  const trace = svg.append('path').attr('fill', 'none').attr('stroke', accent).attr('stroke-width', 3.5).attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round')

  // The vector: the fitted path filled in the logo's colour, a light sweep clipped to it, the selected-path outline,
  // handles and anchors.
  const vector = svg.append('g')
  const vFill = vector.append('path').attr('d', fit.d).attr('fill', brand)
  const clipId = defId('fourier-clip'), sweepId = defId('fourier-sweep'), auraId = defId('fourier-aura')
  defs.append('clipPath').attr('id', clipId).append('path').attr('d', fit.d)
  const sweep = defs.append('linearGradient').attr('id', sweepId).attr('gradientUnits', 'userSpaceOnUse').attr('y1', 0).attr('y2', 0)
    .attr('gradientTransform', `rotate(20 ${CX} ${CY})`)
  for (const [offset, a] of [[0, 0], [0.5, glowAlpha(bg, 0.6)], [1, 0]] as const) sweep.append('stop').attr('offset', offset).attr('stop-color', alpha(sheen, a))
  const vSheen = vector.append('rect').attr('x', CX - BOX).attr('y', CY - BOX).attr('width', BOX * 2).attr('height', BOX * 2).attr('fill', `url(#${sweepId})`).attr('clip-path', `url(#${clipId})`)
  const vLine = vector.append('path').attr('d', fit.d).attr('fill', 'none').attr('stroke', accent).attr('stroke-width', 2)
  const handles = vector.append('g').selectAll('g').data(fit.anchors).join('g')
  for (const end of ['in', 'out'] as const) {
    handles.append('line').attr('class', end).attr('stroke', accent).attr('stroke-width', 1.4).attr('stroke-opacity', 0.8)
    handles.append('circle').attr('class', end).attr('r', 3.2).attr('fill', accent)
  }
  const anchors = vector.append('g').selectAll('rect').data(fit.anchors).join('rect').attr('x', -4.5).attr('y', -4.5).attr('width', 9).attr('height', 9)
    .attr('fill', surface).attr('stroke', accent).attr('stroke-width', 2)

  const aura = defs.append('radialGradient').attr('id', auraId)
  aura.append('stop').attr('offset', 0).attr('stop-color', alpha(accent, accentGlow(bg, 0.3, 0.55)))
  aura.append('stop').attr('offset', 1).attr('stop-color', alpha(accent, 0))
  const pen = svg.append('g')
  pen.append('circle').attr('r', 28).attr('fill', `url(#${auraId})`)
  pen.append('circle').attr('r', 7).attr('fill', accent).attr('filter', glow(svg, accent, bg, 5))

  // The readout: the number of circles beside a small chain, the error, and the chart of one against the other.
  const P = { l: 940, r: 1200, t: 290, b: 590 }
  const mono = 'var(--pm-font-mono)'
  const count = svg.append('g').attr('transform', `translate(${P.l - 10} 160)`)
  const countText = count.append('text').attr('font-family', mono).attr('font-size', 72).attr('font-weight', 500).attr('fill', ink)
  const glyph = count.append('g').attr('fill', 'none').attr('stroke', muted).attr('stroke-width', 3)
  glyph.append('circle').attr('r', 17)
  glyph.append('path').attr('d', 'M 0 0 L 12 -12').attr('stroke-linecap', 'round')
  glyph.append('circle').attr('cx', 12).attr('cy', -12).attr('r', 7)
  const readout = svg.append('g').attr('transform', `translate(${P.l - 10} 224)`)
  readout.append('text').attr('font-size', 24).attr('fill', muted).text('误差')
  const errText = readout.append('text').attr('x', 62).attr('font-family', mono).attr('font-size', 36).attr('font-weight', 500)

  const x = d3.scaleLog().base(2).domain([rounds[0]!, KMAX]).range([P.l, P.r])
  const y = d3.scaleLog().domain([d3.min(errors)! * 0.75, d3.max(errors)! * 1.3]).range([P.b, P.t])
  const chart = svg.append('g').attr('font-family', mono).attr('font-size', 18).attr('fill', muted)
  const yTicks = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1].filter(v => v >= y.domain()[0]! && v <= y.domain()[1]!)
  for (const v of yTicks) {
    chart.append('line').attr('x1', P.l).attr('x2', P.r).attr('y1', y(v)).attr('y2', y(v)).attr('stroke', line).attr('stroke-width', 1.5)
    chart.append('text').attr('x', P.l - 14).attr('y', y(v)).attr('dy', '0.35em').attr('text-anchor', 'end').text(`${v * 100}%`)
  }
  for (const K of rounds) chart.append('text').attr('x', x(K)).attr('y', P.b + 32).attr('text-anchor', 'middle').text(K)
  chart.append('line').attr('x1', P.l).attr('x2', P.r).attr('y1', P.b + 8).attr('y2', P.b + 8).attr('stroke', muted).attr('stroke-width', 2)
  const series2 = svg.append('path').attr('fill', 'none').attr('stroke', warn).attr('stroke-width', 3).attr('stroke-linejoin', 'round')
  const points = svg.append('g').selectAll('circle').data(rounds).join('circle').attr('r', 7).attr('stroke', surface).attr('stroke-width', 3)

  const code = svg.append('text').attr('x', CX - BOX / 2).attr('y', 694).attr('font-family', mono).attr('font-size', 19).attr('fill', muted).style('white-space', 'pre')
  const codeLine = `<path d="${fit.d.slice(0, 46)}…"/>`

  const ph = phaser(at)
  const sweepEase = d3.easeSinInOut, pop = d3.easeBackOut.overshoot(1.7)
  const toOk = d3.interpolateRgb(warn, ok)
  const pct = (e: number) => `${(e * 100).toFixed(e < 0.1 ? 1 : 0)}%`
  return (ms: number) => {
    // A state owns its end: a step rests at the end of its state, so that frame shows this round's result, and the
    // next round begins just after it.
    let st = 0
    while (st < durations.length - 1 && ms > at(st + 1)) st++
    const r = Math.min(R - 1, st - 1)
    const K = r >= 0 ? rounds[r]! : 0, before = r > 0 ? rounds[r - 1]! : 0
    const grown = r === 0 ? 0.28 : 0.2
    const u = r >= 0 ? sweepEase(ph(ms, r + 1, grown, 0.86)) : 0
    // The vector takes over: the chain and the measurements fade, the path fills.
    const out = d3.easeCubicIn(ph(ms, VECTOR, 0, 0.3))

    target.attr('opacity', ph(ms, 0, 0, 0.45) * (1 - out))
    dots.attr('r', (_, j) => 2.8 * pop(ph(ms, 0, 0.25 + 0.5 * tau(j), 0.35 + 0.5 * tau(j)))).attr('opacity', 1 - out)
    center.attr('r', 5 * pop(ph(ms, 0, 0.7, 0.9))).attr('opacity', 1 - out)

    // Circle i of the new round grows during the first part of it, the new ones one after another.
    const grow = (i: number) => {
      if (i < before) return 1
      const m = K - before, start = (0.5 * grown * (i - before)) / m
      return pop(ph(ms, r + 1, start, start + 0.5 * grown))
    }
    const t = 2 * Math.PI * u
    const chain = r >= 0 ? joints(s, K, t, grow) : [s.center]
    circles.attr('display', i => (i < K && s.terms[i]!.r * grow(i) > 0.4 ? null : 'none'))
      .attr('cx', i => chain[Math.min(i, chain.length - 1)]![0]).attr('cy', i => chain[Math.min(i, chain.length - 1)]![1])
      .attr('r', i => (i < K ? s.terms[i]!.r * grow(i) * (1 - 0.35 * out) : 0)).attr('opacity', 1 - out)
    arms.attr('d', polyline(chain)).attr('opacity', 1 - out)
    const tip = chain.at(-1)!
    pen.attr('transform', `translate(${tip[0]} ${tip[1]})`).attr('opacity', r >= 0 ? ph(ms, 1, 0, 0.1) * (1 - out) : 0)

    // The trace up to the pen, its last stretch glowing while the chain turns; the previous round's trace as a ghost.
    const drawn = r >= 0 ? [...traces[r]!.slice(0, Math.floor(u * TRACE) + 1), ...(u > 0 && u < 1 ? [tip] : [])] : []
    trace.attr('d', polyline(drawn)).attr('opacity', 1 - ph(ms, VECTOR, 0.2, 0.5))
    tail.attr('d', polyline(drawn.slice(-70))).attr('opacity', Math.min(1, 14 * Math.min(u, 1 - u)) * (dark ? 0.55 : 0.35))
    // The previous trace dims to a ghost while the new circles grow, and is gone by the end of the turn.
    const dim = ph(ms, r + 1, 0, grown)
    const fade = r > 0 ? (dim < 1 ? 1 - 0.65 * d3.easeCubicOut(dim) : 0.35 * (1 - ph(ms, r + 1, grown, 0.95))) : 0
    ghost.attr('d', r > 0 ? polyline(traces[r - 1]!) : '').attr('opacity', fade)

    // Each whisker joins a measuring point to where the pen passed it; as this round's pen passes, it eases from
    // the previous round's length to this round's. The readout is the RMS of the whiskers (in the first round, of
    // those measured so far).
    let sum = 0, weight = 0
    const ends = targets.map((p, j) => {
      const b = r >= 0 ? d3.easeCubicOut(Math.max(0, Math.min(1, (u * 1.04 - tau(j)) / 0.04))) : 0
      const from = r > 0 ? marks[r - 1]![j]! : p, to = r >= 0 ? marks[r]![j]! : p
      const e: Point = [from[0] + (to[0] - from[0]) * b, from[1] + (to[1] - from[1]) * b]
      const w = r === 0 ? b : 1
      sum += w * ((e[0] - p[0]) ** 2 + (e[1] - p[1]) ** 2)
      weight += w
      return e
    })
    whiskers.attr('x1', p => p[0]).attr('y1', p => p[1]).attr('x2', (_, j) => ends[j]![0]).attr('y2', (_, j) => ends[j]![1]).attr('opacity', 1 - out)
    const measured = r >= 0 && weight > 0
    const live = measured ? Math.sqrt(sum / weight) / s.scale : 0

    // The readout and the chart: the circles' count pulses as it changes; the round's point hangs at its count and
    // falls with the readout, then turns to the good colour when the vector is done.
    const q = ph(ms, Math.max(1, r + 1), 0, 0.3)
    countText.text(K || '').attr('opacity', ph(ms, 1, 0, 0.12)).attr('transform', `scale(${r > 0 ? 1 + 0.2 * (1 - d3.easeCubicOut(q)) : 1})`)
    glyph.attr('transform', `translate(${String(K).length * 72 * 0.6 + 34} -25)`).attr('opacity', ph(ms, 1, 0, 0.12))
    const done = ph(ms, VECTOR, 0.1, 0.35)
    readout.attr('opacity', measured ? 1 : 0)
    errText.text(measured ? pct(live) : '').attr('fill', toOk(done))
    chart.attr('opacity', ph(ms, 0, 0.35, 0.85))
    const shown = rounds.map((K, i): Point | undefined => (i < r ? [x(K), y(errors[i]!)] : i === r && measured ? [x(K), y(live)] : undefined))
    series2.attr('d', polyline(shown.filter((p): p is Point => !!p))).attr('stroke', toOk(done))
    points.attr('display', (_, i) => (shown[i] ? null : 'none')).attr('cx', (_, i) => shown[i]?.[0] ?? 0).attr('cy', (_, i) => shown[i]?.[1] ?? 0)
      .attr('fill', (_, i) => (i === R - 1 ? toOk(done) : warn))
      .attr('r', (_, i) => (i === r ? 7 * pop(ph(ms, r + 1, r ? 0 : grown, (r ? 0 : grown) + 0.12)) : 7) + (i === R - 1 ? 4 * Math.sin(Math.PI * done) : 0))

    // The vector: fill and outline, a light across it, anchors and handles in order along the path, the path data.
    const filled = d3.easeCubicOut(ph(ms, VECTOR, 0.12, 0.42))
    vector.attr('display', filled > 0 ? null : 'none')
    vFill.attr('opacity', filled)
    vLine.attr('opacity', filled)
    const light = ph(ms, VECTOR, 0.4, 0.72), band = CX - BOX + 2 * BOX * d3.easeCubicInOut(light)
    sweep.attr('x1', band - 140).attr('x2', band + 140)
    vSheen.attr('opacity', light > 0 && light < 1 ? 1 : 0)
    const A = fit.anchors.length
    const appear = (i: number) => ph(ms, VECTOR, 0.25 + (0.32 * i) / A, 0.37 + (0.32 * i) / A)
    anchors.attr('transform', (a, i) => `translate(${a.p[0]} ${a.p[1]}) scale(${pop(appear(i))})`)
    for (const end of ['in', 'out'] as const) {
      const reach = (a: typeof fit.anchors[number], i: number) => {
        const f = d3.easeCubicOut(ph(ms, VECTOR, 0.3 + (0.32 * i) / A, 0.45 + (0.32 * i) / A))
        return [a.p[0] + (a[end][0] - a.p[0]) * f, a.p[1] + (a[end][1] - a.p[1]) * f]
      }
      handles.select(`line.${end}`).attr('x1', a => a.p[0]).attr('y1', a => a.p[1]).attr('x2', (a, i) => reach(a, i)[0]!).attr('y2', (a, i) => reach(a, i)[1]!)
      handles.select(`circle.${end}`).attr('cx', (a, i) => reach(a, i)[0]!).attr('cy', (a, i) => reach(a, i)[1]!).attr('opacity', (_, i) => appear(i))
    }
    code.text(codeLine.slice(0, Math.round(codeLine.length * ph(ms, VECTOR, 0.45, 0.75))))
  }
})
