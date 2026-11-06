import { defineScene } from '@lincyaw/addon-motion/scene'
import { brand, frame, TYPE } from '../../../kit/frame.ts'
import { FIGURE_CSS, figureHtml, word } from '../../../kit/figure.ts'
import type { FigureMap, Region } from '../../../kit/figure.ts'
import preferenceFig from '../figures/preference-accuracy.png'
import preferenceMap from '../figures/preference-accuracy.json'
import { D, PAPER, PAPER_COLOURS, PREFERENCE_LABEL, TERMS, pct, point, signed } from './paper.ts'

const PREFERENCE = preferenceMap as unknown as FigureMap
const MAX_PASS = 80
const MAX_SPEED = 3

const preference = (key: string) => {
  const row = D.preferences.find(item => item.key === key)
  if (!row) throw new Error(`missing preference result: ${key}`)
  return row
}

const result = (benchmark: string, index: number) => {
  const row = D.results.filter(item => item.benchmark === benchmark)[index]
  if (!row) throw new Error(`missing ${benchmark} result ${index}`)
  return row
}

const modelLabel = (model: string) => model === 'GLM-5.3-NVFP4' ? 'GLM-5.3' : model
const ratio = (value: number, digits = 3) => value.toFixed(digits)
const scoreX = (value: number) => `${(value / MAX_PASS * 100).toFixed(2)}%`
const speedX = (value: number) => `${(value / MAX_SPEED * 100).toFixed(2)}%`

const runTests = preference('run_tests')
const decisionFrame = preference('decision_frame')
const correctness = preference('decision_correctness')
const correctnessForward = correctness.median_forward ?? correctness.forward
const correctnessAdversarial = correctness.median_adversarial ?? correctness.adversarial
const correctnessApprox = `≈ ${(Math.round((correctnessForward + correctnessAdversarial) * 5) / 10).toFixed(1)}`
const deepsweGlm = result('DeepSWE', 0)
const deepsweDeepSeek = result('DeepSWE', 1)
const nl2repoGlm = result('NL2Repo-Bench', 0)
const nl2repoDeepSeek = result('NL2Repo-Bench', 1)
const benchmarkRows = [
  { first: deepsweGlm, second: nl2repoGlm },
  { first: deepsweDeepSeek, second: nl2repoDeepSeek },
]
const speedRows = [
  { model: 'GLM-5.3', ...D.speed.glm },
  { model: 'DeepSeek-V4.1-Flash', ...D.speed.deepseek },
]

const ring = (region: Region, cls = 'pref-mark') => {
  const pad = 0.012
  return `<i class="${cls}" style="left:${(region.x - pad) * 100}%;top:${(region.y - pad) * 100}%;
    width:${(region.w + pad * 2) * 100}%;height:${(region.h + pad * 2) * 100}%"></i>`
}

const figureMarks = [
  ring(word(PREFERENCE, '0.635')),
  ring(word(PREFERENCE, '0.85')),
  ring(word(PREFERENCE, '0.5'), 'pref-random-mark'),
].join('')

const benchmarkRowHtml = (row: (typeof benchmarkRows)[number], index: number) => `
  <div class="score-row score-row${index}">
    <div class="score-model"><b>${modelLabel(row.first.model)}</b><span>${TERMS.targetModel} 不变</span></div>
    <div class="score-track">
      ${[0, 20, 40, 60, 80].map(value => `<i class="grid-line" style="left:${scoreX(value)}"></i>`).join('')}
      <i class="bar-base" style="width:0"></i>
      <i class="bar-gain" style="left:0;width:0"></i>
      <i class="pin pin-base" style="left:0"></i>
      <i class="pin pin-after" style="left:0"></i>
      <span class="score-values score-values--first" style="left:${scoreX(row.first.adversarial)}%">
        <span>${point(row.first.base)}</span><b>→</b><span>${point(row.first.adversarial)}</span>
      </span>
      <span class="score-values score-values--second" style="left:${scoreX(row.second.adversarial)}%">
        <span>${point(row.second.base)}</span><b>→</b><span>${point(row.second.adversarial)}</span>
      </span>
    </div>
    <div class="delta-stack">
      <b class="delta delta--first">${signed(row.first.delta)}</b>
      <b class="delta delta--second">${signed(row.second.delta)}</b>
    </div>
  </div>`

