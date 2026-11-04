import { gsapScene } from '@lincyaw/addon-motion/scene'
import { axes, decades, path, place, sample, scale, sigmoid, wipe } from '../../kit/chart.ts'
import { brand, clock, frame, isDark, LAYER, sup, TYPE } from '../../kit/frame.ts'
import { baseline, D, flops, hintColor, law, METHOD, PAPER, pct } from './hsl.ts'

// The forecast. The same compute axis as the first page. Only the six models up to 9×10¹⁹ FLOPs are used: their
// unhinted scores sit at zero (and any S curve fits them), their logit-mixing scores spread out, and the joint law fitted to them is drawn at each
// hint level. Its H = 0 slice is extended to 10²³ (28.7%); the held-out models then appear (25.9% at 10²³), and the
// standard scaling law fitted to the same six unhinted scores (13.2%). Last, all 19 forecasts of the paper's five
// families and benchmarks: each standard error moves to its hinted error.
// Four states: zeros fit any curve, the fit with hints, the forecast against the truth, the 19 forecasts.

const W = D.delphi.forecast_logit.find(f => f.t === 6)!
const LAW = W.laws.logit_mix!
const rungs = D.delphi.rungs
const fitted = rungs.filter(r => r.c <= W.boundary + 1e-6), held = rungs.filter(r => r.c > W.boundary + 1e-6)
const mix = D.delphi.methods.logit_mix
const HS = [0.2, 0.4, 0.6, 0.8, 1.0, 1.4]
const X = scale(18.25, 23.35, 16, 98)
const yAll = scale(0, 1, 61, 16), yAcc = scale(0, 0.4, 61, 16)
const TOP = 23
// Curves that all agree with six zeros (illustrative): S curves whose rise begins anywhere past the window.
const ZFAN = [21.3, 22.0, 22.7, 23.4]
const truth = rungs.at(-1)!.acc
/** A difference of two shown percentages, from their rounded values, so the screen adds up. */
const gap = (a: number, b: number) => Math.abs(+(a * 100).toFixed(1) - +(b * 100).toFixed(1)).toFixed(1)
// The law's forecast at the held-out 10²² model, which it overestimates (the standard law happens to land there).
const R22 = rungs.find(r => Math.abs(r.c - 22) < 1e-6)!
const at22 = law(LAW, 22, 0)

const panels = D.families.panels
const BENCH: Record<string, string> = { gsm8k: 'GSM8K', aime: 'AIME', hle: 'HLE' }
const EX = scale(0, 0.9, 52, 150)
const rowY = (i: number) => 17 + i * 2.72

