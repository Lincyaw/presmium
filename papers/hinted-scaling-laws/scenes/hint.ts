import { gsapScene } from '@lincyaw/addon-motion/scene'
import { axes, path, scale } from '../../kit/chart.ts'
import { brand, clock, escape, frame, LAYER, TYPE } from '../../kit/frame.ts'
import { FIGURE_CSS, figureHtml, view } from '../../kit/figure.ts'
import type { FigureMap } from '../../kit/figure.ts'
import { D, flops, METHOD, PAPER, pct } from './hsl.ts'
import fig1 from '../figures/fig1-methods.json'

// The hint. One GSM8K problem and its reference solution with the final answer removed: H is the share of it given
// in the prompt (three strips, H = 0, 0.4, 0.8). Then the paper's Figure 1 (top): its three ways of hinting, one box
// at a time. Then one small model's 256 problems as a sheet that lights up as H rises, beside the curve it traces.
// Three states: the hint level, the three methods, the sheet.

const FIG1 = new URL('../figures/fig1-methods.png', import.meta.url).href
const MAP = fig1 as unknown as FigureMap
// The three boxes of the figure, as fractions of the crop (read off the word map: each box's title and its edges).
const BOXES = { truncate: { x: 0.003, y: 0.28, w: 0.314, h: 0.69 }, mask: { x: 0.322, y: 0.28, w: 0.314, h: 0.69 }, logit_mix: { x: 0.641, y: 0.28, w: 0.356, h: 0.69 } }
const WHOLE = { x: 0, y: 0, w: 1, h: 1 }

const words = D.problem.solution.replace(/<<[^>]*>>/g, '').replace(new RegExp(`\\$${D.problem.answer}\\b`), () => '［答案已删］').replace(/\n/g, ' ').split(/\s+/).filter(Boolean)
const LEVELS = [0, 0.4, 0.8]
/** The problem in one line (a paraphrase; the solution strips below are the real hint). */
const GIST = '珍妮的鸭子每天下 16 个蛋，吃掉 3 个、烤松饼用 4 个，其余每个卖 2 美元：每天赚多少？<span class="muted">（转述）</span>'

const RUNG = D.delphi.rungs.findIndex(r => Math.abs(r.c - 21) < 1e-6)
const mask = D.delphi.methods.mask
const sheet = D.delphi.sheet.delphi_1e21!.mask!
const sheetLevels = mask.hints.map(h => sheet[String(h)]!)
const accAt = mask.hints.map((_, j) => mask.acc[j]![RUNG] ?? 0)
const HX = scale(0, 1, 92, 148), HY = scale(0, 1, 62, 17)
const PITCH = 1.8

