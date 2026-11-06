import { gsapScene } from '@lincyaw/addon-motion/scene'
import { axes, path, scale } from '../../../kit/chart.ts'
import { brand, clock, escape, frame, LAYER, TYPE } from '../../../kit/frame.ts'
import { D, PAPER, PAPER_COLOURS, TERMS, point, signed } from './paper.ts'

const DEEP_SWE = D.results.filter(result => result.benchmark === 'DeepSWE')

const deepSweResult = (name: string) => {
  const result = DEEP_SWE.find(row => row.model === name || row.model.startsWith(`${name}-`))
  if (!result) throw new Error(`Missing DeepSWE result for ${name}`)
  return result
}

const CONTROLS = D.controls.preferred.map(preferred => {
  const result = deepSweResult(preferred.model)
  return {
    model: preferred.model,
    preferred: result.base + preferred.delta,
    preferredDelta: preferred.delta,
    unbiased: result.base,
    adversarial: result.adversarial,
    adversarialDelta: result.adversarial - result.base,
  }
})

const RATES = CONTROLS.flatMap(row => [row.preferred, row.unbiased, row.adversarial])
const RATE_LO = Math.floor((Math.min(...RATES) - 1) / 2) * 2
const RATE_HI = Math.ceil((Math.max(...RATES) + 1) / 2) * 2
const RATE_X = scale(0, 2, 36, 132)
const RATE_Y = scale(RATE_LO, RATE_HI, 63, 28)
const RATE_TICKS = [RATE_LO, (RATE_LO + RATE_HI) / 2, RATE_HI]
  .map(value => ({ value, label: value.toFixed(0) }))

const UNRELATED = D.controls.unrelated
const UNRELATED_EXTENT = Math.max(0.5, Math.ceil(Math.abs(UNRELATED.delta) * 10) / 10)
const UNRELATED_X = scale(-UNRELATED_EXTENT, UNRELATED_EXTENT, 62, 146)
const DEEPSEEK = deepSweResult('DeepSeek-V4.1-Flash')

const SLOTS = D.precision.slots
const SLOT_ZERO = SLOTS[0]!
const KEY_SLOT = SLOTS[5]!

const slotStrip = (key: number) => SLOTS.map(slot => `
  <i class="slot ${slot === key ? 'slot-key' : ''}" data-slot="${slot}">${slot}</i>
`).join('')

