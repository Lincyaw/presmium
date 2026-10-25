import { motionScene } from '@lincyaw/addon-motion/scene'
import type { MotionSequence } from '@lincyaw/addon-motion/scene'

// Bars that take a new dataset, with value labels that count: each column's CSS variable --v (its height) is one
// track across the steps (segments of one value in one sequence join), and each label is a motionValue in the same sequence.
// Pitfall: two function segments writing the same label overwrite each other on seek; one motionValue per label does not.
const NAMES = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月']
const A = [32, 58, 41, 77, 50, 66, 28, 45]
const B = [61, 40, 72, 55, 94, 38, 67, 52]
const MAX = 100

export default motionScene(({ root, motion, at, color }) => {
  root.innerHTML = `<div class="cq">
    <style>
      .cq { container-type: size; width: 100%; height: 100%; }
      .bars { width: 100%; height: 100%; box-sizing: border-box; padding: 5cqh 4cqw 3cqh; display: grid; grid-template-rows: auto 1fr auto; gap: 2cqh; font-family: var(--pm-font-sans); color: var(--pm-color-ink); }
      .bars h3 { margin: 0; font-family: var(--pm-font-sans); font-size: 5cqh; font-weight: 600; }
      .bars h3 span { color: var(--pm-color-muted); font-weight: 400; }
      .bars__plot { display: grid; grid-template-columns: repeat(${A.length}, 1fr); gap: 2.5cqw; align-items: end; border-bottom: 0.4cqh solid var(--pm-color-line-strong); }
      .bars__col { --v: 0; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 1cqh; }
      .bars__value { font-family: var(--pm-font-mono); font-size: 4cqh; color: var(--pm-color-muted); }
      .bars__fill { width: 100%; height: calc(var(--v) * 88%); border-radius: 1cqh 1cqh 0 0; background: ${color('line-strong')}; }
      .bars__names { display: grid; grid-template-columns: repeat(${A.length}, 1fr); gap: 2.5cqw; text-align: center; font-size: 4cqh; color: var(--pm-color-muted); }
    </style>
    <div class="bars">
      <h3>月销量 <span data-year>2024</span></h3>
      <div class="bars__plot">${A.map(() => '<div class="bars__col"><span class="bars__value">0</span><div class="bars__fill"></div></div>').join('')}</div>
      <div class="bars__names">${NAMES.map(n => `<span>${n}</span>`).join('')}</div>
    </div></div>`
  const cols = [...root.querySelectorAll<HTMLElement>('.bars__col')]
  const fills = [...root.querySelectorAll<HTMLElement>('.bars__fill')]
  const labels = [...root.querySelectorAll<HTMLElement>('.bars__value')]
  const year = root.querySelector<HTMLElement>('[data-year]')!
  const s = (k: number) => at(k) / 1000
  const top = B.indexOf(Math.max(...B))

  // One motion value per label: its keyframes join across the steps like any other track.
  const values = labels.map((label) => {
    const value = motion.motionValue(0)
    value.on('change', v => { label.textContent = Math.round(v).toString() })
    return value
  })
  const yearValue = motion.motionValue(0)
  yearValue.on('change', v => { year.textContent = v < 0.5 ? '2024' : '2025' })

  const seq: MotionSequence = [
    // Step 0: the bars grow one after another.
    ...cols.map((col, i): MotionSequence[number] => [col, { '--v': [0, A[i]! / MAX] }, { at: s(0) + i * 0.06, duration: 0.7, ease: 'easeOut' }]),
    ...values.map((value, i): MotionSequence[number] => [value, [0, A[i]!], { at: s(0) + i * 0.06, duration: 0.7, ease: 'easeOut' }]),
    // Step 1: the next year's data: the same tracks move on to new targets.
    ...cols.map((col, i): MotionSequence[number] => [col, { '--v': [A[i]! / MAX, B[i]! / MAX] }, { at: s(1), duration: 0.9, ease: 'easeInOut' }]),
    ...values.map((value, i): MotionSequence[number] => [value, [A[i]!, B[i]!], { at: s(1), duration: 0.9, ease: 'easeInOut' }]),
    [yearValue, [0, 1], { at: s(1), duration: 0.9 }],
    // Step 2: the best month stands out, the others step back.
    [fills[top]!, { backgroundColor: [color('line-strong'), color('accent')] }, { at: s(2), duration: 0.5 }],
    ...fills.filter((_, i) => i !== top).map((fill): MotionSequence[number] => [fill, { opacity: [1, 0.35] }, { at: s(2), duration: 0.5 }]),
  ]
  return motion.animate(seq)
})