export default gsapScene(({ root, gsap, at, durations, color }) => {
  const { T } = clock(at, durations)
  const surface = (color('surface').match(/[\d.]+/g) ?? ['255', '255', '255']).slice(0, 3).map(Number)
  const rgbOf = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
  /** `hex` over the page's surface at share r, as rgb(): GSAP cannot tween color-mix(). */
  const tint = (hex: string, r: number) => { const c = rgbOf(hex); return `rgb(${surface.map((v, i) => Math.round(v + (c[i]! - v) * r)).join(',')})` }
  const fill = (r: number) => tint(METHOD.mask, r)

  const strip = (h: number, i: number) => {
    const n = Math.round(h * words.length)
    return `<div class="strip strip${i}"><div class="strip__h">H = ${h}${h === 0 ? '<span>只给原题</span>' : ''}</div>
      <div class="toks">${words.map((w, k) => `<span class="tok ${k < n ? 'tok--on' : ''}">${escape(w)}</span>`).join('')}</div></div>`
  }
  const cells = Array.from({ length: 256 }, (_, k) => `<i class="cell" style="left:${(k % 16) * PITCH}cqw;top:${Math.floor(k / 16) * PITCH}cqw"></i>`).join('')

  frame(root, `${FIGURE_CSS}
    .q { position: absolute; left: 8cqw; top: 11cqh; width: 84cqw; }
    .q__k { font-size: ${TYPE.small}cqw; font-weight: 700; color: var(--pm-color-muted); }
    .q__t { margin-top: 0.6cqh; font-size: ${TYPE.small}cqw; line-height: 1.45; color: var(--pm-color-ink); }
    .sol { position: absolute; left: 8cqw; top: 22cqh; font-size: ${TYPE.small}cqw; font-weight: 700; color: var(--pm-color-muted); }
    .strip { position: absolute; left: 8cqw; width: 84cqw; display: flex; gap: 1.6cqw; }
    .strip0 { top: 28cqh; } .strip1 { top: 43cqh; } .strip2 { top: 58cqh; }
    .strip__h { width: 8.5cqw; flex: none; font-size: ${TYPE.body}cqw; font-weight: 700; font-style: italic; white-space: nowrap; }
    .strip__h span { display: block; font-style: normal; font-weight: 500; font-size: ${TYPE.tiny}cqw; color: var(--pm-color-muted); }
    .toks { display: flex; flex-wrap: wrap; gap: 0.45cqw; }
    .tok { font-family: var(--pm-font-mono); font-size: 1.35cqw; padding: 0.25cqw 0.5cqw; border-radius: 0.35cqw; color: var(--pm-color-muted);
      box-shadow: inset 0 0 0 0.1cqw var(--c-line); }
    .tok--on { color: var(--pm-color-ink); background: color-mix(in srgb, ${METHOD.truncate} 22%, var(--pm-color-surface)); box-shadow: none; }
    .kwh { position: absolute; left: 30cqw; top: 21cqh; font-size: ${TYPE.body}cqw; font-weight: 800; white-space: nowrap; }
    .kwh span { font-size: ${TYPE.small}cqw; font-weight: 500; color: var(--pm-color-muted); margin-left: 0.6cqw; }
    .mchip { position: absolute; top: 63cqh; transform: translateX(-50%); text-align: center; white-space: nowrap; }
    .mchip b { display: block; font-size: ${TYPE.lead}cqw; }
    .mchip span { font-size: ${TYPE.small}cqw; color: var(--pm-color-muted); }
    .src1 { right: 4cqw; top: 5cqh; }
    .grid { position: absolute; left: 9cqw; top: 19cqh; width: 28.8cqw; height: 28.8cqw; }
    .cell { position: absolute; width: 1.62cqw; height: 1.62cqw; border-radius: 0.3cqw; box-shadow: inset 0 0 0 0.08cqw var(--c-line); }
    .gl { position: absolute; left: 9cqw; top: 10cqh; line-height: 1.5; font-size: ${TYPE.small}cqw; color: var(--pm-color-muted); white-space: nowrap; }
    .gl b { color: var(--pm-color-ink); }
    .read { position: absolute; left: 62cqw; top: 8.5cqh; white-space: nowrap; font-size: ${TYPE.body}cqw; }
    .read b { font-size: ${TYPE.title}cqw; font-weight: 800; color: ${METHOD.mask}; margin-left: 0.6cqw; }
    .read i { font-weight: 700; margin-right: 0.4cqw; }
  `, `
    ${brand(PAPER.short)}
    <div class="q"><div class="q__k">GSM8K 第 1 题</div><div class="q__t">${GIST}</div></div>
    <div class="sol">参考解答（去掉答案）</div>
    <div class="kwh">提示量 H<span>给出的比例</span></div>
    ${LEVELS.map(strip).join('')}
    ${figureHtml('f1', FIG1, MAP, { x: 4, y: 9, w: 92 }, `<div class="pfig-ring ring" style="left:${BOXES.mask.x * 100}%;top:${BOXES.mask.y * 100}%;width:${BOXES.mask.w * 100}%;height:${BOXES.mask.h * 100}%"></div>`)}
    <div class="mchip m0" style="left:${4 + 92 * 0.16}cqw"><b style="color:${METHOD.truncate}">截断</b><span>前 H 比例的解答</span></div>
    <div class="mchip m1" style="left:${4 + 92 * 0.48}cqw"><b style="color:${METHOD.mask}">遮盖</b><span>按 H 比例随机保留词</span></div>
    <div class="mchip m2" style="left:${4 + 92 * 0.82}cqw"><b style="color:${METHOD.logit_mix}">logit 混合</b><span>按 H 混入教师 logits</span></div>
    <div class="pfig-src src1">论文图 1（上）</div>
    <div class="gl"><b>${flops(21)} FLOPs</b> · 遮盖 · 256 题<br>颜色越深，做对越多</div>
    <div class="grid">${cells}</div>
    <div class="read"><i>H</i>= <span class="rh">0.0</span>　准确率<b class="ra">${pct(accAt[0]!)}</b></div>
    <svg class="layer" ${LAYER}>
      <g class="hchart">${axes({ x: HX, y: HY, xTicks: [0, 0.2, 0.4, 0.6, 0.8, 1].map(v => ({ v, label: String(v) })), yTicks: [0, 0.25, 0.5, 0.75, 1].map(v => ({ v, label: `${v * 100}%` })), xTitle: '提示量 H', grid: true })}
        ${mask.hints.map((h, j) => `<circle class="hp hp${j}" cx="${HX(h)}" cy="${HY(accAt[j]!)}" r="0.9" fill="${METHOD.mask}"/>`).join('')}
      </g>
    </svg>
  `)

  const cellEls = [...root.querySelectorAll<HTMLElement>('.cell')]
  const rh = root.querySelector('.rh')!, ra = root.querySelector('.ra')!
  const rate = (j: number, k: number) => parseInt(sheetLevels[j]![k]!, 16) / 15
  const segs = mask.hints.slice(1).map((h, j) => path([[HX(mask.hints[j]!), HY(accAt[j]!)], [HX(h), HY(accAt[j + 1]!)]]))
  root.querySelector('.hchart')!.insertAdjacentHTML('beforeend', segs.map((d, j) => `<path class="seg seg${j}" d="${d}" fill="none" stroke="${METHOD.mask}" stroke-width="0.55"/>`).join(''))

  const tl = gsap.timeline()
  const s0 = ['.q', '.sol', '.kwh', '.strip']
  const s1 = ['.f1', '.mchip', '.src1', '.ring']
  const s2 = ['.gl', '.grid', '.read', '.hchart']
  gsap.set([...s0, ...s1, ...s2], { autoAlpha: 0 })
  gsap.set('.tok--on', { backgroundColor: tint(METHOD.truncate, 0) })

  // State 0: the problem, its solution, and how much of the solution each hint level gives.
  tl.fromTo('.q', { autoAlpha: 0, y: 10 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: 'expo.out', immediateRender: false }, T(0, 0.02))
  tl.to('.sol', { autoAlpha: 1, duration: 0.35 }, T(0, 0.1))
  tl.fromTo('.strip', { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'expo.out', stagger: 0.12, immediateRender: false }, T(0, 0.14))
  tl.to('.kwh', { autoAlpha: 1, duration: 0.4 }, T(0, 0.3))
  // The given part of the solution fills in, word by word, as the narration names the hint level.
  tl.to('.strip1 .tok--on', { backgroundColor: tint(METHOD.truncate, 0.22), duration: 0.15, stagger: 0.06 }, T(0, 0.55))
  tl.to('.strip2 .tok--on', { backgroundColor: tint(METHOD.truncate, 0.22), duration: 0.15, stagger: 0.04 }, T(0, 0.66))

  // State 1: the paper's Figure 1, framed on truncation first (what the strips just showed), then whole; the ring
  // moves to masking and to logit mixing as the narration names them.
  tl.to(s0, { autoAlpha: 0, duration: 0.3 }, T(1))
  tl.set('.f1 .pfig__cam', view(BOXES.truncate), T(1))
  tl.to('.f1', { autoAlpha: 1, duration: 0.4 }, T(1, 0.01))
  tl.to('.m0', { autoAlpha: 1, duration: 0.35 }, T(1, 0.12))
  tl.to('.f1 .pfig__cam', { ...view(WHOLE, 0), duration: 0.9, ease: 'power3.inOut' }, T(1, 0.3))
  tl.set('.ring', { left: `${BOXES.mask.x * 100}%`, width: `${BOXES.mask.w * 100}%` }, T(1, 0.38))
  tl.fromTo('.ring', { autoAlpha: 0, scale: 1.06 }, { autoAlpha: 1, scale: 1, duration: 0.35, ease: 'expo.out', immediateRender: false }, T(1, 0.38))
  tl.to('.m1', { autoAlpha: 1, duration: 0.35 }, T(1, 0.4))
  tl.to('.ring', { left: `${BOXES.logit_mix.x * 100}%`, width: `${BOXES.logit_mix.w * 100}%`, duration: 0.6, ease: 'power3.inOut' }, T(1, 0.6))
  tl.to('.m2', { autoAlpha: 1, duration: 0.35 }, T(1, 0.64))
  tl.to('.src1', { autoAlpha: 1, duration: 0.3 }, T(1, 0.2))
  tl.to('.ring', { autoAlpha: 0, duration: 0.4 }, T(1, 0.97))

  // State 2: the sheet. H steps from 0 to 1 at an even pace; at each level the problems the model solves light up,
  // the readouts count to the measured accuracy and the curve extends to the new point. Only tweens, no callbacks:
  // a seek renders tweens but suppresses callbacks, and every frame must come from the time alone.
  tl.to(s1, { autoAlpha: 0, duration: 0.3 }, T(2))
  gsap.set(cellEls, { backgroundColor: (k: number) => fill(rate(0, k)) })
  gsap.set('.seg', { drawSVG: '0%' })
  gsap.set('.hp', { autoAlpha: 0 })
  tl.to(['.gl', '.grid', '.read', '.hchart'], { autoAlpha: 1, duration: 0.4, stagger: 0.06 }, T(2, 0.02))
  tl.set('.hp0', { autoAlpha: 1 }, T(2, 0.1))
  const steps = mask.hints.length - 1, t0 = T(2, 0.18), dt = (T(2, 0.9) - t0) / steps
  for (let j = 0; j < steps; j++) {
    const t = t0 + j * dt
    tl.to(cellEls, { backgroundColor: (k: number) => fill(rate(j + 1, k)), duration: dt * 0.8, ease: 'power1.inOut' }, t)
    tl.fromTo(ra, { textContent: accAt[j]! }, { textContent: accAt[j + 1]!, duration: dt * 0.8, ease: 'power1.inOut', immediateRender: false,
      modifiers: { textContent: (v: string) => pct(+v) } }, t)
    tl.fromTo(rh, { textContent: mask.hints[j]! }, { textContent: mask.hints[j + 1]!, duration: dt * 0.8, ease: 'none', immediateRender: false,
      modifiers: { textContent: (v: string) => (+v).toFixed(1) } }, t)
    tl.to(`.seg${j}`, { drawSVG: '100%', duration: dt * 0.8, ease: 'none' }, t)
    tl.set(`.hp${j + 1}`, { autoAlpha: 1 }, t + dt * 0.8)
  }
  tl.set({}, {}, T(3))
  return tl
})
