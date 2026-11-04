import { gsapScene } from '@lincyaw/addon-motion/scene'
import { axes, path, ramp, scale, wipe } from '../../kit/chart.ts'
import { brand, clock, escape, frame, isDark, LAYER, TYPE } from '../../kit/frame.ts'
import { D, PAPER } from './hsl.ts'

// Ranking. Seven models on AIME whose unhinted accuracies are all under 1%: a slope chart from their true unhinted
// accuracy (left) to their accuracy with truncation hints at H = 0.7 (right). The gaps widen and the order mostly
// holds; the one crossing stays visible. Then Kendall's τ against the number of completions per problem: one hinted
// completion per problem ranks as well as about five unhinted ones.
// Two states: the slope chart, τ against k.

const R = D.ranking.aime
const NAMES: Record<string, string> = {
  'Llama-3.1-8B-Instruct': 'Llama-3.1 8B', 'Qwen2.5-1.5B-Instruct': 'Qwen2.5 1.5B', 'gemma-3-1b-it': 'Gemma-3 1B',
  'gemma-1.1-7b-it': 'Gemma-1.1 7B', 'Qwen2.5-0.5B-Instruct': 'Qwen2.5 0.5B', 'Mistral-7B-Instruct-v0.3': 'Mistral 7B',
  'Llama-2-13b-chat-hf': 'Llama-2 13B',
}
const hinted = R.curves['0.7']!
const LX = 50, RX = 92
const LY = scale(0, 0.01, 64, 18), RY = scale(0, 0.25, 64, 18)

/** The lowest and highest of a set of accuracies, as "0.06% 到 0.81%". */
const range = (v: number[]) => { const f = (x: number) => (x * 100).toFixed(x < 0.01 ? 2 : 1); return `${f(Math.min(...v))}% 到 ${f(Math.max(...v))}%` }

// Labels beside the left dots, pushed apart where the dots are closer than a line of text.
function spread(ys: number[], gap: number): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y)
  const out = order.map(o => o.y)
  for (let k = 1; k < out.length; k++) out[k] = Math.max(out[k]!, out[k - 1]! + gap)
  const shift = (out.reduce((s, v) => s + v, 0) - order.reduce((s, o) => s + o.y, 0)) / out.length
  const placed: number[] = []
  order.forEach((o, k) => { placed[o.i] = out[k]! - shift })
  return placed
}

// τ against k: log2 of the completions per problem on x.
const KX = scale(-1.6, 7.25, 20, 98), KY = scale(0, 1, 64, 16)
const kx = (k: number) => KX(Math.log2(k))
const target = R.prior[0]!
const cross = (() => {
  for (let i = 1; i < R.budgets.length; i++) {
    const a = R.avg[i - 1]!, b = R.avg[i]!
    if (a < target && b >= target) {
      const l0 = Math.log2(R.budgets[i - 1]!), l1 = Math.log2(R.budgets[i]!)
      return 2 ** (l0 + (target - a) / (b - a) * (l1 - l0))
    }
  }
  return R.budgets.at(-1)!
})()