export default gsapScene(({ root, gsap, at, durations, color }) => {
  const { T } = clock(at, durations)
  const dark = isDark(color)
  const hc = (h: number) => hintColor(h / 1.4, dark)
  const ticks = decades(18.25, 23.35, sup)
  const cells = fitted.map(r => { const i = rungs.indexOf(r); return HS.map(h => ({ h, v: mix.acc[mix.hints.findIndex(x => Math.abs(x - h) < 1e-6)]![i] ?? 0 })) })
  const curve = (h: number, y: typeof yAll, from: number, to: number) => path(place(sample(c => law(LAW, c, h), from, to, 90), X, y))
  const base = (y: typeof yAll, from: number, to: number) => path(place(sample(c => baseline(W.baseline, c), from, to, 90), X, y))
  const lo = 18.3, mid = W.boundary

  frame(root, `
    .win { position: absolute; left: ${X(18.35) / 1.6}cqw; top: 19.5cqh; font-size: ${TYPE.small}cqw; line-height: 1.45; white-space: nowrap; }
    .win b { display: block; font-size: ${TYPE.body}cqw; }
    .read { position: absolute; left: 66cqw; width: 31cqw; }
    .read .k { font-size: ${TYPE.small}cqw; color: var(--pm-color-muted); }
    .read .v { font-size: ${TYPE.title}cqw; font-weight: 800; line-height: 1.1; font-variant-numeric: tabular-nums; }
    .read .e { font-size: ${TYPE.small}cqw; font-weight: 650; }
    .r-ours { top: 16cqh; } .r-ours .v, .r-ours .e { color: var(--c-ours); }
    .r-true { top: 33cqh; } .r-true .v { color: var(--c-held); }
    .r-base { top: 50cqh; }
    .zfan-lab { position: absolute; font-size: ${TYPE.small}cqw; line-height: 1.6; white-space: nowrap; }
    .zfan-lab b { font-size: ${TYPE.lead}cqw; }
    .meth { position: absolute; left: ${X(18.25) / 1.6}cqw; top: 8.4cqh; font-size: ${TYPE.small}cqw; color: var(--pm-color-muted); white-space: nowrap; }
    .meth b { color: ${METHOD.logit_mix}; }
    .over { position: absolute; font-size: ${TYPE.small}cqw; color: var(--c-ours); white-space: nowrap; }
    .hleg { position: absolute; left: 66cqw; top: 16cqh; font-size: ${TYPE.small}cqw; line-height: 1.6; white-space: nowrap; }
    .hleg i { display: inline-block; width: 1.6cqw; height: 0.35cqh; vertical-align: middle; margin-right: 0.6cqw; border-radius: 99cqw; }
    .dleg { position: absolute; left: 4cqw; top: 9cqh; display: flex; gap: 2.4cqw; font-size: ${TYPE.small}cqw; white-space: nowrap; }
    .dleg i { display: inline-block; width: 1.1cqw; height: 1.1cqw; border-radius: 50%; vertical-align: -0.15cqw; margin-right: 0.5cqw; }
    .score { position: absolute; left: 70cqw; top: 54cqh; text-align: left; white-space: nowrap; }
    .score b { font-size: 5cqw; font-weight: 800; color: var(--c-ours); }
    .score span { display: block; font-size: ${TYPE.body}cqw; }
    .score em { display: block; font-style: normal; font-size: ${TYPE.small}cqw; color: var(--pm-color-muted); margin-top: 0.6cqh; }
  `, `
    ${brand(PAPER.short)}
    <svg class="layer" ${LAYER}>
      <rect class="shade" x="${X(18.25)}" y="16" width="${X(mid + 0.12) - X(18.25)}" height="48" fill="var(--c-sunk)"/>
      ${axes({ x: X, y: yAll, xTicks: ticks, xTitle: '训练算力（FLOPs，对数刻度）', cls: 'ax-x' })}
      ${axes({ x: X, y: yAll, yTicks: [0, 0.25, 0.5, 0.75, 1].map(v => ({ v, label: `${v * 100}%` })), yTitle: 'GSM8K 准确率', grid: true, cls: 'ax-all' })}
      ${axes({ x: X, y: yAcc, yTicks: [0, 0.1, 0.2, 0.3, 0.4].map(v => ({ v, label: `${v * 100}%` })), yTitle: 'GSM8K 准确率', grid: true, cls: 'ax-acc' })}
      ${HS.map((h, k) => `<g class="sl sl${k}"><path d="${curve(h, yAll, lo, mid)}" fill="none" stroke="${hc(h)}" stroke-width="0.45"/>
        <path d="${curve(h, yAll, mid, TOP + 0.2)}" fill="none" stroke="${hc(h)}" stroke-width="0.45" stroke-dasharray="1 0.8"/></g>`).join('')}
      ${cells.map((col, i) => col.map(p => `<circle class="hc" cx="${X(fitted[i]!.c)}" cy="${yAll(p.v)}" r="0.75" fill="${hc(p.h)}"/>`).join('')).join('')}
      ${ZFAN.map(c0 => `<path class="zfan" d="${path(place(sample(c => sigmoid(4 * (c - c0)), 18.3, 23.3, 120), X, yAll))}" fill="none" stroke="var(--c-muted)" stroke-width="0.35" stroke-dasharray="1.2 0.8"/>`).join('')}
      <g class="h0a"><path d="${curve(0, yAll, lo, mid)}" fill="none" stroke="var(--c-ours)" stroke-width="0.7"/></g>
      <g class="h0"><path class="h0-in" d="${curve(0, yAcc, lo, mid)}" fill="none" stroke="var(--c-ours)" stroke-width="0.7"/>
        <path class="h0-out" d="${curve(0, yAcc, mid, TOP)}" fill="none" stroke="var(--c-ours)" stroke-width="0.7" stroke-dasharray="1.2 0.8"/>
        <circle class="h0-end" cx="${X(TOP)}" cy="${yAcc(W.pred)}" r="1.3" fill="var(--c-ours)"/></g>
      <g class="bl"><path class="bl-in" d="${base(yAcc, lo, mid)}" fill="none" stroke="var(--c-base)" stroke-width="0.6" stroke-dasharray="0.7 0.7"/>
        <path class="bl-out" d="${base(yAcc, mid, TOP)}" fill="none" stroke="var(--c-base)" stroke-width="0.6" stroke-dasharray="0.7 0.7"/>
        <circle class="bl-end" cx="${X(TOP)}" cy="${yAcc(W.base_pred)}" r="1.1" fill="var(--c-base)"/></g>
      ${held.map((r, i) => `<circle class="held held${i}" cx="${X(r.c)}" cy="${yAcc(r.acc)}" r="${r.c === TOP ? 1.5 : 1.05}" fill="var(--c-held)"/>`).join('')}
      ${fitted.map((r, i) => `<circle class="fit fit${i}" cx="${X(r.c)}" cy="${yAll(r.acc)}" r="1.05" fill="var(--c-fit)"/>`).join('')}
      <g class="over22"><path d="M${X(22)},${yAcc(at22)} L${X(22)},${yAcc(R22.acc)}" stroke="var(--c-ours)" stroke-width="0.4" stroke-dasharray="0.6 0.5"/></g>
      <g class="err"><path d="M${X(TOP) + 2.6},${yAcc(W.pred)} L${X(TOP) + 2.6},${yAcc(truth)}" stroke="var(--c-ours)" stroke-width="0.5"/>
        <path d="M${X(TOP) + 4.4},${yAcc(truth)} L${X(TOP) + 4.4},${yAcc(W.base_pred)}" stroke="var(--c-base)" stroke-width="0.5"/></g>
      <g class="dumb">
        <path d="M${EX(0)},14.6 L${EX(0)},${rowY(18) + 1.6}" stroke="var(--c-line-strong)" stroke-width="0.25"/>
        ${[0, 0.2, 0.4, 0.6, 0.8].map(v => `<g><line x1="${EX(v)}" y1="14.6" x2="${EX(v)}" y2="${rowY(18) + 1.6}" stroke="var(--c-line)" stroke-width="0.18"/>
          <text x="${EX(v)}" y="13.4" font-size="2.3" text-anchor="middle" fill="var(--c-muted)">${v * 100}</text></g>`).join('')}
        <text x="${EX(0.45)}" y="10" font-size="2.5" text-anchor="middle" fill="var(--c-muted)">对最大模型的预测误差（百分点）</text>
        ${panels.map((p, i) => {
          const first = i === 0 || panels[i - 1]!.family !== p.family || panels[i - 1]!.bench !== p.bench
          return `<g class="row row${i}">${first ? `<text x="7" y="${rowY(i) + 0.85}" font-size="2.35" font-weight="700">${p.name} · ${BENCH[p.bench]}</text>` : ''}
            <text x="${EX(0) - 1.4}" y="${rowY(i) + 0.8}" font-size="2" text-anchor="end" fill="var(--c-muted)">用 ${p.t} 个</text>
            <line class="link" x1="${EX(p.base_err)}" y1="${rowY(i)}" x2="${EX(p.base_err)}" y2="${rowY(i)}" stroke="${p.err < p.base_err ? 'var(--c-ours)' : 'var(--c-muted)'}" stroke-width="0.5"/>
            <circle cx="${EX(p.base_err)}" cy="${rowY(i)}" r="0.95" fill="var(--c-base)"/>
            <circle class="ours" cx="${EX(p.base_err)}" cy="${rowY(i)}" r="0.95" fill="var(--c-ours)"/></g>`
        }).join('')}
        <g class="med"><line x1="${EX(D.families.median_base)}" y1="14.6" x2="${EX(D.families.median_base)}" y2="${rowY(18) + 1.6}" stroke="var(--c-base)" stroke-width="0.3" stroke-dasharray="0.8 0.6"/>
          <line class="med-o" x1="${EX(D.families.median_ens)}" y1="14.6" x2="${EX(D.families.median_ens)}" y2="${rowY(18) + 1.6}" stroke="var(--c-ours)" stroke-width="0.35" stroke-dasharray="0.8 0.6"/>
          <text x="${EX(D.families.median_base) + 0.8}" y="${rowY(18) + 4}" font-size="2.3" fill="var(--c-base)">中位 ${(D.families.median_base * 100).toFixed(1)}</text>
          <text class="med-o" x="${EX(D.families.median_ens) - 0.8}" y="${rowY(18) + 4}" font-size="2.3" text-anchor="end" fill="var(--c-ours)">中位 ${(D.families.median_ens * 100).toFixed(1)}</text></g>
      </g>
    </svg>
    <div class="win"><b>用于拟合的 6 个模型</b><span class="muted">≤ ${flops(W.boundary)} FLOPs</span></div>
    <div class="meth"><b>logit 混合</b> · 教师模型 Llama-3.1 8B · H 可大于 1</div>
    <div class="zfan-lab" style="left:66cqw;top:30cqh"><b>只看原题</b><br>曲线位置不确定<span class="note">　示意</span></div>
    <div class="hleg">${HS.map(h => `<div><i style="background:${hc(h)}"></i>提示量 H = ${h}</div>`).join('')}<div><i style="background:var(--c-ours)"></i>H = 0（原题）</div></div>
    <div class="read r-ours"><div class="k">联合定律 · ${flops(TOP)}</div><div class="v n-ours">${pct(W.pred)}</div><div class="e">差 ${gap(W.pred, truth)}</div></div>
    <div class="over over22" style="right:${100 - X(22) / 1.6 + 0.6}cqw;top:${yAcc(0.19) / 0.9}cqh">10²²：高估 ${gap(at22, R22.acc)}</div>
    <div class="read r-true"><div class="k">实际</div><div class="v">${pct(truth)}</div></div>
    <div class="read r-base"><div class="k">标准缩放定律</div><div class="v">${pct(W.base_pred)}</div><div class="e">低估 ${gap(W.base_pred, truth)}</div></div>
    <div class="dleg"><span><i style="background:var(--c-base)"></i>标准缩放定律</span><span><i style="background:var(--c-ours)"></i>提示辅助（截断与遮盖预测均值）</span></div>
    <div class="score"><b>${D.families.wins} / ${panels.length}</b><span>次预测更准</span><em>五组模型 · 三个基准</em></div>
  `)

  const tl = gsap.timeline()
  gsap.set(['.zfan', '.zfan-lab', '.meth', '.over22', '.win', '.shade', '.ax-x', '.ax-all', '.ax-acc', '.sl', '.hc', '.h0a', '.h0', '.bl', '.held', '.fit', '.err', '.dumb', '.row', '.med', '.hleg', '.read', '.dleg', '.score'], { autoAlpha: 0 })
  gsap.set(['.sl path:first-child', '.h0a path', '.h0-in'], { drawSVG: '0%' })

  // State 0: the window of six models and their zeros; curves that all fit the zeros fan out (illustrative): the
  // position and the steepness of the S curve are not determined.
  tl.to(['.ax-x', '.ax-all', '.shade'], { autoAlpha: 1, duration: 0.4 }, T(0, 0.02))
  tl.fromTo('.fit', { autoAlpha: 0, scale: 0.3, transformOrigin: '50% 50%' }, { autoAlpha: 1, scale: 1, duration: 0.35, ease: 'expo.out', stagger: 0.06, immediateRender: false }, T(0, 0.06))
  tl.to('.win', { autoAlpha: 1, duration: 0.4 }, T(0, 0.14))
  tl.to('.zfan', { autoAlpha: 1, duration: 0.01 }, T(0, 0.55))
  root.querySelectorAll('.zfan').forEach((el, i) => wipe(tl, el, T(0, 0.55) + i * 0.15, 0.9))
  tl.to('.zfan-lab', { autoAlpha: 1, duration: 0.4 }, T(0, 0.7))

  // State 1: hints. The fan goes; the method line, the hinted scores of the six models and the law fitted to them at
  // each level; its H = 0 slice is the forecast.
  tl.to(['.zfan', '.zfan-lab'], { autoAlpha: 0, duration: 0.35 }, T(1))
  tl.to('.meth', { autoAlpha: 1, duration: 0.4 }, T(1, 0.04))
  tl.fromTo('.hc', { autoAlpha: 0, attr: { cy: yAll(0.015) } }, { autoAlpha: 1, attr: { cy: (j: number) => yAll(cells[Math.floor(j / HS.length)]![j % HS.length]!.v) }, duration: 0.7, ease: 'power3.out', stagger: 0.012, immediateRender: false }, T(1, 0.3))
  tl.to('.hleg', { autoAlpha: 1, duration: 0.4 }, T(1, 0.34))
  HS.forEach((_, k) => {
    tl.to(`.sl${k}`, { autoAlpha: 1, duration: 0.01 }, T(1, 0.5))
    tl.to(`.sl${k} path:first-child`, { drawSVG: '100%', duration: 0.5, ease: 'power2.in' }, T(1, 0.5) + k * 0.06)
    wipe(tl, root.querySelector(`.sl${k} path:last-child`)!, T(1, 0.5) + k * 0.06 + 0.5, 0.6, 'power2.out')
  })
  tl.to('.h0a', { autoAlpha: 1, duration: 0.01 }, T(1, 0.78))
  tl.to('.h0a path', { drawSVG: '100%', duration: 0.6, ease: 'power2.inOut' }, T(1, 0.78))

  // State 2: the axis closes in on 0–40%; only the H = 0 slice stays, and runs on to 10²³. Then the truth, then the
  // standard scaling law on the same six models.
  tl.to(['.sl', '.hc', '.hleg', '.ax-all', '.h0a'], { autoAlpha: 0, duration: 0.35 }, T(2))
  tl.to('.ax-acc', { autoAlpha: 1, duration: 0.4 }, T(2, 0.02))
  fitted.forEach((r, i) => tl.to(`.fit${i}`, { attr: { cy: yAcc(r.acc) }, duration: 0.6, ease: 'power3.inOut' }, T(2, 0.02)))
  tl.to('.h0', { autoAlpha: 1, duration: 0.01 }, T(2, 0.06))
  tl.to('.h0-in', { drawSVG: '100%', duration: 0.3, ease: 'none' }, T(2, 0.06))
  wipe(tl, root.querySelector('.h0-out')!, T(2, 0.1), 1.1)
  tl.fromTo('.h0-end', { autoAlpha: 0, scale: 0.2, transformOrigin: '50% 50%' }, { autoAlpha: 1, scale: 1, duration: 0.4, ease: 'back.out(2)', immediateRender: false }, T(2, 0.24))
  tl.to('.r-ours', { autoAlpha: 1, duration: 0.4 }, T(2, 0.26))
  tl.fromTo('.held', { autoAlpha: 0, scale: 0.3, transformOrigin: '50% 50%' }, { autoAlpha: 1, scale: 1, duration: 0.35, ease: 'expo.out', stagger: 0.07, immediateRender: false }, T(2, 0.4))
  tl.to('.r-true', { autoAlpha: 1, duration: 0.4 }, T(2, 0.48))
  tl.to('.bl', { autoAlpha: 1, duration: 0.01 }, T(2, 0.62))
  wipe(tl, root.querySelector('.bl-in')!, T(2, 0.62), 0.35, 'power2.in')
  wipe(tl, root.querySelector('.bl-out')!, T(2, 0.62) + 0.35, 0.8, 'power2.out')
  tl.to('.r-base', { autoAlpha: 1, duration: 0.4 }, T(2, 0.78))
  tl.to('.err', { autoAlpha: 1, duration: 0.4 }, T(2, 0.82))
  tl.to('.over22', { autoAlpha: 1, duration: 0.4 }, T(2, 0.88))

  // State 3: the 19 forecasts. The standard errors first, then each hinted error slides in from its standard one.
  tl.to(['.meth', '.over22', '.win', '.shade', '.ax-x', '.ax-acc', '.h0', '.bl', '.held', '.fit', '.err', '.read'], { autoAlpha: 0, duration: 0.35 }, T(3))
  tl.to(['.dumb', '.dleg'], { autoAlpha: 1, duration: 0.4 }, T(3, 0.02))
  tl.fromTo('.row', { autoAlpha: 0, x: -3 }, { autoAlpha: 1, x: 0, duration: 0.3, ease: 'expo.out', stagger: 0.04, immediateRender: false }, T(3, 0.06))
  panels.forEach((p, i) => {
    const t = T(3, 0.34) + i * 0.07
    tl.to(`.row${i} .ours`, { attr: { cx: EX(p.err) }, duration: 0.6, ease: 'power3.inOut' }, t)
    tl.to(`.row${i} .link`, { attr: { x2: EX(p.err) }, duration: 0.6, ease: 'power3.inOut' }, t)
  })
  tl.to('.med', { autoAlpha: 1, duration: 0.4 }, T(3, 0.7))
  tl.fromTo('.score', { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: 'expo.out', immediateRender: false }, T(3, 0.76))
  tl.set({}, {}, T(4))
  return tl
})