const speedRowHtml = (row: (typeof speedRows)[number], index: number) => {
  const change = row.accepted_after - row.accepted_before
  const drop = row.accepted_before === 0 ? 0 : Math.abs(change) / row.accepted_before
  return `<div class="speed-row speed-row${index}">
    <div class="speed-model"><b>${row.model}</b><span>${TERMS.acceptedLength}</span></div>
    <div class="speed-track">
      ${[0, 1, 2, 3].map(value => `<i class="grid-line" style="left:${speedX(value)}"></i>`).join('')}
      <i class="speed-before" style="width:0"></i>
      <i class="speed-after" style="width:0"></i>
      ${change < 0 ? `<i class="speed-loss" style="left:${speedX(row.accepted_after)};width:0"></i>` : ''}
      <i class="pin pin-base" style="left:${speedX(row.accepted_before)}"></i>
      <i class="pin pin-after" style="left:${speedX(row.accepted_after)}"></i>
      <span class="speed-values" style="left:${speedX(Math.max(row.accepted_before, row.accepted_after))}%">
        <span>${ratio(row.accepted_before, 2)}</span><b>→</b><span>${ratio(row.accepted_after, 2)}</span>
      </span>
    </div>
    <div class="speed-delta ${change < 0 ? 'speed-delta--down' : ''}">${change === 0 ? ratio(0, 2) : `−${pct(drop, 1)}`}</div>
  </div>`
}