export default gsapScene(({ root, gsap, at, durations, color }) => {
  const { T } = clock(at, durations)
  const dark = isDark(color)
  // Darker is better in light pages, brighter is better in dark ones (as the paper's blues, rank by the truth).
  const blues = dark ? ['#3b6ea8', '#6baed6', '#9ecae1', '#deebf7'] : ['#9ecae1', '#6baed6', '#2171b5', '#08306b']
  const shade = (rank: number) => ramp(blues, 1 - rank / (R.models.length - 1))
  const labelY = spread(R.truth.map(v => LY(v)), 2.9)
  const purple = dark ? '#b49be6' : '#7b52c9'

  frame(root, `
    .side { position: absolute; left: 66cqw; width: 31cqw; }
    .side b { display: block; font-size: 2.3cqw; line-height: 1.2; white-space: nowrap; }
    .side span { display: block; margin-top: 0.6cqh; font-size: ${TYPE.small}cqw; color: var(--pm-color-muted); line-height: 1.45; }
    .k0 { top: 18cqh; } .k1 { top: 18cqh; }
    .leg { position: absolute; left: 66cqw; top: 42cqh; width: 31cqw; font-size: ${TYPE.small}cqw; line-height: 1.5; }
    .leg div { display: flex; gap: 0.8cqw; align-items: baseline; margin-bottom: 0.8cqh; }
    .leg i { flex: none; display: inline-block; width: 2.2cqw; height: 0.4cqh; border-radius: 99cqw; transform: translateY(-0.4cqh); }
    .src { position: absolute; left: 66cqw; top: 64cqh; font-size: ${TYPE.tiny}cqw; color: var(--pm-color-muted); white-space: nowrap; }
  `, `
    ${brand(PAPER.short)}
    <svg class="layer" ${LAYER}>
      <g class="slope">
        <line x1="${LX}" y1="${LY(0)}" x2="${LX}" y2="${LY(0.01)}" stroke="var(--c-line-strong)" stroke-width="0.3"/>
        <line x1="${RX}" y1="${RY(0)}" x2="${RX}" y2="${RY(0.25)}" stroke="var(--c-line-strong)" stroke-width="0.3"/>
        ${[0, 0.0025, 0.005, 0.0075, 0.01].map(v => `<line x1="${LX - 0.9}" y1="${LY(v)}" x2="${LX}" y2="${LY(v)}" stroke="var(--c-line-strong)" stroke-width="0.25"/>`).join('')}
        <text x="${LX - 1.4}" y="${LY(0.01) + 0.8}" font-size="2.1" text-anchor="end" fill="var(--c-muted)">1%</text>
        <text x="${LX}" y="${LY(0) + 3.4}" font-size="2.1" text-anchor="middle" fill="var(--c-muted)">0%</text>
        ${[0, 0.05, 0.1, 0.15, 0.2, 0.25].map(v => `<g class="rt"><line x1="${RX}" y1="${RY(v)}" x2="${RX + 0.9}" y2="${RY(v)}" stroke="var(--c-line-strong)" stroke-width="0.25"/>
          <text x="${RX + 1.6}" y="${RY(v) + 0.8}" font-size="2.1" fill="var(--c-muted)">${Math.round(v * 100)}%</text></g>`).join('')}
        <text x="${LX}" y="13" font-size="2.6" font-weight="700" text-anchor="middle">原题准确率（真值）</text>
        <text x="${LX}" y="15.6" font-size="2" text-anchor="middle" fill="var(--c-muted)">每题 4,096 次采样</text>
        <text x="${RX}" y="13" font-size="2.6" font-weight="700" text-anchor="middle">提示 H = 0.7</text>
      </g>
      ${R.models.map((m, i) => `<g class="m m${i}">
        <line class="lead" x1="${LX - 9.5}" y1="${labelY[i]}" x2="${LX - 1.4}" y2="${LY(R.truth[i]!)}" stroke="var(--c-line-strong)" stroke-width="0.18"/>
        <text class="name" x="${LX - 10}" y="${labelY[i]! + 0.75}" font-size="2.2" text-anchor="end" fill="${shade(i)}" font-weight="650">${escape(NAMES[m] ?? m)}</text>
        <path class="link" d="M${LX},${LY(R.truth[i]!)} L${RX},${RY(hinted[i]!)}" fill="none" stroke="${shade(i)}" stroke-width="0.5"/>
        <circle class="dl" cx="${LX}" cy="${LY(R.truth[i]!)}" r="1.05" fill="${shade(i)}"/>
        <circle class="dr" cx="${RX}" cy="${RY(hinted[i]!)}" r="1.05" fill="${shade(i)}"/></g>`).join('')}
      <g class="tau">
        ${axes({ x: KX, y: KY, xTicks: R.budgets.filter(k => Number.isInteger(Math.log2(k))).map(k => ({ v: Math.log2(k), label: String(k) })),
          yTicks: [0, 0.25, 0.5, 0.75, 1].map(v => ({ v, label: v.toFixed(2) })), xTitle: '每题采样次数 k（对数刻度）', yTitle: '排序与真值的一致性（Kendall τ）', grid: true })}
        <path class="avg" d="${path(R.budgets.map((k, i) => [kx(k), KY(R.avg[i]!)] as const))}" fill="none" stroke="var(--c-base)" stroke-width="0.6"/>
        <path class="prior" d="${path(R.budgets.map((k, i) => [kx(k), KY(R.prior[i]!)] as const))}" fill="none" stroke="${purple}" stroke-width="0.7"/>
        ${R.budgets.map((k, i) => `<circle class="pa" cx="${kx(k)}" cy="${KY(R.avg[i]!)}" r="0.55" fill="var(--c-base)"/><circle class="pp" cx="${kx(k)}" cy="${KY(R.prior[i]!)}" r="0.6" fill="${purple}"/>`).join('')}
        <g class="gap"><path d="M${kx(1) - 1.6},${KY(R.avg[0]!)} L${kx(1) - 1.6},${KY(target)}" fill="none" stroke="var(--c-ink)" stroke-width="0.35"/>
          <path d="M${kx(1) - 2.2},${KY(R.avg[0]!)} L${kx(1) - 1},${KY(R.avg[0]!)} M${kx(1) - 2.2},${KY(target)} L${kx(1) - 1},${KY(target)}" fill="none" stroke="var(--c-ink)" stroke-width="0.35"/>
          <text x="${kx(1) - 2.8}" y="${(KY(R.avg[0]!) + KY(target)) / 2 + 0.9}" font-size="2.6" font-weight="800" text-anchor="end">+${(target - R.avg[0]!).toFixed(2)}</text></g>
        <g class="eq"><path class="eq-line" d="M${kx(1)},${KY(target)} L${kx(cross)},${KY(target)}" fill="none" stroke="var(--c-ink)" stroke-width="0.35" stroke-dasharray="0.8 0.6"/>
          <path class="eq-drop" d="M${kx(cross)},${KY(target)} L${kx(cross)},${KY(0)}" fill="none" stroke="var(--c-muted)" stroke-width="0.25" stroke-dasharray="0.6 0.6"/>
          <circle cx="${kx(cross)}" cy="${KY(target)}" r="0.9" fill="var(--c-ink)"/>
          <text class="eq-tx" x="${kx(cross) + 1.4}" y="${KY(target) + 3.6}" font-size="2.7" font-weight="800">≈ ${Math.round(cross)} 次</text></g>
      </g>
    </svg>
    <div class="side k0"><b>分数拉开，顺序基本不变</b><span>AIME 上的七个模型<br>原题准确率 ${range(R.truth)}<br>截断提示 H = 0.7：${range(hinted)}<br>七个模型中只有一对交换了位置</span></div>
    <div class="side k1"><b>1 次带提示 ≈ ${Math.round(cross)} 次普通采样</b><span>每题只采样一次时，带提示的排序与真值的一致性是 ${target.toFixed(2)}，普通采样是 ${R.avg[0]!.toFixed(2)}</span></div>
    <div class="leg"><div><i style="background:var(--c-base)"></i><span>普通采样：k 次都用原题</span></div>
      <div><i style="background:${purple}"></i><span>带提示：每题一次带提示的采样，其余为原题</span></div></div>
    <div class="src">论文图 8 的数据（截断，AIME）</div>
  `)

  const tl = gsap.timeline()
  gsap.set(['.slope', '.lead', '.name', '.link', '.dl', '.dr', '.tau', '.avg', '.prior', '.pa', '.pp', '.gap', '.eq', '.side', '.leg', '.src'], { autoAlpha: 0 })
  gsap.set(['.link', '.avg', '.prior'], { drawSVG: '0%' })

  // State 0. 七个模型在 AIME 上都不到 1%: the left column and its seven dots, named. 加了提示，分数拉开: each model's
  // line runs to its hinted accuracy, best first.
  tl.to('.slope', { autoAlpha: 1, duration: 0.4 }, T(0, 0.04))
  tl.fromTo('.dl', { autoAlpha: 0, scale: 0.3, transformOrigin: '50% 50%' }, { autoAlpha: 1, scale: 1, duration: 0.35, ease: 'expo.out', stagger: 0.08, immediateRender: false }, T(0, 0.18))
  tl.to(['.lead', '.name'], { autoAlpha: 1, duration: 0.35, stagger: 0.04 }, T(0, 0.26))
  tl.to('.link', { autoAlpha: 1, duration: 0.01 }, T(0, 0.58))
  tl.to('.link', { drawSVG: '100%', duration: 0.7, ease: 'power2.inOut', stagger: 0.12 }, T(0, 0.58))
  R.models.forEach((_, i) => tl.fromTo(`.m${i} .dr`, { autoAlpha: 0, scale: 0.3, transformOrigin: '50% 50%' },
    { autoAlpha: 1, scale: 1, duration: 0.3, ease: 'back.out(2)', immediateRender: false }, T(0, 0.58) + i * 0.12 + 0.6))
  tl.to('.k0', { autoAlpha: 1, duration: 0.4 }, T(0, 0.8))

  // State 1. 每题一次带提示的采样: τ at k = 1 for both, the gap; 相当于约五次普通采样: the unhinted line climbs to the
  // hinted one's first value at k ≈ 5.
  tl.to(['.slope', '.m', '.k0'], { autoAlpha: 0, duration: 0.35 }, T(1))
  tl.to(['.tau', '.leg', '.src'], { autoAlpha: 1, duration: 0.4 }, T(1, 0.02))
  tl.to(['.avg', '.prior'], { autoAlpha: 1, duration: 0.01 }, T(1, 0.06))
  tl.to(['.avg', '.prior'], { drawSVG: '100%', duration: 1.1, ease: 'power2.inOut' }, T(1, 0.06))
  tl.to(['.pa', '.pp'], { autoAlpha: 1, duration: 0.3, stagger: 0.02 }, T(1, 0.12))
  tl.fromTo('.gap', { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.35, immediateRender: false }, T(1, 0.32))
  // The two dotted lines are revealed with a clip: drawSVG would replace their dash pattern.
  gsap.set(['.eq-drop', '.eq-tx', '.eq circle'], { autoAlpha: 0 })
  tl.to('.eq', { autoAlpha: 1, duration: 0.01 }, T(1, 0.55))
  wipe(tl, root.querySelector('.eq-line')!, T(1, 0.55), 0.6)
  tl.to(['.eq circle', '.eq-drop', '.eq-tx'], { autoAlpha: 1, duration: 0.3, stagger: 0.08 }, T(1, 0.66))
  tl.to('.k1', { autoAlpha: 1, duration: 0.4 }, T(1, 0.6))
  tl.set({}, {}, T(2))
  return tl
})
