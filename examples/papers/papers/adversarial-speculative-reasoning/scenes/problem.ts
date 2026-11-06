import { gsapScene } from '@lincyaw/addon-motion/scene'
import { brand, clock, frame, LAYER, TYPE } from '../../../kit/frame.ts'
import { FIGURE_CSS, figureHtml } from '../../../kit/figure.ts'
import type { FigureMap } from '../../../kit/figure.ts'
import fig from '../figures/slot-noise.png'
import map from '../figures/slot-noise.json'
import longFig from '../figures/long-range-deviations.png'
import longMap from '../figures/long-range-deviations.json'
import { D, PAPER, PAPER_COLOURS, TERMS, point } from './paper.ts'

const MAP = map as unknown as FigureMap
const LMAP = longMap as unknown as FigureMap
const SLOTS = D.precision.slots
const GLM = D.precision.glm
const LONG = D.precision.long_horizon
const LAST_BIN_END = Number(LONG.bins[LONG.bins.length - 1]?.split(/[–-]/).pop())
const NOISE_GROWTH = GLM.mean[GLM.mean.length - 1]! / GLM.mean[0]! - 1
const FIRST_SHIFT = GLM.shift2[0]!
const LAST_SHIFT = GLM.shift2[GLM.shift2.length - 1]!
const TAIL_ROWS = LONG.bins.slice(1, 3).map((value, index) => ({
  label: value.replace('-', '–'),
  ratio: LONG.ratio_gt4[index + 1]!,
}))
const TAIL_MAX = Math.max(...TAIL_ROWS.map(row => row.ratio), LONG.independent_ratio_gt4)
const TOKENS = ['last', 'Both', 'could', 'work', '.', 'The', 'spec', 'says']

const times = (value: number) => `×${value.toFixed(2)}`
const fill = (value: number) => Math.max(0.08, (value - 1) / (TAIL_MAX - 1)).toFixed(3)

