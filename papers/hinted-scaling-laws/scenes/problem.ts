import { gsapScene } from '@lincyaw/addon-motion/scene'
import { axes, decades, path, place, sample, scale, sigmoid, wipe } from '../../kit/chart.ts'
import { brand, clock, frame, isDark, LAYER, sup, TYPE } from '../../kit/frame.ts'
import { D, flops, hintColor, PAPER } from './hsl.ts'

// The problem. One axis of training compute and the Delphi ladder on it: small models, and the target at 10²³ FLOPs.
// The same dots then show pretraining loss (a smooth trend), then GSM8K accuracy (a row at the noise floor that any
// curve fits), then, under hints, columns of accuracies well above zero: the paper's idea, previewed on the same dots.
// Four states: the ladder, loss, accuracy, hints.

const rungs = D.delphi.rungs.filter(r => r.c <= 21 + 1e-6)
const bpb = new Map(D.delphi.bpb.map(p => [p.c.toFixed(3), p.bpb]))
const mask = D.delphi.methods.mask
const X = scale(18.25, 23.35, 16, 98)
const ROW = 42
const yLoss = scale(0.3, 1.3, 64, 16)
const yAcc = scale(0, 0.4, 64, 16)
const yAll = scale(0, 1, 64, 16)
const TARGET = 23

// The trend of loss over the rungs it was measured on: log(bpb) linear in log(compute), drawn only over that range.
const known = rungs.flatMap(r => { const v = bpb.get(r.c.toFixed(3)); return v ? [[r.c, Math.log(v)] as const] : [] })
const mx = known.reduce((s, p) => s + p[0], 0) / known.length, my = known.reduce((s, p) => s + p[1], 0) / known.length
const slope = known.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0) / known.reduce((s, p) => s + (p[0] - mx) ** 2, 0)
const trend = (c: number) => Math.exp(my + slope * (c - mx))

// Illustrative curves that all agree with the floor: each is under 2.5% at every measured rung.
const FAN = [22.1, 22.55, 23.0, 23.45, 23.9].map(c0 => (c: number) => sigmoid(4 * (c - c0)))

