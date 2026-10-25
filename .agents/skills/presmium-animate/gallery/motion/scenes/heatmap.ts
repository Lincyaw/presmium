import { motionScene } from '@lincyaw/addon-motion/scene'
import type { MotionSequence } from '@lincyaw/addon-motion/scene'

// `interpolate()` as a color scale: one motionValue `t` runs through the steps (0 → 1 → 2) and on each change every
// cell's weight is mixed between three attention patterns and mapped through interpolate([0, 0.5, 1], [c0, c1, c2]).
// The cells are written in the change handler, so the look depends only on `t`, which is one track. A motion value
// fires `change` only when it changes: paint the first look yourself.
const N = 8
const WORDS = ['我', '今天', '在', '图书馆', '读', '了', '一本', '书']

function softmaxRows(score: (i: number, j: number) => number) {
  return Array.from({ length: N }, (_, i) => {
    const e = Array.from({ length: N }, (_, j) => Math.exp(score(i, j)))
    const z = e.reduce((a, b) => a + b, 0)
    return e.map(v => v / z)
  })
}

export default motionScene(({ root, motion, at, color }) => {
  const uniform = Array.from({ length: N }, () => Array<number>(N).fill(1 / N))
  const local = softmaxRows((i, j) => -Math.abs(i - j) * 1.4 + (i === j ? 0.5 : 0))
  const causal = softmaxRows((i, j) => (j > i ? -Infinity : -Math.abs(i - j) * 0.8 + (j === 3 ? 1.2 : 0)))
  const patterns = [uniform, local, causal]
  const scale = motion.interpolate([0, 0.35, 1], [color('surface'), color('accent-soft'), color('accent')])
  root.innerHTML = `<div class="cq">
    <style>
      .cq { container-type: size; width: 100%; height: 100%; }
      .heat { width: 100%; height: 100%; display: grid; grid-template-columns: auto auto; justify-content: center; align-items: center; gap: 4cqw; font-family: var(--pm-font-sans); color: var(--pm-color-ink); }
      .heat__grid { display: grid; grid-template-columns: auto repeat(${N}, 9.4cqh); grid-template-rows: auto repeat(${N}, 9.4cqh); gap: 0.5cqh; font-size: 3.6cqh; }
      .heat__grid span { display: grid; place-items: center; color: var(--pm-color-muted); }
      .heat__grid .heat__col { writing-mode: vertical-rl; padding-bottom: 1cqh; }
      .heat__grid .heat__row { justify-content: end; padding-right: 1cqw; }
      .heat__grid i { border-radius: 0.8cqh; }
      .heat__title { font-size: 6cqh; max-width: 26cqw; line-height: 1.5; }
    </style>
    <div class="heat">
      <div class="heat__grid"><span></span>${WORDS.map(w => `<span class="heat__col">${w}</span>`).join('')}${WORDS.map(w => `<span class="heat__row">${w}</span>${'<i></i>'.repeat(N)}`).join('')}</div>
      <div class="heat__title" data-title>均匀的注意力</div>
    </div></div>`
  const cells = [...root.querySelectorAll<HTMLElement>('.heat__grid i')]
  const title = root.querySelector<HTMLElement>('[data-title]')!
  const titles = ['均匀的注意力', '局部注意力：看邻近的词', '因果遮罩：只看前面的词']
  const t = motion.motionValue(0)
  const paint = (v: number) => {
    const k = Math.min(1, Math.floor(v))
    const f = v - k
    cells.forEach((cell, n) => {
      const i = Math.floor(n / N)
      const j = n % N
      const w = motion.mix(patterns[k]![i]![j]!, patterns[k + 1]![i]![j]!)(f)
      cell.style.background = scale(Math.min(1, w * 2.2))
    })
    title.textContent = titles[Math.round(v)]!
  }
  // A motion value calls its handlers only when it changes, so the first look is painted here.
  paint(0)
  t.on('change', paint)
  const s = (k: number) => at(k) / 1000
  const seq: MotionSequence = [
    // Step 0: the rows come in one by one.
    [cells, { opacity: [0, 1] }, { at: s(0), duration: 0.3, delay: (i: number) => Math.floor(i / N) * 0.1 }],
    [t, [0, 0], { at: 0, duration: 0.01 }],
    [t, [0, 1], { at: s(1), duration: 1.2, ease: 'easeInOut' }],
    [t, [1, 2], { at: s(2), duration: 1.2, ease: 'easeInOut' }],
  ]
  return motion.animate(seq)
})
