import { gsapScene } from '@lincyaw/addon-motion/scene'
import { axes, path, ramp, scale } from '../../../kit/chart.ts'
import { brand, clock, escape, frame, LAYER, TYPE } from '../../../kit/frame.ts'
import { BRAND, MARK } from '../../../kit/brand.ts'
import { D, METHOD, ORANGES, PAPER } from './hsl.ts'

// The condition and the takeaway. Two panels on the same axes for the six Delphi models up to 9×10¹⁹ FLOPs: under
// masking their curves spread apart (the hint brings out how capable each is); under the control that just gives
// the answer with probability H, acc = H + (1 − H)·acc₀, their lines fall on top of each other, and the forecast is
// still 20 points off. Then the takeaway and the paper's card, held.
// Two states: the control, the takeaway.

const mask = D.delphi.methods.mask
const rungs = D.delphi.rungs
const small = rungs.map((r, i) => ({ r, i })).filter(({ r }) => r.c <= 19.96)
const ctrl = D.answer_mix.rows.find(row => row.t === 7)!
const AX = scale(0, 1, 16, 66), BX = scale(0, 1, 88, 138), Y = scale(0, 1, 60, 22)

export default gsapScene(({ root, gsap, at, durations }) => {
  const { T } = clock(at, durations)
  const shade = (i: number) => ramp(ORANGES, 0.08 + 0.92 * i / (rungs.length - 1))
  const ticks = { xTicks: [0, 0.5, 1].map(v => ({ v, label: String(v) })), yTicks: [0, 0.5, 1].map(v => ({ v, label: `${v * 100}%` })), grid: true, xTitle: '提示量 H' }
  const maskPath = (i: number) => path(mask.hints.map((h, j) => [AX(h), Y(mask.acc[j]![i] ?? 0)] as const))
  const givePath = (i: number) => { const a0 = rungs[i]!.acc; return path([0, 1].map(h => [BX(h), Y(h + (1 - h) * a0)] as const)) }

  frame(root, `
    .pt { position: absolute; top: 9.5cqh; font-size: ${TYPE.lead}cqw; font-weight: 800; white-space: nowrap; }
    .pt span { display: block; font-size: ${TYPE.small}cqw; font-weight: 500; color: var(--pm-color-muted); margin-top: 0.3cqh; }
    .pa { left: ${AX(0) / 1.6}cqw; } .pb { left: ${BX(0) / 1.6}cqw; }
    .ca { position: absolute; left: ${AX(0.04) / 1.6}cqw; top: 27cqh; font-size: ${TYPE.label}cqw; font-weight: 700; color: ${METHOD.mask}; white-space: nowrap; }
    .cb { position: absolute; left: ${BX(0.4) / 1.6}cqw; top: ${Y(0.34) / 0.9}cqh; white-space: nowrap; font-size: ${TYPE.label}cqw; }
    .cb b { display: block; font-size: ${TYPE.title}cqw; font-weight: 800; line-height: 1.1; }
    .take { position: absolute; left: 8cqw; top: 14cqh; width: 84cqw; }
    .take__1 { font-size: 4.6cqw; font-weight: 800; line-height: 1.2; white-space: nowrap; }
    .take__1 em { font-style: normal; color: var(--c-accent); }
    .take__2 { margin-top: 1.6cqh; font-size: ${TYPE.lead}cqw; color: var(--pm-color-muted); white-space: nowrap; }
    .take__3 { display: inline-block; margin-top: 2.4cqh; margin-right: 1cqw; font-size: ${TYPE.body}cqw; font-weight: 650; padding: 0.4cqw 1.4cqw; border-radius: 99cqw;
      color: var(--pm-color-warn); background: var(--pm-color-warn-soft); white-space: nowrap; }
    .paper { position: absolute; left: 8cqw; top: 47cqh; width: 84cqw; padding: 1.6cqw 2cqw; display: flex; gap: 2cqw; align-items: center; }
    .paper__m { flex: none; width: 9cqw; height: 9cqw; border-radius: 1.6cqw; overflow: hidden; background: #f7f5f0; box-shadow: 0 0 0 0.12cqw var(--c-line-strong); }
    .paper__m svg { width: 100%; height: 100%; display: block; }
    .paper__b { min-width: 0; }
    .paper__t { font-size: ${TYPE.title}cqw; font-weight: 800; line-height: 1.12; white-space: nowrap; }
    .paper__t span { font-size: ${TYPE.lead}cqw; font-weight: 650; color: var(--pm-color-muted); margin-left: 1cqw; }
    .paper__a { margin-top: 0.8cqh; font-size: ${TYPE.small}cqw; color: var(--pm-color-muted); white-space: nowrap; }
    .paper__s { margin-top: 1cqh; font-size: ${TYPE.small}cqw; font-weight: 700; color: var(--c-accent); white-space: nowrap; }
  `, `
    ${brand(PAPER.short)}
    <div class="pt pa" style="color:${METHOD.mask}">遮盖<span>6 个小模型</span></div>
    <div class="pt pb">直接给最终答案（对照）<span>按概率 H 给出</span></div>
    <svg class="layer" ${LAYER}>
      <g class="panel-a">${axes({ x: AX, y: Y, ...ticks })}</g>
      <g class="panel-b">${axes({ x: BX, y: Y, ...ticks })}</g>
      ${small.map(({ i }, k) => `<path class="ma ma${k}" d="${maskPath(i)}" fill="none" stroke="${shade(i)}" stroke-width="0.55"/>`).join('')}
      ${small.map(({ i }, k) => `<path class="gb gb${k}" d="${givePath(i)}" fill="none" stroke="${shade(i)}" stroke-width="0.55"/>`).join('')}
    </svg>
    <div class="ca">曲线分离 · 能力差异可见</div>
    <div class="cb"><span>曲线重合 · 误差</span><b>${(ctrl.err * 100).toFixed(1)} 个百分点</b></div>
    <div class="take">
      <div class="take__1">提示量：另一项<em>能力指标</em></div>
      <div class="take__2">小模型接近零 → 大模型准确率</div>
      <div class="take__3">前提：可靠的参考解答</div> <div class="take__3 take__4">logit 混合：教师须共用分词器</div>
    </div>
    <div class="card paper">
      <div class="paper__m">${MARK}</div>
      <div class="paper__b">
        <div class="paper__t">${escape(PAPER.title)}<span>${PAPER.zh}</span></div>
        <div class="paper__a">斯坦福大学 · ${escape(PAPER.authors.replace(/ · Stanford$/, ''))} · ${PAPER.arxiv}</div>
        <div class="paper__a">代码与数据：${PAPER.code}</div>
        <div class="paper__s">${BRAND.name} · ${BRAND.series}</div>
      </div>
    </div>
  `)

  const tl = gsap.timeline()
  gsap.set(['.pt', '.panel-a', '.panel-b', '.ma', '.gb', '.ca', '.cb', '.take__1', '.take__2', '.take__3', '.take__4', '.paper'], { autoAlpha: 0 })
  gsap.set(['.ma', '.gb'], { drawSVG: '0%' })

  // State 0. 提示应反映模型能力差异: masking, the curves spread. 若以概率 H 直接给出答案……完全重合: the
  // control's lines are drawn one by one onto the same diagonal. 误差仍有 20 个百分点: the readout.
  tl.to(['.pa', '.panel-a'], { autoAlpha: 1, duration: 0.4 }, T(0, 0.03))
  tl.to('.ma', { autoAlpha: 1, duration: 0.01 }, T(0, 0.08))
  tl.to('.ma', { drawSVG: '100%', duration: 0.8, ease: 'power2.inOut', stagger: 0.14 }, T(0, 0.08))
  tl.to('.ca', { autoAlpha: 1, duration: 0.4 }, T(0, 0.26))
  tl.to(['.pb', '.panel-b'], { autoAlpha: 1, duration: 0.4 }, T(0, 0.34))
  tl.to('.gb', { autoAlpha: 1, duration: 0.01 }, T(0, 0.42))
  tl.to('.gb', { drawSVG: '100%', duration: 0.6, ease: 'power2.inOut', stagger: 0.22 }, T(0, 0.42))
  tl.fromTo('.cb', { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: 'expo.out', immediateRender: false }, T(0, 0.74))

  // State 1. The takeaway, line by line as it is said, then the paper's card.
  tl.to(['.pt', '.panel-a', '.panel-b', '.ma', '.gb', '.ca', '.cb'], { autoAlpha: 0, duration: 0.35 }, T(1))
  tl.fromTo('.take__1', { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.55, ease: 'expo.out', immediateRender: false }, T(1, 0.04))
  tl.fromTo('.take__2', { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: 'expo.out', immediateRender: false }, T(1, 0.32))
  tl.fromTo('.take__3:not(.take__4)', { autoAlpha: 0, scale: 0.9, transformOrigin: '0 50%' }, { autoAlpha: 1, scale: 1, duration: 0.45, ease: 'back.out(1.8)', immediateRender: false }, T(1, 0.5))
  tl.fromTo('.take__4', { autoAlpha: 0, scale: 0.9, transformOrigin: '0 50%' }, { autoAlpha: 1, scale: 1, duration: 0.45, ease: 'back.out(1.8)', immediateRender: false }, T(1, 0.72))
  tl.fromTo('.paper', { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: 0.6, ease: 'expo.out', immediateRender: false }, T(1, 0.8))
  tl.set({}, {}, T(2))
  return tl
})
