import { gsapScene } from '@lincyaw/addon-motion/scene'
import { axes, path, ramp, scale, wipe } from '../../kit/chart.ts'
import type { Pt } from '../../kit/chart.ts'
import { brand, clock, frame, LAYER, TYPE } from '../../kit/frame.ts'
import { centre, FIGURE_CSS, figureHtml, view, word } from '../../kit/figure.ts'
import type { FigureMap } from '../../kit/figure.ts'
import { D, HEAT, ORANGES, PAPER } from './hsl.ts'
import fig3 from '../figures/fig3-masking.json'

// The law. Every Delphi model's accuracy against the hint level (masking): smooth curves in the order of scale. The
// curves' points then move into the plane of scale and hint level, where they land on the dots of the paper's
// Figure 3 (masking panel), which appears under them: its iso-accuracy lines run nearly parallel, and one step along
// a line trades 0.1 of hint for about 3 times the compute. Last, the joint law: its formula, its own contour lines
// (straight and parallel) over the ghost of the figure, and its H = 0 edge, the forecast of the original benchmark.
// Three states: hint slices, the plane, the joint law.

const FIG3 = new URL('../figures/fig3-masking.png', import.meta.url).href
const MAP = fig3 as unknown as FigureMap
const mask = D.delphi.methods.mask
const rungs = D.delphi.rungs
const b = mask.law
const HX = scale(0, 1, 20, 100), AY = scale(0, 1, 64, 16)

// The figure's box in the frame and its axes, read off the crop's tick labels.
const BOX = { x: 5, y: 11, w: 57 }
const boxH = BOX.w / MAP.aspect * 16 / 9
const fx = (u: number) => (BOX.x + u * BOX.w) * 1.6
const fy = (v: number) => (BOX.y + v * boxH) * 0.9
const tx0 = centre(word(MAP, '3e18')).x, tx1 = centre(word(MAP, '1e23')).x
const ty0 = centre(word(MAP, '0.0')).y, ty1 = centre(word(MAP, '1.0')).y
const PC = scale(Math.log10(3e18), 23, fx(tx0), fx(tx1))
const PH = scale(0, 1, fy(ty0), fy(ty1))

// One step along an iso-accuracy line of the joint law: H down by 0.1 is made up by log10 compute up by b2 / b1 × 0.1
// (about 0.47 of a decade, ×3). Drawn in the figure's own coordinates (u, v in 0..1000 × 0..1000 / aspect), so the
// camera's zoom carries it.
const DH = 0.1, DC = b[1]! / b[0]! * DH
const A = { c: 21.15, h: 0.42 }
const VW = 1000, VH = 1000 / MAP.aspect
const FU = scale(Math.log10(3e18), 23, tx0 * VW, tx1 * VW), FV = scale(0, 1, ty0 * VH, ty1 * VH)
const SLOPE = b[0]! / b[1]!
const ZOOM = { x: (FU(A.c) - 280) / VW, y: (FV(A.h) - 215) / VH, w: 600 / VW, h: 460 / VH }
const TRI = `<svg class="tri" viewBox="0 0 ${VW} ${VH}" style="left:0;top:0;width:100%;height:100%;overflow:visible">
  <path class="tri-line" d="M${FU(A.c - 0.9)},${FV(A.h + 0.9 * SLOPE)} L${FU(A.c + 1.4)},${FV(A.h - 1.4 * SLOPE)}" fill="none" stroke="var(--c-ours)" stroke-width="3" stroke-dasharray="9 6"/>
  <path class="tri-h" d="M${FU(A.c)},${FV(A.h)} L${FU(A.c + DC)},${FV(A.h)}" fill="none" stroke="#16191d" stroke-width="4"/>
  <path class="tri-v" d="M${FU(A.c + DC)},${FV(A.h)} L${FU(A.c + DC)},${FV(A.h - DH)}" fill="none" stroke="#16191d" stroke-width="4"/>
  <circle cx="${FU(A.c)}" cy="${FV(A.h)}" r="7" fill="var(--c-ours)" stroke="#fff" stroke-width="2"/>
  <circle class="tri-end" cx="${FU(A.c + DC)}" cy="${FV(A.h - DH)}" r="7" fill="var(--c-ours)" stroke="#fff" stroke-width="2"/>
  <g class="tri-tx" font-weight="800" fill="#16191d" stroke="#fff" stroke-width="7" paint-order="stroke" style="font-family: var(--pm-font-sans)">
    <text x="${(FU(A.c) + FU(A.c + DC)) / 2}" y="${FV(A.h) - 16}" font-size="30" text-anchor="middle">×3 算力</text>
    <text x="${FU(A.c + DC) + 14}" y="${(FV(A.h) + FV(A.h - DH)) / 2 + 10}" font-size="30">提示量 +0.1</text>
  </g></svg>`
const contour = (a: number): Pt[] => {
  const z = Math.log((a - b[4]!) / (b[3]! - a))
  const h = (c: number) => (z - b[2]! - b[0]! * (c - 20)) / b[1]!
  const pts: Pt[] = []
  for (let c = Math.log10(3e18); c <= 23.0001; c += 0.05) { const v = h(c); if (v >= 0 && v <= 1) pts.push([PC(c), PH(v)]) }
  return pts
}