// Three controls on one argument: direction matters, unrelated preferences do not, and the gain
// comes from moving a rejected decision back to slot 0 rather than from draft training in general.
export default gsapScene(({ root, gsap, at, durations }) => {
  const { T } = clock(at, durations)

  frame(root, `${PAPER_COLOURS}
    .scene { position: absolute; inset: 0; }
    .title { position: absolute; left: 8cqw; top: 8cqh; font-size: ${TYPE.title}cqw; font-weight: 800; line-height: 1.08; white-space: nowrap; }
    .sub { position: absolute; left: 8cqw; top: 15.4cqh; font-size: ${TYPE.small}cqw; color: var(--pm-color-muted); white-space: nowrap; }
    .legend { position: absolute; left: 8cqw; top: 21.4cqh; display: flex; align-items: center; gap: 2.2cqw; font-size: ${TYPE.small}cqw; white-space: nowrap; }
    .legend span { display: inline-flex; align-items: center; gap: 0.55cqw; }
    .legend i { display: inline-block; flex: none; width: 1.1cqw; height: 1.1cqw; border-radius: 50%; }
    .model-key { position: absolute; right: 8cqw; top: 21.4cqh; display: flex; align-items: center; gap: 2cqw; font-size: ${TYPE.small}cqw; font-weight: 650; color: var(--pm-color-muted); }
    .model-key span { display: inline-flex; align-items: center; gap: 0.7cqw; }
    .model-key i { display: inline-block; width: 3.4cqw; height: 0; border-top: 0.22cqw solid var(--pm-color-ink); }
    .model-key span:last-child i { border-top-style: dashed; }
    .rate-line { fill: none; stroke: var(--pm-color-ink); stroke-width: 0.48; stroke-linecap: round; stroke-linejoin: round; }
    .rate-line.model-1 { stroke-dasharray: 1.6 0.9; }
    .rate-point { stroke: var(--pm-color-surface); stroke-width: 0.3; }
    .rate-point.preferred { fill: var(--c-reject); }
    .rate-point.unbiased { fill: var(--c-baseline); }
    .rate-point.adversarial { fill: var(--c-accept); }
    .rate-value { fill: var(--pm-color-ink); font-weight: 700; font-variant-numeric: tabular-nums; }
    .rate-delta { font-weight: 650; font-variant-numeric: tabular-nums; }
    .rate-delta.preferred { fill: var(--c-reject); }
    .rate-delta.adversarial { fill: var(--c-accept); }
    .run-count { position: absolute; left: 8cqw; top: 27cqh; font-size: ${TYPE.hero}cqw; font-weight: 800; line-height: 0.95; font-variant-numeric: tabular-nums; }
    .run-count span { display: block; margin-top: 1.2cqh; font-size: ${TYPE.body}cqw; font-weight: 650; color: var(--pm-color-muted); white-space: nowrap; }
    .run-grid { position: absolute; left: 8cqw; top: 48cqh; width: 25cqw; display: grid; grid-template-columns: repeat(9, 1fr); gap: 0.65cqw; }
    .run-dot { aspect-ratio: 1; border-radius: 50%; background: var(--c-baseline); opacity: 0.72; }
    .run-caption { position: absolute; left: 8cqw; top: 64cqh; width: 27cqw; font-size: ${TYPE.small}cqw; color: var(--pm-color-muted); line-height: 1.45; }
    .unrelated-head { position: absolute; left: 43cqw; top: 27cqh; font-size: ${TYPE.lead}cqw; font-weight: 750; white-space: nowrap; }
    .unrelated-head span { display: block; margin-top: 0.5cqh; font-size: ${TYPE.small}cqw; font-weight: 500; color: var(--pm-color-muted); }
    .unrelated-axis { stroke: var(--c-line-strong); stroke-width: 0.3; }
    .unrelated-tick { stroke: var(--c-line); stroke-width: 0.18; }
    .unrelated-zero { stroke: var(--c-line-strong); stroke-width: 0.2; stroke-dasharray: 0.7 0.7; }
    .unrelated-tick-label { fill: var(--pm-color-muted); font-variant-numeric: tabular-nums; }
    .unrelated-point { stroke: var(--pm-color-surface); stroke-width: 0.4; }
    .unrelated-point.base { fill: var(--c-baseline); }
    .unrelated-point.pooled { fill: var(--c-target); }
    .unrelated-label { fill: var(--pm-color-ink); font-weight: 750; font-variant-numeric: tabular-nums; }
    .unrelated-sublabel { fill: var(--pm-color-muted); }
    .unrelated-bracket { stroke: var(--c-target); stroke-width: 0.28; }
    .unrelated-delta { fill: var(--c-target); font-weight: 700; }
    .significance { position: absolute; left: 48cqw; top: 70cqh; font-size: ${TYPE.body}cqw; font-weight: 700; white-space: nowrap; }
    .chain { position: absolute; left: 7cqw; top: 23cqh; width: 86cqw; display: grid; grid-template-columns: 1fr 5cqw 1fr 5cqw 1fr; align-items: stretch; }
    .node { position: relative; min-height: 20cqh; padding: 1.5cqh 1.3cqw 0; border-top: 0.16cqw solid var(--c-line-strong); }
    .node-key { border-top-color: var(--c-target); }
    .node-reject { border-top-color: var(--c-reject); }
    .node-slot { border-top-color: var(--c-accept); }
    .node-k { font-size: ${TYPE.tiny}cqw; color: var(--pm-color-muted); font-weight: 700; letter-spacing: 0; }
    .node h3 { margin: 0.8cqh 0 0; font-size: ${TYPE.lead}cqw; line-height: 1.15; }
    .node p { margin: 0.65cqh 0 0; font-size: ${TYPE.small}cqw; color: var(--pm-color-muted); line-height: 1.35; }
    .flow { display: grid; place-items: center; font-size: 3.2cqw; color: var(--pm-color-muted); font-weight: 500; }
    .slot-mini { display: flex; gap: 0.22cqw; margin-top: 1.5cqh; }
    .slot { display: grid; flex: 1; place-items: center; min-width: 0; height: 2.3cqh; border: 0.1cqw solid var(--c-line-strong); border-radius: 0.28cqw;
      background: var(--pm-color-surface); color: var(--pm-color-muted); font-size: ${TYPE.tiny}cqw; font-style: normal; font-variant-numeric: tabular-nums; }
    .slot-key { border-color: var(--c-target); color: var(--pm-color-ink); background: var(--pm-color-category-1-soft); font-weight: 750; }
    .zero .slot-key { border-color: var(--c-accept); background: var(--pm-color-ok-soft); }
    .reject-mark { position: relative; width: 5.6cqw; height: 5.6cqw; margin: 4.4cqh auto 0; border-radius: 50%; background: var(--pm-color-danger-soft);
      box-shadow: inset 0 0 0 0.18cqw var(--c-reject); }
    .reject-mark i { position: absolute; left: 50%; top: 50%; width: 2.8cqw; height: 0.32cqw; border-radius: 99cqw; background: var(--c-reject); transform-origin: center; }
    .reject-mark i:first-child { transform: translate(-50%, -50%) rotate(45deg); }
    .reject-mark i:last-child { transform: translate(-50%, -50%) rotate(-45deg); }
    .slot-zero { display: inline-flex; align-items: center; gap: 0.8cqw; margin-top: 2.1cqh; padding: 0.65cqw 1.15cqw; border-radius: 0.45cqw;
      background: var(--pm-color-ok-soft); color: var(--c-accept); font-size: ${TYPE.lead}cqw; font-weight: 800; font-variant-numeric: tabular-nums; }
    .compare { position: absolute; left: 8cqw; top: 52cqh; width: 84cqw; display: grid; gap: 1.2cqh; }
    .path-row { display: grid; grid-template-columns: 17cqw 1fr; align-items: center; gap: 2cqw; min-height: 8.5cqh; }
    .path-label b { display: block; font-size: ${TYPE.body}cqw; }
    .path-label span { display: block; margin-top: 0.35cqh; font-size: ${TYPE.small}cqw; color: var(--pm-color-muted); white-space: nowrap; }
    .slot-long { display: flex; gap: 0.45cqw; }
    .slot-long .slot { height: 3.2cqh; font-size: ${TYPE.small}cqw; }
    .path-row.accept .path-label b { color: var(--c-baseline); }
    .path-row.reject .path-label b { color: var(--c-accept); }
    .insight { position: absolute; left: 8cqw; top: 73.2cqh; width: 84cqw; padding-top: 1.2cqh; border-top: 0.12cqw solid var(--c-line);
      font-size: ${TYPE.body}cqw; font-weight: 650; }
    .insight span { color: var(--c-accept); }
  `, `
    ${brand(PAPER.short)}

    <div class="scene scene-0">
      <div class="title">方向反了，收益也反了</div>
      <div class="sub">DeepSWE 通过率 · 同一批 ${TERMS.preferencePair}，只翻转方向</div>
      <div class="legend">
        <span><i style="background:var(--c-reject)"></i>preferred direction</span>
        <span><i style="background:var(--c-baseline)"></i>unbiased draft</span>
        <span><i style="background:var(--c-accept)"></i>adversarial direction</span>
      </div>
      <div class="model-key">
        <span><i></i>${escape(CONTROLS[0]!.model)}</span>
        <span><i></i>${escape(CONTROLS[1]!.model)}</span>
      </div>
      <svg class="layer" ${LAYER}>
        <g class="rate-axes">${axes({
          x: RATE_X,
          y: RATE_Y,
          xTicks: [
            { v: 0, label: 'preferred direction（对照）' },
            { v: 1, label: 'unbiased draft' },
            { v: 2, label: 'adversarial direction（采用）' },
          ],
          yTicks: RATE_TICKS.map(tick => ({ v: tick.value, label: `${tick.label}%` })),
          grid: true,
        })}</g>
        ${CONTROLS.map((row, model) => {
          const d = path([
            [RATE_X(0), RATE_Y(row.preferred)],
            [RATE_X(1), RATE_Y(row.unbiased)],
            [RATE_X(2), RATE_Y(row.adversarial)],
          ])
          return `<g class="rate-series series-${model}">
            <path class="rate-line model-${model}" d="${d}"/>
            <circle class="rate-point preferred" cx="${RATE_X(0)}" cy="${RATE_Y(row.preferred)}" r="1.05"/>
            <circle class="rate-point unbiased" cx="${RATE_X(1)}" cy="${RATE_Y(row.unbiased)}" r="1.05"/>
            <circle class="rate-point adversarial" cx="${RATE_X(2)}" cy="${RATE_Y(row.adversarial)}" r="1.05"/>
            <text class="rate-value" font-size="1.9" x="${RATE_X(0) - 2}" y="${RATE_Y(row.preferred) - 0.4}" text-anchor="end">${point(row.preferred)}</text>
            <text class="rate-delta preferred" font-size="1.55" x="${RATE_X(0) - 2}" y="${RATE_Y(row.preferred) + 2.1}" text-anchor="end">${signed(row.preferredDelta)}</text>
            <text class="rate-value" font-size="1.9" x="${RATE_X(1) + 2}" y="${RATE_Y(row.unbiased) - 0.4}">${point(row.unbiased)}</text>
            <text class="rate-value" font-size="1.9" x="${RATE_X(2) + 2}" y="${RATE_Y(row.adversarial) - 0.4}">${point(row.adversarial)}</text>
            <text class="rate-delta adversarial" font-size="1.55" x="${RATE_X(2) + 2}" y="${RATE_Y(row.adversarial) + 2.1}">${signed(row.adversarialDelta)}</text>
          </g>`
        }).join('')}
      </svg>
    </div>

    <div class="scene scene-1">
      <div class="title">无关偏好，几乎没有变化</div>
      <div class="sub">DeepSWE · ${escape(DEEPSEEK.model)}</div>
      <div class="run-count">${UNRELATED.runs}<span>次无关偏好运行</span></div>
      <div class="run-grid">${Array.from({ length: UNRELATED.runs }, (_, run) => `<i class="run-dot" data-run="${run}"></i>`).join('')}</div>
      <div class="run-caption">只改变与 adversarial side 无关的偏好，例如 thinking length 或 decision correctness。</div>
      <div class="unrelated-head">${UNRELATED.runs} 次运行，合并为一个结果</div>
      <svg class="layer" ${LAYER}>
        <g class="unrelated-plot">
          <line class="unrelated-axis" x1="${UNRELATED_X(-UNRELATED_EXTENT)}" y1="48" x2="${UNRELATED_X(UNRELATED_EXTENT)}" y2="48"/>
          ${[-UNRELATED_EXTENT, 0, UNRELATED_EXTENT].map(value => `<g>
            <line class="unrelated-tick" x1="${UNRELATED_X(value)}" y1="45.8" x2="${UNRELATED_X(value)}" y2="50.2"/>
            <text class="unrelated-tick-label" font-size="1.8" x="${UNRELATED_X(value)}" y="54" text-anchor="middle">${value === 0 ? '0' : signed(value, 1)}</text>
          </g>`).join('')}
          <line class="unrelated-zero" x1="${UNRELATED_X(0)}" y1="34" x2="${UNRELATED_X(0)}" y2="48"/>
          <line class="unrelated-bracket" x1="${UNRELATED_X(UNRELATED.delta)}" y1="40.3" x2="${UNRELATED_X(0)}" y2="40.3"/>
          <text class="unrelated-delta" font-size="1.85" x="${(UNRELATED_X(UNRELATED.delta) + UNRELATED_X(0)) / 2}" y="38.8" text-anchor="middle">${signed(UNRELATED.delta)}</text>
          <circle class="unrelated-point pooled" cx="${UNRELATED_X(UNRELATED.delta)}" cy="48" r="1.45"/>
          <circle class="unrelated-point base" cx="${UNRELATED_X(0)}" cy="48" r="1.45"/>
          <text class="unrelated-label" font-size="2.15" x="${UNRELATED_X(UNRELATED.delta)}" y="31" text-anchor="middle">${point(UNRELATED.pooled)}</text>
          <text class="unrelated-sublabel" font-size="1.7" x="${UNRELATED_X(UNRELATED.delta)}" y="33.5" text-anchor="middle">${UNRELATED.runs} 次合并</text>
          <text class="unrelated-label" font-size="2.15" x="${UNRELATED_X(0)}" y="31" text-anchor="middle">${point(UNRELATED.base)}</text>
          <text class="unrelated-sublabel" font-size="1.7" x="${UNRELATED_X(0)}" y="33.5" text-anchor="middle">无偏</text>
          <text class="xtitle" x="${(UNRELATED_X(-UNRELATED_EXTENT) + UNRELATED_X(UNRELATED_EXTENT)) / 2}" y="59.2"
            font-size="2.6" text-anchor="middle" fill="var(--pm-color-muted)">相对无偏（百分点）</text>
        </g>
      </svg>
      <div class="significance">Welch p = ${UNRELATED.p} · ${UNRELATED.runs} 次运行</div>
    </div>

    <div class="scene scene-2">
      <div class="title">收益来自关键决策的位置</div>
      <div class="sub">${TERMS.targetModel} 冻结 · ${TERMS.draftModel} 只负责提出一个应被拒绝的判断</div>
      <div class="chain">
        <div class="node node-key">
          <div class="node-k">decision point</div>
          <h3>进入 ${TERMS.verificationBlock}</h3>
          <p>重要判断原本可能落在低精度 ${TERMS.verificationSlot}</p>
          <div class="slot-mini">${slotStrip(KEY_SLOT)}</div>
        </div>
        <div class="flow">→</div>
        <div class="node node-reject">
          <div class="node-k">草稿提案</div>
          <h3>${TERMS.targetModel} 拒绝</h3>
          <div class="reject-mark" aria-hidden="true"><i></i><i></i></div>
        </div>
        <div class="flow">→</div>
        <div class="node node-slot">
          <div class="node-k">重新写入</div>
          <h3>关键决策首 token 落到 slot ${SLOT_ZERO}</h3>
          <p>拒绝开启新的 ${TERMS.verificationBlock}</p>
          <div class="slot-zero">slot ${SLOT_ZERO}</div>
        </div>
      </div>
      <div class="compare">
        <div class="path-row accept">
          <div class="path-label"><b>接受草稿</b><span>决策停在旧 ${TERMS.verificationBlock}</span></div>
          <div class="slot-long">${slotStrip(KEY_SLOT)}</div>
        </div>
        <div class="path-row reject">
          <div class="path-label"><b>拒绝草稿</b><span>从新的 ${TERMS.verificationBlock} 头部重写</span></div>
          <div class="slot-long zero">${slotStrip(SLOT_ZERO)}</div>
        </div>
      </div>
      <div class="insight">收益不在“训练过草稿”，而在拒绝把关键决策首 token 写回<span>slot ${SLOT_ZERO}</span>。</div>
    </div>
  `)

  const tl = gsap.timeline()
  gsap.set('.scene-1, .scene-2', { autoAlpha: 0 })
  gsap.set(['.rate-axes', '.rate-point', '.rate-value', '.rate-delta'], { autoAlpha: 0 })
  gsap.set('.rate-line', { drawSVG: '0%' })
  gsap.set(['.run-count', '.run-grid', '.run-caption', '.unrelated-head', '.unrelated-plot', '.significance'], { autoAlpha: 0 })
  gsap.set('.run-dot', { autoAlpha: 0 })
  gsap.set(['.chain', '.node', '.flow', '.compare', '.path-row', '.insight'], { autoAlpha: 0 })
  gsap.set(['.slot-mini', '.reject-mark', '.slot-zero'], { autoAlpha: 0 })

  // 0. Two models, one shared baseline: preferring the correct side moves down; the adversarial
  // direction moves up.
  tl.fromTo('.scene-0 .title', { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'expo.out', immediateRender: false }, T(0, 0.02))
  tl.fromTo('.scene-0 .sub', { autoAlpha: 0, y: 7 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'expo.out', immediateRender: false }, T(0, 0.08))
  tl.to(['.legend', '.model-key'], { autoAlpha: 1, duration: 0.4, stagger: 0.08 }, T(0, 0.12))
  tl.to('.rate-axes', { autoAlpha: 1, duration: 0.45 }, T(0, 0.18))
  tl.to('.rate-line', { drawSVG: '100%', duration: 0.75, ease: 'power3.inOut', stagger: 0.16 }, T(0, 0.25))
  tl.to('.rate-point', { autoAlpha: 1, duration: 0.28, stagger: 0.06 }, T(0, 0.3))
  tl.to(['.rate-value', '.rate-delta'], { autoAlpha: 1, duration: 0.3, stagger: 0.035 }, T(0, 0.5))

  // 1. The unrelated-preference tally and its pooled point sit almost on the unbiased baseline.
  tl.to('.scene-0', { autoAlpha: 0, duration: 0.3 }, T(1))
  tl.to('.scene-1', { autoAlpha: 1, duration: 0.3 }, T(1))
  tl.fromTo('.scene-1 .title', { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'expo.out', immediateRender: false }, T(1, 0.03))
  tl.fromTo('.scene-1 .sub', { autoAlpha: 0, y: 7 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'expo.out', immediateRender: false }, T(1, 0.08))
  tl.fromTo('.run-count', { autoAlpha: 0, x: -8 }, { autoAlpha: 1, x: 0, duration: 0.5, ease: 'expo.out', immediateRender: false }, T(1, 0.13))
  tl.to('.run-grid', { autoAlpha: 1, duration: 0.01 }, T(1, 0.18))
  tl.to('.run-dot', { autoAlpha: 1, duration: 0.18, stagger: { amount: 0.52 } }, T(1, 0.18))
  tl.to('.run-caption', { autoAlpha: 1, duration: 0.4 }, T(1, 0.34))
  tl.to('.unrelated-head', { autoAlpha: 1, duration: 0.4 }, T(1, 0.28))
  tl.to('.unrelated-plot', { autoAlpha: 1, duration: 0.4 }, T(1, 0.4))
  tl.to('.significance', { autoAlpha: 1, duration: 0.4 }, T(1, 0.64))

  // 2. The mechanism: decision, rejection, new block at slot 0. The comparison below keeps both
  // accepted and rejected encodings visible at the rest frame.
  tl.to('.scene-1', { autoAlpha: 0, duration: 0.3 }, T(2))
  tl.to('.scene-2', { autoAlpha: 1, duration: 0.3 }, T(2))
  tl.fromTo('.scene-2 .title', { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'expo.out', immediateRender: false }, T(2, 0.03))
  tl.fromTo('.scene-2 .sub', { autoAlpha: 0, y: 7 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'expo.out', immediateRender: false }, T(2, 0.08))
  tl.to('.chain', { autoAlpha: 1, duration: 0.01 }, T(2, 0.12))
  tl.fromTo('.node', { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.42, ease: 'expo.out', stagger: 0.12, immediateRender: false }, T(2, 0.14))
  tl.to('.slot-mini', { autoAlpha: 1, duration: 0.4 }, T(2, 0.24))
  tl.to('.reject-mark', { autoAlpha: 1, duration: 0.35 }, T(2, 0.36))
  tl.to('.slot-zero', { autoAlpha: 1, duration: 0.4 }, T(2, 0.5))
  tl.to('.flow', { autoAlpha: 1, duration: 0.3, stagger: 0.18 }, T(2, 0.3))
  tl.to('.compare', { autoAlpha: 1, duration: 0.01 }, T(2, 0.56))
  tl.fromTo('.path-row', { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'expo.out', stagger: 0.12, immediateRender: false }, T(2, 0.58))
  tl.fromTo('.insight', { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'expo.out', immediateRender: false }, T(2, 0.78))
  tl.set({}, {}, T(3))
  return tl
})