export default gsapScene(({ root, gsap, at, durations, color }) => {
  const { T } = clock(at, durations)
  const dark = isDark(color)
  const ticks = decades(18.25, 23.35, sup)
  const cols = rungs.map((r, i) => mask.hints.slice(1).map((h, j) => ({ h, v: mask.acc[j + 1]![i] ?? 0 })))

  frame(root, `
    .lab { position: absolute; white-space: nowrap; font-size: ${TYPE.label}cqw; }
    .panel { position: absolute; left: 64cqw; top: 15cqh; width: 32cqw; }
    .row { display: flex; align-items: baseline; gap: 1cqw; margin-bottom: 3.2cqh; font-size: ${TYPE.body}cqw; white-space: nowrap; }
    .row b { font-size: ${TYPE.lead}cqw; }
    .row .tag { font-size: ${TYPE.small}cqw; font-weight: 650; padding: 0.2cqw 0.8cqw; border-radius: 99cqw; }
    .tag--ok { color: var(--pm-color-ok); background: var(--pm-color-ok-soft); }
    .tag--no { color: var(--c-ours); background: var(--c-ours-soft); }
    .paper { position: absolute; left: 66cqw; top: 58cqh; width: 31cqw; padding: 1.4cqw 1.6cqw; }
    .paper__t { font-size: ${TYPE.lead}cqw; font-weight: 800; line-height: 1.15; }
    .paper__z { font-size: ${TYPE.body}cqw; font-weight: 650; color: var(--c-accent); margin-top: 0.5cqh; }
    .paper__a { font-size: ${TYPE.small}cqw; color: var(--pm-color-muted); margin-top: 1cqh; line-height: 1.4; }
    .hbar { position: absolute; left: 34cqw; top: 13.2cqh; display: flex; align-items: center; gap: 0.8cqw; font-size: ${TYPE.small}cqw; white-space: nowrap; }
    .hbar i { display: block; width: 12cqw; height: 1cqh; border-radius: 99cqw;
      background: linear-gradient(90deg, ${[0, 0.25, 0.5, 0.75, 1].map(t => hintColor(t, dark)).join(',')}); }
  `, `
    ${brand(PAPER.short)}
    <svg class="layer" ${LAYER}>
      ${axes({ x: X, y: yLoss, xTicks: ticks, xTitle: '训练算力（FLOPs，对数刻度）', cls: 'ax-x' })}
      ${axes({ x: X, y: yLoss, yTicks: [0.4, 0.6, 0.8, 1.0, 1.2].map(v => ({ v, label: v.toFixed(1) })), yTitle: '预训练损失（bits/byte）', cls: 'ax-loss' })}
      ${axes({ x: X, y: yAcc, yTicks: [0, 0.1, 0.2, 0.3, 0.4].map(v => ({ v, label: `${v * 100}%` })), yTitle: 'GSM8K 准确率', grid: true, cls: 'ax-acc' })}
      ${axes({ x: X, y: yAll, yTicks: [0, 0.25, 0.5, 0.75, 1].map(v => ({ v, label: `${v * 100}%` })), yTitle: 'GSM8K 准确率', grid: true, cls: 'ax-all' })}
      <rect class="floor" x="${X.r0}" y="${yAcc(0.025)}" width="${X.r1 - X.r0}" height="${yAcc(0) - yAcc(0.025)}" fill="var(--c-ours-soft)"/>
      <text class="floor-lab" x="${X(18.4)}" y="${yAcc(0.025) - 1}" font-size="2.4" fill="var(--c-ours)">噪声底：2.5% 以下，分不出高低</text>
      <path class="trend" d="${path(place(sample(trend, rungs[0]!.c, 21), X, yLoss))}" fill="none" stroke="var(--c-fit)" stroke-width="0.45"/>
      ${FAN.map((f, i) => `<path class="fan fan${i}" d="${path(place(sample(f, 18.3, 23.3, 120), X, yAcc))}" fill="none" stroke="var(--c-muted)" stroke-width="0.35" stroke-dasharray="1.2 0.8"/>`).join('')}
      <g class="target">
        <line x1="${X(TARGET)}" y1="16" x2="${X(TARGET)}" y2="64" stroke="var(--c-line-strong)" stroke-width="0.3" stroke-dasharray="0.8 0.8"/>
        <circle cx="${X(TARGET)}" cy="${ROW}" r="4.2" fill="var(--c-surface)" stroke="var(--c-ink)" stroke-width="0.4" stroke-dasharray="1 0.7"/>
        <text x="${X(TARGET)}" y="${ROW + 1.9}" font-size="5.4" font-weight="800" text-anchor="middle">?</text>
      </g>
      <g class="qrange"><line x1="${X(TARGET)}" y1="${yAcc(0.4)}" x2="${X(TARGET)}" y2="${yAcc(0.02)}" stroke="var(--c-ours)" stroke-width="0.5"/>
        <text x="${X(TARGET) + 1.4}" y="${yAcc(0.2)}" font-size="4.4" font-weight="800" fill="var(--c-ours)">?</text></g>
      ${cols.map((col, i) => col.map(p => `<circle class="hc hc${i}" cx="${X(rungs[i]!.c)}" cy="${yAll(p.v)}" r="0.75" fill="${hintColor(p.h, dark)}"/>`).join('')).join('')}
      ${rungs.map((r, i) => `<circle class="dot dot${i}" cx="${X(r.c)}" cy="${ROW}" r="1.15" fill="var(--c-fit)"/>`).join('')}
      <text class="extra" x="${X(20.6)}" y="${ROW - 4}" font-size="2.6" text-anchor="middle" fill="var(--c-muted)">外推</text>
      <path class="extra arrow" d="M${X(21.25)},${ROW} L${X(TARGET) - 5.2},${ROW}" fill="none" stroke="var(--c-muted)" stroke-width="0.35"/>
      <path class="extra" d="M${X(TARGET) - 6.6},${ROW - 1.2} L${X(TARGET) - 5},${ROW} L${X(TARGET) - 6.6},${ROW + 1.2}" fill="none" stroke="var(--c-muted)" stroke-width="0.35"/>
    </svg>
    <div class="lab lab-ladder" style="left:${X(18.4) / 1.6}cqw;top:${ROW / 0.9 + 5}cqh">Delphi 预训练模型：${flops(rungs[0]!.c)} 至 ${flops(21)} FLOPs</div>
    <div class="lab lab-target" style="left:${X(TARGET) / 1.6 - 6}cqw;top:${ROW / 0.9 - 13}cqh"><b>目标</b> ${flops(TARGET)} FLOPs</div>
    <div class="lab lab-trend" style="left:${X(19.6) / 1.6}cqw;top:${yLoss(trend(19.6)) / 0.9 - 9}cqh">平滑下降<span class="note">　公开了损失的 8 个模型</span></div>
    <div class="lab lab-fan" style="left:${X(18.5) / 1.6}cqw;top:24cqh"><span class="muted">示意：</span>这些曲线都与零分相容</div>
    <div class="hbar"><span>提示</span><span class="muted">少</span><i></i><span class="muted">多</span></div>
    <div class="panel">
      <div class="row r0"><b>缩放定律</b><span class="muted">小模型的趋势 → 大模型</span></div>
      <div class="row r1"><span>预训练损失</span><span class="tag tag--ok">有趋势</span></div>
      <div class="row r2"><span>下游准确率</span><span class="tag tag--no">一排零分</span></div>
    </div>
    <div class="card paper">
      <div class="paper__t">提示</div>
      <div class="paper__z">给小模型看一部分参考解答</div>
      <div class="paper__a">零分变成一条能拟合的曲线</div>
    </div>
  `)

  const tl = gsap.timeline()
  gsap.set(['.ax-x', '.ax-loss', '.ax-acc', '.ax-all', '.floor', '.floor-lab', '.trend', '.fan', '.target', '.qrange', '.hc', '.dot', '.extra',
    '.lab', '.hbar', '.row', '.paper'], { autoAlpha: 0 })
  gsap.set('.trend', { drawSVG: '0%' })

  // State 0: the compute axis, the target, the ladder of small models left to right, then the extrapolation.
  tl.to('.ax-x', { autoAlpha: 1, duration: 0.4 }, T(0, 0.02))
  tl.fromTo('.target', { autoAlpha: 0, scale: 0.6, transformOrigin: '50% 50%' }, { autoAlpha: 1, scale: 1, duration: 0.5, ease: 'back.out(1.6)', immediateRender: false }, T(0, 0.12))
  tl.to('.lab-target', { autoAlpha: 1, duration: 0.35 }, T(0, 0.2))
  tl.fromTo('.dot', { autoAlpha: 0, scale: 0.3, transformOrigin: '50% 50%' }, { autoAlpha: 1, scale: 1, duration: 0.35, ease: 'expo.out', stagger: 0.09, immediateRender: false }, T(0, 0.42))
  tl.to('.lab-ladder', { autoAlpha: 1, duration: 0.35 }, T(0, 0.55))
  tl.to('.extra', { autoAlpha: 1, duration: 0.3 }, T(0, 0.7))
  tl.fromTo('.arrow', { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.6, ease: 'power2.inOut', immediateRender: false }, T(0, 0.7))
  tl.to('.r0', { autoAlpha: 1, duration: 0.4 }, T(0, 0.78))

  // State 1: the same dots rise to their pretraining loss; the trend draws through them.
  tl.to(['.extra', '.lab-ladder'], { autoAlpha: 0, duration: 0.25 }, T(1))
  tl.to('.ax-loss', { autoAlpha: 1, duration: 0.4 }, T(1, 0.02))
  tl.to('.target', { autoAlpha: 0, duration: 0.25 }, T(1, 0.02))
  tl.to('.lab-target', { autoAlpha: 0, duration: 0.25 }, T(1, 0.02))
  rungs.forEach((r, i) => {
    const v = bpb.get(r.c.toFixed(3))
    if (v) tl.to(`.dot${i}`, { attr: { cy: yLoss(v) }, duration: 0.7, ease: 'power3.inOut' }, T(1, 0.06) + i * 0.05)
    else tl.to(`.dot${i}`, { autoAlpha: 0, duration: 0.3 }, T(1, 0.06))
  })
  tl.to('.trend', { autoAlpha: 1, duration: 0.01 }, T(1, 0.3))
  tl.to('.trend', { drawSVG: '100%', duration: 0.8, ease: 'power2.inOut' }, T(1, 0.3))
  tl.to('.lab-trend', { autoAlpha: 1, duration: 0.35 }, T(1, 0.42))
  tl.to('.r1', { autoAlpha: 1, duration: 0.4 }, T(1, 0.45))

  // State 2: the dots fall to their accuracy, all on the noise floor; curves that all fit them fan out at the target.
  tl.to(['.ax-loss', '.trend', '.lab-trend'], { autoAlpha: 0, duration: 0.3 }, T(2))
  tl.to('.ax-acc', { autoAlpha: 1, duration: 0.4 }, T(2, 0.02))
  rungs.forEach((r, i) => tl.to(`.dot${i}`, { autoAlpha: 1, attr: { cy: yAcc(r.acc) }, duration: 0.7, ease: 'power3.inOut' }, T(2, 0.04) + i * 0.04))
  tl.to(['.floor', '.floor-lab'], { autoAlpha: 1, duration: 0.4 }, T(2, 0.22))
  tl.to('.fan', { autoAlpha: 1, duration: 0.01 }, T(2, 0.48))
  root.querySelectorAll('.fan').forEach((el, i) => wipe(tl, el, T(2, 0.48) + i * 0.12, 0.9))
  tl.fromTo('.qrange', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.4, immediateRender: false }, T(2, 0.66))
  tl.to('.lab-fan', { autoAlpha: 1, duration: 0.35 }, T(2, 0.7))
  tl.to('.r2', { autoAlpha: 1, duration: 0.4 }, T(2, 0.3))

  // State 3: hints. The axis widens to 100%, and above each zero a column of hinted accuracies rises, coloured by H.
  tl.to(['.fan', '.qrange', '.lab-fan', '.floor', '.floor-lab', '.ax-acc'], { autoAlpha: 0, duration: 0.3 }, T(3))
  tl.to('.ax-all', { autoAlpha: 1, duration: 0.4 }, T(3, 0.02))
  rungs.forEach((r, i) => tl.to(`.dot${i}`, { attr: { cy: yAll(r.acc) }, duration: 0.6, ease: 'power3.inOut' }, T(3, 0.02)))
  cols.forEach((col, i) => tl.fromTo(`.hc${i}`, { autoAlpha: 0, attr: { cy: yAll(rungs[i]!.acc) } },
    { autoAlpha: 1, attr: { cy: (j: number) => yAll(col[j]!.v) }, duration: 0.8, ease: 'power3.out', stagger: 0.03, immediateRender: false }, T(3, 0.2) + i * 0.06))
  tl.to('.hbar', { autoAlpha: 1, duration: 0.4 }, T(3, 0.3))
  tl.fromTo('.paper', { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'expo.out', immediateRender: false }, T(3, 0.5))
  tl.set({}, {}, T(4))
  return tl
})