// Launch-style evidence: learned preference first, then benchmark lift on a shared pair of model rows,
// then acceptance length. Every frame is computed from seek(ms), so steps can be visited in any order.
export default defineScene(({ root, at, durations }) => {
  const scene = frame(root, `${FIGURE_CSS}${PAPER_COLOURS}
    .stage { position: absolute; inset: 0; opacity: 0; visibility: hidden; }
    .pref-fig { top: 18cqh; }
    .pref-fig .pfig__marks > * { transform-origin: center; }
    .pref-mark { border: 0.3cqw solid var(--c-accept); border-radius: 0.55cqw;
      box-shadow: 0 0 0 0.22cqw color-mix(in srgb, var(--c-accept) 24%, transparent); }
    .pref-random-mark { border: 0.24cqw dashed var(--c-baseline); border-radius: 50%; }
    .pref-src { left: 3.2cqw; top: 78.5cqh; }
    .pref-head, .pref-list, .pref-note, .speed-head { position: absolute; }
    .pref-head { left: 61cqw; top: 10cqh; width: 35cqw; }
    .eyebrow { font-size: ${TYPE.tiny}cqw; color: var(--pm-color-muted); font-weight: 700; letter-spacing: 0; }
    .pref-head h2, .bench-copy h2, .speed-head h2 { margin: 0.7cqh 0 0; font-size: ${TYPE.title}cqw; line-height: 1.08; }
    .pref-head p { margin: 1.2cqh 0 0; font-size: ${TYPE.small}cqw; color: var(--pm-color-muted); line-height: 1.4; }
    .pref-list { left: 61cqw; top: 32cqh; width: 35cqw; }
    .pref-item { position: relative; min-height: 12cqh; padding: 1.35cqw 0 1.2cqh; border-top: 0.12cqw solid var(--c-line);
      display: grid; grid-template-columns: 1fr auto; align-items: end; gap: 1cqw; }
    .pref-item span { font-size: ${TYPE.small}cqw; color: var(--pm-color-muted); line-height: 1.35; }
    .pref-item em { display: block; margin-top: 0.5cqh; font-style: normal; font-size: ${TYPE.tiny}cqw; color: var(--pm-color-muted); }
    .pref-item b { font-size: ${TYPE.title}cqw; line-height: 1; color: var(--c-accept); font-variant-numeric: tabular-nums; white-space: nowrap; }
    .pref-item.neutral b { color: var(--pm-color-ink); }
    .pref-note { left: 61cqw; top: 72cqh; width: 35cqw; font-size: ${TYPE.small}cqw; color: var(--pm-color-muted); }
    .pref-note b { color: var(--pm-color-ink); }

    .bench-copy { left: 7cqw; top: 9cqh; width: 58cqw; }
    .bench-copy h2 { max-width: 52cqw; }
    .bench-copy--a, .bench-copy--b { position: absolute; left: 7cqw; top: 9cqh; width: 58cqw; }
    .bench-copy--b { opacity: 0; }
    .score-rows { position: absolute; left: 7cqw; top: 34cqh; width: 89cqw; }
    .score-row { position: relative; height: 17cqh; display: grid; grid-template-columns: 21cqw 58cqw 8cqw; align-items: center; gap: 1.4cqw; }
    .score-model b { display: block; font-size: ${TYPE.body}cqw; }
    .score-model span { display: block; margin-top: 0.55cqh; font-size: ${TYPE.tiny}cqw; color: var(--pm-color-muted); }
    .score-track, .speed-track { position: relative; height: 2.4cqh; border-bottom: 0.12cqw solid var(--c-line-strong); }
    .grid-line { position: absolute; top: 0; bottom: -1.2cqh; width: 0.1cqw; background: var(--c-line); }
    .bar-base, .bar-gain, .speed-before, .speed-after, .speed-loss {
      position: absolute; bottom: 0.35cqh; height: 1.25cqh; border-radius: 99cqw; }
    .bar-base, .speed-before { left: 0; background: color-mix(in srgb, var(--c-target) 30%, var(--pm-color-surface)); }
    .bar-gain, .speed-after { left: 0; background: var(--c-accept); }
    .speed-loss { background: var(--c-reject); }
    .pin { position: absolute; bottom: 0; width: 0.72cqw; height: 2.8cqh; transform: translateX(-50%); border-radius: 99cqw; }
    .pin-base { background: var(--c-target); }
    .pin-after { background: var(--c-accept); }
    .score-values { position: absolute; bottom: 3.4cqh; transform: translateX(-100%); white-space: nowrap;
      font-size: ${TYPE.small}cqw; font-variant-numeric: tabular-nums; color: var(--pm-color-muted); }
    .score-values b { margin: 0 0.6cqw; font-weight: 600; }
    .score-values span:last-child { color: var(--pm-color-ink); font-weight: 800; }
    .score-values--second { opacity: 0; }
    .delta-stack { position: relative; height: 6cqh; }
    .delta { position: absolute; right: 0; top: 50%; transform: translateY(-50%); font-size: ${TYPE.title}cqw;
      color: var(--c-accept); font-variant-numeric: tabular-nums; white-space: nowrap; }
    .delta--second { opacity: 0; }
    .score-axis { position: absolute; left: 29.4cqw; top: 70cqh; width: 58cqw; display: flex; justify-content: space-between;
      font-size: ${TYPE.tiny}cqw; color: var(--pm-color-muted); }
    .bench-source { position: absolute; left: 7cqw; top: 76cqh; font-size: ${TYPE.tiny}cqw; color: var(--pm-color-muted); }
    .bench-source--second { opacity: 0; }
    .bench-note { position: absolute; left: 7cqw; top: 80.5cqh; font-size: ${TYPE.small}cqw; color: var(--pm-color-muted); }
    .bench-note b { color: var(--pm-color-ink); }

    .speed-head { left: 7cqw; top: 9cqh; width: 56cqw; }
    .speed-head p { margin: 1.2cqh 0 0; font-size: ${TYPE.small}cqw; color: var(--pm-color-muted); }
    .speed-cost { position: absolute; right: 7cqw; top: 10cqh; min-width: 23cqw; padding: 1.5cqw 1.7cqw; border-radius: 1cqw;
      background: var(--pm-color-surface); border: 0.15cqw solid var(--c-line-strong); text-align: right; }
    .speed-cost b { display: block; font-size: ${TYPE.hero}cqw; line-height: 0.95; color: var(--c-accept); }
    .speed-cost span { display: block; margin-top: 0.8cqh; font-size: ${TYPE.tiny}cqw; color: var(--pm-color-muted); }
    .speed-rows { position: absolute; left: 7cqw; top: 39cqh; width: 89cqw; }
    .speed-row { position: relative; height: 18cqh; display: grid; grid-template-columns: 24cqw 57cqw 7cqw; align-items: center; gap: 1.4cqw; }
    .speed-model b { display: block; font-size: ${TYPE.body}cqw; }
    .speed-model span { display: block; margin-top: 0.5cqh; font-size: ${TYPE.tiny}cqw; color: var(--pm-color-muted); }
    .speed-values { position: absolute; bottom: 3.4cqh; transform: translateX(-100%); white-space: nowrap;
      font-size: ${TYPE.small}cqw; font-variant-numeric: tabular-nums; color: var(--pm-color-muted); }
    .speed-values b { margin: 0 0.55cqw; font-weight: 600; }
    .speed-values span:last-child { color: var(--pm-color-ink); font-weight: 800; }
    .speed-delta { text-align: right; font-size: ${TYPE.lead}cqw; color: var(--c-accept); font-variant-numeric: tabular-nums; }
    .speed-delta--down { color: var(--c-noisy); }
    .speed-axis { position: absolute; left: 32.4cqw; top: 76cqh; width: 57cqw; display: flex; justify-content: space-between;
      font-size: ${TYPE.tiny}cqw; color: var(--pm-color-muted); }
    .speed-note { position: absolute; left: 7cqw; top: 78cqh; font-size: ${TYPE.small}cqw; color: var(--pm-color-muted); }
    .speed-note b { color: var(--pm-color-ink); }
  `, `
    ${brand(PAPER.short)}

    <section class="stage stage-pref">
      ${figureHtml('pref-fig', preferenceFig, PREFERENCE, { x: 3, y: 18, w: 52 }, figureMarks)}
      <div class="pfig-src pref-src">论文图 4 · held-out preference accuracy</div>
      <div class="pref-head pref-reveal">
        <div class="eyebrow">${TERMS.heldOutPreferenceAccuracy}</div>
        <h2>留出偏好准确率</h2>
        <p>adversarial draft 在关键行为上高于随机水平。</p>
      </div>
      <div class="pref-list">
        <div class="pref-item pref-reveal">
          <span>${PREFERENCE_LABEL.decision_frame}<em>GLM-5.3 · 对抗方向</em></span><b>${ratio(decisionFrame.adversarial)}</b>
        </div>
        <div class="pref-item pref-reveal">
          <span>${PREFERENCE_LABEL.run_tests}<em>DeepSeek-V4.1-Flash · 对抗方向</em></span><b>${ratio(runTests.adversarial, 2)}</b>
        </div>
        <div class="pref-item neutral pref-reveal">
          <span>${PREFERENCE_LABEL.decision_correctness}<em>${ratio(correctnessForward, 2)} / ${ratio(correctnessAdversarial, 2)} · 中位数</em></span>
          <b>${correctnessApprox}</b>
        </div>
      </div>
      <div class="pref-note pref-reveal"><b>行为可辨，决定是否正确接近随机。</b></div>
    </section>

    <section class="stage stage-bench">
      <div class="bench-copy bench-copy--a bench-title-a">
        <div class="eyebrow">DEEPSWE · ${deepsweGlm.tasks} TASKS</div>
        <h2>DeepSWE：两个模型都提升</h2>
      </div>
      <div class="bench-copy bench-copy--b bench-title-b">
        <div class="eyebrow">NL2REPO-BENCH · ${nl2repoGlm.tasks} TASKS</div>
        <h2>NL2Repo-Bench：两个模型继续提升</h2>
      </div>
      <div class="score-rows">${benchmarkRows.map(benchmarkRowHtml).join('')}</div>
      <div class="score-axis">${[0, 20, 40, 60, 80].map(value => `<span>${value}%</span>`).join('')}</div>
      <div class="bench-source bench-source--a">DeepSWE · ${deepsweGlm.tasks} tasks · GLM 95% CI +${deepsweGlm.ci?.[0]}–+${deepsweGlm.ci?.[1]}</div>
      <div class="bench-source bench-source--b">NL2Repo 104 tasks · DeepSeek 95% CI +${nl2repoDeepSeek.ci?.[0]}–+${nl2repoDeepSeek.ci?.[1]}，p=${nl2repoDeepSeek.p}</div>
      <div class="bench-note"><b>五次独立运行 · 同一 ${TERMS.targetModel}，${TERMS.exactVerification} 不变。</b></div>
    </section>

    <section class="stage stage-speed">
      <div class="speed-head">
        <div class="eyebrow">ACCEPTED TOKENS / VERIFICATION</div>
        <h2>${TERMS.acceptedLength} 基本不变</h2>
        <p>${TERMS.acceptedLength} 衡量每次验证实际提交多少 token。</p>
      </div>
      <div class="speed-cost">
        <b>≤ ${pct(D.speed.paper_approximation)}</b>
        <span>论文概括的 ${TERMS.acceptedLength} 代价</span>
      </div>
      <div class="speed-rows">${speedRows.map(speedRowHtml).join('')}</div>
      <div class="speed-axis">${[0, 1, 2, 3].map(value => `<span>${value}</span>`).join('')}</div>
      <div class="speed-note"><b>实测下降 ${pct(D.speed.drop, 1)}。</b> 精度重分配没有明显拖慢推测解码。</div>
    </section>
  `)

  const one = <T extends Element = HTMLElement>(selector: string) => scene.querySelector<T>(selector)!
  const all = <T extends Element = HTMLElement>(selector: string) => Array.from(scene.querySelectorAll<T>(selector))
  const prefStage = one('.stage-pref')
  const benchStage = one('.stage-bench')
  const speedStage = one('.stage-speed')
  const prefFig = one('.pref-fig')
  const prefReveal = all('.pref-reveal')
  const prefMarks = all('.pref-mark, .pref-random-mark')
  const benchTitleA = one('.bench-title-a')
  const benchTitleB = one('.bench-title-b')
  const scoreRowsEls = all('.score-row')
  const scoreValuesA = all('.score-values--first')
  const scoreValuesB = all('.score-values--second')
  const deltasA = all('.delta--first')
  const deltasB = all('.delta--second')
  const benchSourceA = one('.bench-source--a')
  const benchSourceB = one('.bench-source--b')
  const benchNote = one('.bench-note')
  const speedTitle = one('.speed-head')
  const speedCost = one('.speed-cost')
  const speedRowsEls = all('.speed-row')
  const speedValues = all('.speed-values')
  const speedDeltas = all('.speed-delta')
  const speedNote = one('.speed-note')

  return (ms: number) => {
    const span = (from: number, to: number) => Math.max(0, Math.min(1, (ms - from) / (to - from)))
    const easeOut = (value: number) => 1 - Math.pow(1 - value, 3)
    const easeInOut = (value: number) => value < 0.5 ? 4 * value * value * value : 1 - Math.pow(-2 * value + 2, 3) / 2
    const fade = (element: HTMLElement, opacity: number, rise = 0) => {
      const value = Math.max(0, Math.min(1, opacity))
      element.style.opacity = value.toFixed(3)
      if (rise) element.style.transform = `translateY(${(1 - value) * rise}cqh)`
    }
    const show = (element: HTMLElement, opacity: number) => {
      const value = Math.max(0, Math.min(1, opacity))
      element.style.opacity = value.toFixed(3)
      element.style.visibility = value > 0.001 ? 'visible' : 'hidden'
    }
    const enter = (k: number) => {
      const start = at(k)
      const duration = durations[k] ?? 1
      return easeOut(span(start + duration * 0.04, start + duration * 0.3))
    }
    const leave = (k: number) => {
      const start = at(k)
      const duration = durations[k] ?? 1
      return 1 - easeInOut(span(start, start + duration * 0.14))
    }

    const prefIn = easeOut(span(at(0) + durations[0]! * 0.02, at(0) + durations[0]! * 0.32))
    const prefOut = 1 - easeInOut(span(at(1), at(1) + durations[1]! * 0.14))
    const prefAlpha = prefIn * prefOut
    show(prefStage, prefAlpha)
    fade(prefFig, prefAlpha, 1.2)
    prefReveal.forEach((element, index) => {
      const start = at(0) + durations[0]! * (0.12 + index * 0.07)
      fade(element, easeOut(span(start, start + durations[0]! * 0.2)), 0.8)
    })
    prefMarks.forEach((element, index) => {
      const start = at(0) + durations[0]! * (0.34 + index * 0.06)
      fade(element, easeOut(span(start, start + durations[0]! * 0.12)))
    })

    const benchAlpha = enter(1) * leave(3)
    const switchP = easeInOut(span(at(2), at(2) + durations[2]! * 0.2))
    const revealP = easeOut(span(at(1) + durations[1]! * 0.12, at(1) + durations[1]! * 0.52))
    show(benchStage, benchAlpha)
    fade(benchTitleA, (1 - switchP) * benchAlpha, 0.8)
    fade(benchTitleB, switchP * benchAlpha, 0.8)
    fade(benchSourceA, (1 - switchP) * benchAlpha)
    fade(benchSourceB, switchP * benchAlpha)
    fade(benchNote, benchAlpha * easeOut(span(at(1) + durations[1]! * 0.72, at(1) + durations[1]! * 0.9)))

    scoreRowsEls.forEach((row, index) => {
      const data = benchmarkRows[index]!
      const base = data.first.base * revealP * (1 - switchP) + data.second.base * switchP
      const after = data.first.adversarial * revealP * (1 - switchP) + data.second.adversarial * switchP
      const baseX = scoreX(base)
      const afterX = scoreX(after)
      const gainX = scoreX(after - base)
      const baseBar = row.querySelector<HTMLElement>('.bar-base')!
      const gainBar = row.querySelector<HTMLElement>('.bar-gain')!
      const basePin = row.querySelector<HTMLElement>('.pin-base')!
      const afterPin = row.querySelector<HTMLElement>('.pin-after')!
      baseBar.style.width = baseX
      gainBar.style.left = baseX
      gainBar.style.width = gainX
      basePin.style.left = baseX
      afterPin.style.left = afterX
      scoreValuesA[index]!.style.left = afterX
      scoreValuesB[index]!.style.left = afterX
      fade(scoreValuesA[index]!, (1 - switchP) * benchAlpha)
      fade(scoreValuesB[index]!, switchP * benchAlpha)
      fade(deltasA[index]!, (1 - switchP) * benchAlpha)
      fade(deltasB[index]!, switchP * benchAlpha)
    })

    const speedAlpha = enter(3)
    const speedIn = easeOut(span(at(3) + durations[3]! * 0.12, at(3) + durations[3]! * 0.56))
    show(speedStage, speedAlpha)
    fade(speedTitle, speedAlpha * speedIn, 0.8)
    fade(speedCost, speedAlpha * easeOut(span(at(3) + durations[3]! * 0.46, at(3) + durations[3]! * 0.72)), 0.8)
    speedRowsEls.forEach((row, index) => {
      const speed = speedRows[index]!
      const change = speed.accepted_after - speed.accepted_before
      const before = row.querySelector<HTMLElement>('.speed-before')!
      const after = row.querySelector<HTMLElement>('.speed-after')!
      const loss = row.querySelector<HTMLElement>('.speed-loss')
      const values = row.querySelector<HTMLElement>('.speed-values')!
      before.style.width = speedX(speed.accepted_before * speedIn)
      after.style.width = speedX(speed.accepted_after * speedIn)
      values.style.left = speedX(Math.max(speed.accepted_before, speed.accepted_after))
      if (loss) loss.style.width = speedX(Math.max(0, -change) * speedIn)
      fade(speedValues[index]!, easeOut(span(at(3) + durations[3]! * 0.3, at(3) + durations[3]! * 0.5)))
      fade(speedDeltas[index]!, easeOut(span(at(3) + durations[3]! * 0.48, at(3) + durations[3]! * 0.7)))
    })
    fade(speedNote, easeOut(span(at(3) + durations[3]! * 0.65, at(3) + durations[3]! * 0.88)))
  }
})