// Four rest frames: a long agent trajectory that keeps rereading its KV cache, the eight-slot
// verification block, slot-wise forward noise, then the long-range tail the noise accumulates into.
export default gsapScene(({ root, gsap, at, durations }) => {
  const { T } = clock(at, durations)
  const slots = SLOTS.map((slot, index) => {
    const shade = index / Math.max(1, SLOTS.length - 1)
    const token = TOKENS[index] ?? '·'
    return `<div class="slot${index === 0 ? ' slot--commit' : ''}" style="--shade:${shade.toFixed(3)}">
      <span class="slot-idx">${slot}</span>
      ${index === 0 ? '<span class="commit">已提交</span>' : ''}
      <span class="token">${token}</span>
    </div>`
  }).join('')
  const cacheTicks = Array.from({ length: SLOTS.length }, (_, index) =>
    `<i style="--i:${index}"></i>`,
  ).join('')

  frame(root, `${FIGURE_CSS}${PAPER_COLOURS}
    .intro { position: absolute; left: 5.5cqw; top: 10.5cqh; display: flex; align-items: baseline; gap: 1.3cqw; }
    .intro span { font-size: ${TYPE.lead}cqw; font-weight: 650; }
    .intro b { font-size: ${TYPE.hero}cqw; line-height: 0.9; }
    .intro em { font-style: normal; font-size: ${TYPE.small}cqw; color: var(--pm-color-muted); }

    .phase { position: absolute; display: flex; align-items: center; gap: 0.65cqw; padding: 0.75cqw 1cqw;
      border-radius: 99cqw; background: var(--pm-color-surface); box-shadow: inset 0 0 0 0.12cqw var(--c-line-strong);
      font-size: ${TYPE.small}cqw; font-weight: 650; white-space: nowrap; }
    .phase i { width: 0.8cqw; height: 0.8cqw; border-radius: 50%; background: var(--c-target); }
    .trace-layer { pointer-events: none; }
    .decisions { position: absolute; left: 68cqw; top: 12.5cqh; width: 27cqw; padding-left: 1.7cqw;
      border-left: 0.2cqw solid var(--c-draft); }
    .decisions > span { display: block; margin-bottom: 1.4cqh; font-size: ${TYPE.small}cqw; font-weight: 700; color: var(--c-draft); }
    .decisions b { display: block; padding: 1.05cqh 0; border-bottom: 0.1cqw solid var(--c-line);
      font-size: ${TYPE.lead}cqw; line-height: 1.2; }
    .kv { position: absolute; left: 13cqw; top: 58cqh; width: 72cqw; }
    .kv-head { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 1cqh; }
    .kv-head b { font-size: ${TYPE.lead}cqw; }
    .kv-head span { font-size: ${TYPE.small}cqw; color: var(--pm-color-muted); }
    .kv-track { position: relative; display: grid; grid-template-columns: repeat(${SLOTS.length}, 1fr); gap: 0.45cqw;
      height: 4.8cqh; padding: 0.75cqh; overflow: hidden; border-radius: 99cqw;
      background: var(--pm-color-sunk); box-shadow: inset 0 0 0 0.12cqw var(--c-line-strong); }
    .kv-progress { position: absolute; inset: 0; transform-origin: 0 50%;
      background: linear-gradient(90deg, var(--c-precise), var(--c-noisy)); opacity: 0.18; }
    .kv-track i { position: relative; z-index: 1; align-self: stretch; border-radius: 0.45cqw;
      background: color-mix(in srgb, var(--c-target) calc(68% - var(--i) * 6%), var(--c-draft)); opacity: 0.76; }
    .block-title { position: absolute; left: 6cqw; top: 10.5cqh; display: flex; align-items: baseline; gap: 1.3cqw; }
    .block-title span { font-size: ${TYPE.small}cqw; font-weight: 700; color: var(--c-draft); }
    .block-title b { font-size: ${TYPE.lead}cqw; }
    .slots { position: absolute; left: 6cqw; top: 19cqh; width: 88cqw; display: grid;
      grid-template-columns: repeat(${SLOTS.length}, 1fr); gap: 0.65cqw; }
    .slot { position: relative; height: 22cqh; border-radius: 0.8cqw; overflow: hidden;
      display: grid; place-items: center; color: var(--pm-color-on-accent);
      background: color-mix(in srgb, var(--c-noisy) calc(var(--shade) * 78%), var(--c-precise)); }
    .slot--commit { box-shadow: inset 0 0 0 0.28cqw var(--pm-color-surface); }
    .slot-idx { position: absolute; left: 0.75cqw; top: 1cqh; font-family: var(--pm-font-mono);
      font-size: ${TYPE.label}cqw; font-weight: 700; opacity: 0.72; }
    .commit { position: absolute; right: 0.7cqw; top: 0.8cqh; font-size: ${TYPE.tiny}cqw; font-weight: 700;
      padding: 0.25cqw 0.55cqw; border-radius: 99cqw; background: var(--c-target-soft); color: var(--c-target); }
    .token { margin-top: 2.2cqh; font-family: var(--pm-font-mono); font-size: ${TYPE.label}cqw; font-weight: 650; }
    .block-io { position: absolute; left: 7cqw; top: 45.5cqh; width: 86cqw; display: flex; justify-content: space-between;
      font-size: ${TYPE.body}cqw; }
    .block-io b { color: var(--pm-color-ink); }
    .slot-scale { position: absolute; left: 11cqw; top: 55cqh; width: 78cqw; display: grid;
      grid-template-columns: auto 1fr auto; align-items: center; gap: 1.2cqw; font-size: ${TYPE.small}cqw; }
    .slot-scale span:first-child { color: var(--c-precise); font-weight: 700; }
    .slot-scale span:last-child { color: var(--c-noisy); font-weight: 700; }
    .slot-scale i { height: 0.18cqw; background: linear-gradient(90deg, var(--c-precise), var(--c-noisy)); }
    .exact { position: absolute; left: 28cqw; top: 63cqh; width: 44cqw; padding: 1.4cqh 1.6cqw; text-align: center;
      border-radius: 99cqw; background: var(--c-target-soft); box-shadow: inset 0 0 0 0.14cqw var(--c-target); }
    .exact span { display: block; font-size: ${TYPE.small}cqw; color: var(--pm-color-muted); }
    .exact b { display: block; margin-top: 0.4cqh; font-size: ${TYPE.lead}cqw; color: var(--pm-color-ink); }

    .noise-fig { left: 2.8cqw; top: 14cqh; }
    .noise-src { left: 3.2cqw; top: 49.5cqh; }
    .noise-read { position: absolute; left: 68.5cqw; top: 14cqh; width: 28cqw; }
    .read-kicker { font-size: ${TYPE.small}cqw; font-weight: 700; color: var(--c-noisy); }
    .noise-read h3, .long-read h3 { margin: 0.8cqh 0 0; font-size: ${TYPE.title}cqw; line-height: 1.08; }
    .slot-ruler { display: grid; grid-template-columns: repeat(${SLOTS.length}, 1fr); gap: 0.25cqw;
      margin-top: 3.5cqh; align-items: end; height: 9cqh; }
    .slot-ruler i { height: calc(18% + var(--v) * 82%); border-radius: 0.25cqw 0.25cqw 0 0;
      background: linear-gradient(180deg, var(--c-noisy), var(--c-precise)); opacity: 0.8; }
    .noise-metric { margin-top: 3.6cqh; padding-top: 2.2cqh; border-top: 0.12cqw solid var(--c-line-strong); }
    .noise-metric > span { display: block; font-size: ${TYPE.small}cqw; color: var(--pm-color-muted); }
    .noise-metric b { display: block; margin-top: 0.8cqh; font-size: ${TYPE.title}cqw; line-height: 1; font-variant-numeric: tabular-nums; }
    .noise-metric.second { margin-top: 2.2cqh; }
    .noise-metric.second b { font-size: ${TYPE.lead}cqw; color: var(--c-noisy); }

    .long-fig { left: 3.5cqw; top: 13cqh; }
    .long-src { left: 3.8cqw; top: 66cqh; }
    .long-read { position: absolute; left: 54cqw; top: 12.5cqh; width: 42cqw; }
    .tail-tag { display: inline-block; margin-top: 2.6cqh; padding: 0.55cqw 1cqw; border-radius: 99cqw;
      color: var(--c-noisy); background: var(--c-draft-soft); font-size: ${TYPE.small}cqw; font-weight: 700; }
    .tail { margin-top: 2.1cqh; }
    .tail-row { display: grid; grid-template-columns: 1fr auto; gap: 0.5cqw 1cqw; padding: 1.6cqh 0;
      border-top: 0.12cqw solid var(--c-line-strong); }
    .tail-row span { font-size: ${TYPE.body}cqw; }
    .tail-row b { font-size: ${TYPE.lead}cqw; font-variant-numeric: tabular-nums; color: var(--c-noisy); }
    .tail-track { grid-column: 1 / -1; height: 0.65cqh; border-radius: 99cqw; background: var(--pm-color-sunk); overflow: hidden; }
    .tail-track i { display: block; width: calc(var(--v) * 100%); height: 100%; border-radius: inherit; background: var(--c-noisy); }
  `, `
    ${brand(PAPER.short)}

    <div class="horizon">
      <div class="intro"><span>长程智能体</span><b>${LAST_BIN_END}</b><em>轮</em></div>
      <svg class="trace-layer layer" ${LAYER}>
        <path class="trail-main" d="M8,39 C25,39 28,26 46,26 C61,26 63,40 78,40 C86,40 92,31 101,31"
          fill="none" stroke="var(--c-line-strong)" stroke-width="0.55"/>
        <circle cx="8" cy="39" r="1.15" fill="var(--c-target)"/>
        <circle cx="46" cy="26" r="1.15" fill="var(--c-target)"/>
        <circle cx="78" cy="40" r="1.15" fill="var(--c-target)"/>
        <circle cx="101" cy="31" r="1.55" fill="var(--c-draft)"/>
      </svg>
      <div class="phase" style="left:5.5cqw;top:41cqh">读仓库</div>
      <div class="phase" style="left:27.5cqw;top:24cqh">跑测试</div>
      <div class="phase" style="left:48cqw;top:42cqh">改代码</div>
      <div class="decisions">
        <span>持续读回</span>
        <b>需求理解</b>
        <b>是否验证</b>
        <b>何时提交</b>
      </div>
      <svg class="readback layer" ${LAYER}>
        <path class="readback-path" d="M136,60 C150,59 149,40 109,40"
          fill="none" stroke="var(--c-draft)" stroke-width="0.55" stroke-dasharray="1.2 0.9"/>
        <path class="readback-head" d="M111.2,38 L108.7,40 L111.2,42" fill="none"
          stroke="var(--c-draft)" stroke-width="0.55"/>
      </svg>
      <div class="kv">
        <div class="kv-head"><b>KV 缓存</b></div>
        <div class="kv-track"><span class="kv-progress"></span>${cacheTicks}</div>
      </div>
    </div>

    <div class="verification">
      <div class="block-title"><span>${TERMS.speculativeDecoding}</span><b>${TERMS.verificationBlock} · ${SLOTS.length} slots</b></div>
      <div class="slots">${slots}</div>
      <div class="block-io"><span><b>${TERMS.draftModel}</b> 提出 ${SLOTS.length - 1} 个 token</span><span><b>${TERMS.targetModel}</b> 一次验证</span></div>
      <div class="slot-scale"><span>slot ${SLOTS[0]} · 最精确</span><i></i><span>slot ${SLOTS[SLOTS.length - 1]} · 最粗糙</span></div>
      <div class="exact"><span>${TERMS.exactVerification}</span><b>${TERMS.outputDistribution} = target distribution</b></div>
    </div>

    ${figureHtml('noise-fig', fig, MAP, { x: 2.8, y: 14, w: 63 })}
    <div class="pfig-src noise-src">论文图 1 · 同一前缀重复前向</div>
    <div class="noise-read">
      <span class="read-kicker">${TERMS.verificationBlock}</span>
      <h3>slot 越后<br>噪声越大</h3>
      <div class="slot-ruler">
        ${GLM.relative.map(value => `<i style="--v:${((value - GLM.relative[0]!) / (GLM.relative[GLM.relative.length - 1]! - GLM.relative[0]!)).toFixed(3)}"></i>`).join('')}
      </div>
      <div class="noise-metric"><span>GLM-5.3 · ${GLM.mean[0]} → ${GLM.mean[GLM.mean.length - 1]} nats</span><b>+${point(NOISE_GROWTH * 100)}</b></div>
      <div class="noise-metric second"><span>GLM-5.3 · 大幅偏移 token</span><b>${point(FIRST_SHIFT)} → ${point(LAST_SHIFT)}</b></div>
    </div>

    ${figureHtml('long-fig', longFig, LMAP, { x: 3.5, y: 13, w: 45 })}
    <div class="pfig-src long-src">论文图 2 · 验证写入后复读 ${LAST_BIN_END} 轮</div>
    <div class="long-read">
      <span class="read-kicker">verify-written context / decode-written context</span>
      <h3>极端偏差<br>事件率比</h3>
      <span class="tail-tag">${LONG.onset_turns} 轮后</span>
      <div class="tail">
        ${TAIL_ROWS.map(row => `<div class="tail-row"><span>${row.label} 轮</span><b>${times(row.ratio)}</b>
          <div class="tail-track"><i style="--v:${fill(row.ratio)}"></i></div></div>`).join('')}
        <div class="tail-row"><span>独立复跑</span><b>${times(LONG.independent_ratio_gt4)}</b>
          <div class="tail-track"><i style="--v:${fill(LONG.independent_ratio_gt4)}"></i></div></div>
      </div>
    </div>
  `)

  const tl = gsap.timeline()
  gsap.set([
    '.intro', '.trace-layer', '.decisions', '.kv', '.readback',
    '.block-title', '.slot', '.block-io', '.slot-scale', '.exact',
    '.noise-fig', '.noise-src', '.noise-read',
    '.long-fig', '.long-src', '.long-read',
  ], { autoAlpha: 0 })
  gsap.set(['.trail-main', '.readback-path', '.readback-head'], { drawSVG: '0%' })

  // 0: one trajectory keeps its decisions in a growing KV cache.
  tl.to('.intro', { autoAlpha: 1, duration: 0.35, ease: 'power2.out' }, T(0, 0.02))
  tl.to('.trace-layer', { autoAlpha: 1, duration: 0.2 }, T(0, 0.04))
  tl.to('.trail-main', { drawSVG: '100%', duration: 0.9, ease: 'power2.inOut' }, T(0, 0.08))
  tl.fromTo('.phase', { autoAlpha: 0, scale: 0.82, transformOrigin: '50% 50%' },
    { autoAlpha: 1, scale: 1, duration: 0.38, ease: 'expo.out', stagger: 0.11, immediateRender: false }, T(0, 0.18))
  tl.to('.kv', { autoAlpha: 1, duration: 0.35, ease: 'power2.out' }, T(0, 0.48))
  tl.fromTo('.kv-progress', { scaleX: 0, transformOrigin: '0 50%' },
    { scaleX: 1, duration: 0.85, ease: 'power2.inOut', immediateRender: false }, T(0, 0.5))
  tl.to('.decisions', { autoAlpha: 1, duration: 0.4, ease: 'power2.out' }, T(0, 0.66))
  tl.to('.readback', { autoAlpha: 1, duration: 0.2 }, T(0, 0.73))
  tl.to('.readback-path', { drawSVG: '100%', duration: 0.55, ease: 'power2.inOut' }, T(0, 0.74))
  tl.to('.readback-head', { drawSVG: '100%', duration: 0.2, ease: 'power2.out' }, T(0, 0.84))

  // 1: the draft tokens become one eight-slot exact-verification block.
  tl.to('.horizon', { autoAlpha: 0, duration: 0.28, ease: 'power2.in' }, T(1))
  tl.to('.block-title', { autoAlpha: 1, duration: 0.35, ease: 'power2.out' }, T(1, 0.04))
  tl.fromTo('.slot', { autoAlpha: 0, y: 10 },
    { autoAlpha: 1, y: 0, duration: 0.42, ease: 'expo.out', stagger: 0.065, immediateRender: false }, T(1, 0.15))
  tl.to('.block-io', { autoAlpha: 1, duration: 0.35, ease: 'power2.out' }, T(1, 0.48))
  tl.to('.slot-scale', { autoAlpha: 1, duration: 0.35, ease: 'power2.out' }, T(1, 0.58))
  tl.fromTo('.exact', { autoAlpha: 0, scale: 0.94, transformOrigin: '50% 50%' },
    { autoAlpha: 1, scale: 1, duration: 0.4, ease: 'back.out(1.4)', immediateRender: false }, T(1, 0.7))

  // 2: the block resolves into the paper's slot-wise noise measurements.
  tl.to('.verification', { autoAlpha: 0, duration: 0.3, ease: 'power2.in' }, T(2))
  tl.fromTo('.noise-fig', { autoAlpha: 0, x: -10 },
    { autoAlpha: 1, x: 0, duration: 0.5, ease: 'expo.out', immediateRender: false }, T(2, 0.03))
  tl.to('.noise-src', { autoAlpha: 1, duration: 0.3 }, T(2, 0.28))
  tl.to('.noise-read', { autoAlpha: 1, duration: 0.4, ease: 'power2.out' }, T(2, 0.34))
  tl.fromTo('.slot-ruler i', { scaleY: 0, transformOrigin: '50% 100%' },
    { scaleY: 1, duration: 0.45, ease: 'expo.out', stagger: 0.045, immediateRender: false }, T(2, 0.42))

  // 3: zoom out from one block to the long-horizon tail.
  tl.to(['.noise-fig', '.noise-src', '.noise-read'], { autoAlpha: 0, duration: 0.32, ease: 'power2.in' }, T(3))
  tl.fromTo('.long-fig', { autoAlpha: 0, x: -10 },
    { autoAlpha: 1, x: 0, duration: 0.52, ease: 'expo.out', immediateRender: false }, T(3, 0.03))
  tl.to('.long-src', { autoAlpha: 1, duration: 0.3 }, T(3, 0.26))
  tl.to('.long-read', { autoAlpha: 1, duration: 0.4, ease: 'power2.out' }, T(3, 0.32))
  tl.fromTo('.tail-track i', { scaleX: 0, transformOrigin: '0 50%' },
    { scaleX: 1, duration: 0.5, ease: 'power2.inOut', stagger: 0.08, immediateRender: false }, T(3, 0.5))

  return tl
})
