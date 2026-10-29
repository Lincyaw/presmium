import { defineScene } from '@lincyaw/addon-motion/scene'
import { DATA, loss, predict, trajectory } from '../../promo/scenes/model.ts'

const states = [
  ['large-start', 2.2, 0], ['large-one', 2.2, 1], ['large-two', 2.2, 2], ['large-three', 2.2, 3],
  ['small-start', .35, 0], ['small-one', .35, 1], ['small-two', .35, 2], ['small-four', .35, 4], ['small-eight', .35, 8],
] as const
const x = (value: number) => 235 + value * 105
const y = (value: number) => 190 - value * 26
const lossX = (w: number) => 536 + (w + 4) * 18
const lossY = (value: number) => 310 - value * 7

// The figure's words follow the page's language (`<html lang>`), so the same lesson reads in Chinese and English.
const WORDS = {
  zh: { label: (alpha: number, iteration: number) => `线性回归第${iteration}次更新，学习率${alpha}`, fit: '预测线 ŷ = wx', loss: '同一个 w，对应同一个损失', key: '黑点：训练数据　紫线：当前预测' },
  en: { label: (alpha: number, iteration: number) => `Linear regression, update ${iteration}, learning rate ${alpha}`, fit: 'Prediction ŷ = wx', loss: 'The loss for the same w', key: 'Dots: training data   Line: current prediction' },
}

export default defineScene(context => {
  const words = WORDS[document.documentElement.lang.startsWith('en') ? 'en' : 'zh']
  const selected = states.find(([id]) => id === context.state) || states[0]
  const [,alpha,iteration] = selected
  const current = trajectory(alpha, iteration).at(-1)!
  const curve = Array.from({length: 101}, (_,i) => { const w=-4+i*.14; return `${i?'L':'M'}${lossX(w)} ${lossY(loss(w))}` }).join(' ')
  context.root.innerHTML = `<svg viewBox="0 0 900 400" role="img" aria-label="${words.label(alpha, iteration)}" xmlns="http://www.w3.org/2000/svg"><style>
    .lr-paper{fill:var(--pm-color-surface)}.lr-label{fill:var(--pm-color-ink);font:var(--pm-text-title) var(--pm-font-sans)}.lr-small{fill:var(--pm-color-muted);font:var(--pm-text-sm) var(--pm-font-mono)}.lr-rule{fill:none;stroke:var(--pm-color-line);stroke-width:var(--pm-size-hairline)}.lr-curve{fill:none;stroke:var(--pm-color-product-accent);stroke-width:var(--pm-size-stroke)}.lr-data{fill:var(--pm-color-ink);stroke:var(--pm-color-surface);stroke-width:var(--pm-size-stroke)}.lr-point{fill:var(--pm-color-product-accent)}
    </style><rect class="lr-paper" width="900" height="400"/>
    <defs><clipPath id="fit-clip"><rect x="50" y="65" width="370" height="255"/></clipPath><clipPath id="loss-clip"><rect x="535" y="65" width="290" height="255"/></clipPath></defs>
    <text class="lr-label" x="48" y="38">${words.fit}</text><text class="lr-label" x="535" y="38">${words.loss}</text>
    <path class="lr-rule" d="M50 190H420M235 65V320M535 310H825M662 65V320"/>
    <g clip-path="url(#fit-clip)"><path data-fit class="lr-curve"/>${DATA.map(point=>`<circle class="lr-data" cx="${x(point.x)}" cy="${y(point.y)}" r="5"/>`).join('')}</g>
    <g clip-path="url(#loss-clip)"><path class="lr-curve" d="${curve}"/><circle data-loss class="lr-point" r="7"/></g>
    <text class="lr-small" x="48" y="354">α = ${alpha}   iteration = ${iteration}</text><text data-values class="lr-small" x="535" y="354"></text>
    <text class="lr-small" x="48" y="382">${words.key}</text><text class="lr-small" x="535" y="382">L(w) = ½(w − 3)²</text>
  </svg>`
  const fit = context.root.querySelector('[data-fit]')!
  const point = context.root.querySelector('[data-loss]')!
  const values = context.root.querySelector('[data-values]')!
  const draw = (w: number) => {
    fit.setAttribute('d',`M${x(-1.7)} ${y(predict(-1.7,w))}L${x(1.7)} ${y(predict(1.7,w))}`)
    point.setAttribute('cx',String(lossX(w))); point.setAttribute('cy',String(lossY(loss(w))))
    values.textContent = `w = ${w.toFixed(3)}   L = ${loss(w).toFixed(4)}`
  }
  // Each selected teaching step reconstructs its values directly from the shared model.
  draw(current.w)
  return { seek() { draw(current.w) }, dispose() { context.root.replaceChildren() } }
})