export default gsapScene(({ root, gsap, at, durations }) => {
  const { T } = clock(at, durations)
  const shade = (i: number) => ramp(ORANGES, 0.08 + 0.92 * i / (rungs.length - 1))
  const series = rungs.map((_, i) => mask.hints.map((h, j) => ({ h, v: mask.acc[j]![i] ?? 0 })))
  const focus = rungs.findIndex(r => Math.abs(r.c - 21) < 1e-6)

  frame(root, `${FIGURE_CSS}
    .side { position: absolute; left: 66cqw; width: 31cqw; }
    .side b { display: block; font-size: ${TYPE.lead}cqw; line-height: 1.2; }
    .side span { display: block; margin-top: 0.6cqh; font-size: ${TYPE.small}cqw; color: var(--pm-color-muted); line-height: 1.45; }
    .leg { top: 16cqh; }
    .leg i { display: block; margin-top: 1.2cqh; width: 14cqw; height: 1cqh; border-radius: 99cqw; background: linear-gradient(90deg, ${ORANGES.join(',')}); }
    .leg em { display: flex; justify-content: space-between; width: 14cqw; font-style: normal; font-size: ${TYPE.tiny}cqw; color: var(--pm-color-muted); }
    .par { top: 16cqh; } .xchg { top: 38cqh; }
    .xchg b { color: var(--c-ours); }
    .src3 { left: ${BOX.x}cqw; top: ${BOX.y + boxH + 0.8}cqh; }
    .fml { position: absolute; left: 64cqw; top: 13cqh; width: 34.5cqw; padding: 1.4cqw 1.5cqw; }
    .fml__k { font-size: ${TYPE.small}cqw; font-weight: 700; color: var(--pm-color-muted); }
    .fml__f { margin-top: 1cqh; font-family: 'STIX Two Math', 'Cambria Math', var(--pm-font-serif, serif); font-size: 2.05cqw; line-height: 1.55; white-space: nowrap; }
    .fml__f .c { color: var(--pm-color-ink); font-weight: 700; } .fml__f .h { color: #1f9e89; font-weight: 700; }
    .fml__f u { text-decoration: none; border-bottom: 0.25cqw solid var(--c-accent); }
    .fml__n { margin-top: 1.2cqh; font-size: ${TYPE.small}cqw; color: var(--pm-color-muted); line-height: 1.5; }
    .fml__n b { color: var(--pm-color-ink); }
    .edge-lab { position: absolute; font-size: ${TYPE.label}cqw; font-weight: 700; color: var(--c-ours); white-space: nowrap; }
  `, `
    ${brand(PAPER.short)}
    ${figureHtml('f3', FIG3, MAP, BOX, TRI)}
    <div class="pfig-src src3">论文图 3（遮盖 · GSM8K · Delphi）</div>
    <svg class="layer" ${LAYER}>
      <g class="slices">${axes({ x: HX, y: AY, xTicks: [0, 0.2, 0.4, 0.6, 0.8, 1].map(v => ({ v, label: String(v) })), yTicks: [0, 0.25, 0.5, 0.75, 1].map(v => ({ v, label: `${v * 100}%` })), xTitle: '提示量 H', yTitle: 'GSM8K 准确率', grid: true })}</g>
      ${series.map((pts, i) => `<path class="curve curve${i}" d="${path(pts.map(p => [HX(p.h), AY(p.v)]))}" fill="none" stroke="${shade(i)}" stroke-width="${i === focus ? 0.7 : 0.45}"/>`).join('')}
      ${series.map((pts, i) => pts.map((p, j) => `<circle class="pt pt${i} pt${i}-${j}" cx="${HX(p.h)}" cy="${AY(p.v)}" r="0.7" fill="${shade(i)}"/>`).join('')).join('')}
      <g class="lawlines">${[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map(a => `<path class="ll" d="${path(contour(a))}" fill="none" stroke="var(--c-accent)" stroke-width="0.4"/>`).join('')}</g>
      <path class="edge" d="M${PC(Math.log10(3e18))},${PH(0)} L${PC(23)},${PH(0)}" fill="none" stroke="var(--c-ours)" stroke-width="1"/>
    </svg>
    <div class="edge-lab" style="left:${PC(18.7) / 1.6}cqw;top:${PH(0) / 0.9 + 0.6}cqh">H = 0：对原题的预测</div>
    <div class="side leg"><b>遮盖 · GSM8K</b><span>Delphi 12 个模型</span><i></i><em><span>算力小</span><span>算力大</span></em></div>
    <div class="side par"><b>等准确率线几乎平行</b></div>
    <div class="side xchg"><b>提示量 +0.1 ≈ 算力 ×3</b><span>估算</span></div>
    <div class="card fml">
      <div class="fml__k">联合定律</div>
      <div class="fml__f">Acc(<span class="c">C</span>, <span class="h">H</span>) = max( F,<br>&nbsp;&nbsp;L + (A − L)·σ(<u>β₁<span class="c">C</span> + β₂<span class="h">H</span></u> + β₃) )</div>
      <div class="fml__n"><b>C</b> 算力（对数）　<b style="color:#1f9e89">H</b> 提示量<br><b>F</b> 噪声水平　<b>L</b>、<b>A</b> 下限、上限<br><b>6 个参数</b></div>
    </div>
  `)

  const tl = gsap.timeline()
  gsap.set(['.slices', '.curve', '.pt', '.f3', '.src3', '.lawlines', '.edge', '.tri', '.edge-lab', '.side', '.fml'], { autoAlpha: 0 })
  gsap.set(['.curve', '.ll', '.edge', '.tri-h', '.tri-v'], { drawSVG: '0%' })

  // State 0: the hint slices, the 10²¹ model's first (it is the one the sheet just traced), then the others by scale.
  tl.to('.slices', { autoAlpha: 1, duration: 0.4 }, T(0, 0.02))
  tl.to([`.curve${focus}`, `.pt${focus}`], { autoAlpha: 1, duration: 0.01 }, T(0, 0.06))
  tl.to(`.curve${focus}`, { drawSVG: '100%', duration: 0.7, ease: 'power2.inOut' }, T(0, 0.06))
  rungs.forEach((_, i) => {
    if (i === focus) return
    const t = T(0, 0.22) + i * 0.16
    tl.to([`.curve${i}`, `.pt${i}`], { autoAlpha: 1, duration: 0.01 }, t)
    tl.to(`.curve${i}`, { drawSVG: '100%', duration: 0.6, ease: 'power2.inOut' }, t)
  })
  tl.to('.leg', { autoAlpha: 1, duration: 0.4 }, T(0, 0.3))

  // State 1: each point moves to its model's scale and its hint level and takes the colour of its accuracy; the
  // paper's figure appears under the points, which then give way to it; the exchange is drawn on one line.
  tl.to(['.slices', '.curve', '.leg'], { autoAlpha: 0, duration: 0.35 }, T(1))
  series.forEach((pts, i) => pts.forEach((p, j) => {
    tl.to(`.pt${i}-${j}`, { attr: { cx: PC(rungs[i]!.c), cy: PH(p.h) }, fill: ramp(HEAT, p.v), duration: 0.8, ease: 'power3.inOut' }, T(1, 0.04) + i * 0.025)
  }))
  tl.to(['.f3', '.src3'], { autoAlpha: 1, duration: 0.5 }, T(1, 0.3))
  tl.to('.pt', { autoAlpha: 0, duration: 0.5 }, T(1, 0.38))
  tl.to('.par', { autoAlpha: 1, duration: 0.4 }, T(1, 0.3))
  // The camera closes in on one line as the narration reaches the exchange; the step along it is drawn there.
  tl.to('.f3 .pfig__cam', { ...view(ZOOM, 0), duration: 0.9, ease: 'power3.inOut' }, T(1, 0.56))
  tl.to('.tri', { autoAlpha: 1, duration: 0.01 }, T(1, 0.6))
  wipe(tl, root.querySelector('.tri-line')!, T(1, 0.62), 0.6)
  tl.to('.tri-h', { drawSVG: '100%', duration: 0.45, ease: 'power2.inOut' }, T(1, 0.72))
  tl.to('.tri-v', { drawSVG: '100%', duration: 0.35, ease: 'power2.inOut' }, T(1, 0.8))
  tl.fromTo(['.tri-tx', '.tri-end'], { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3, immediateRender: false }, T(1, 0.84))
  // Back to the whole figure, with its axes, for the rest frame; the step stays drawn in it.
  tl.to('.f3 .pfig__cam', { ...view({ x: 0, y: 0, w: 1, h: 1 }, 0), duration: 0.7, ease: 'power3.inOut' }, T(1, 0.9))
  tl.to('.xchg', { autoAlpha: 1, duration: 0.4 }, T(1, 0.8))

  // State 2: the joint law. Its formula; its own contours, straight and parallel, over the figure's ghost; and the
  // H = 0 edge in red, the slice that forecasts the original benchmark.
  tl.to(['.par', '.xchg', '.tri'], { autoAlpha: 0, duration: 0.3 }, T(2))
  tl.to('.f3', { autoAlpha: 0.28, duration: 0.5 }, T(2, 0.12))
  tl.fromTo('.fml', { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'expo.out', immediateRender: false }, T(2, 0.04))
  tl.to('.lawlines', { autoAlpha: 1, duration: 0.01 }, T(2, 0.3))
  tl.to('.ll', { drawSVG: '100%', duration: 0.7, ease: 'power2.inOut', stagger: 0.06 }, T(2, 0.3))
  tl.to('.edge', { autoAlpha: 1, duration: 0.01 }, T(2, 0.68))
  tl.to('.edge', { drawSVG: '100%', duration: 0.7, ease: 'power2.inOut' }, T(2, 0.68))
  tl.to('.edge-lab', { autoAlpha: 1, duration: 0.4 }, T(2, 0.76))
  tl.set({}, {}, T(3))
  return tl
})
