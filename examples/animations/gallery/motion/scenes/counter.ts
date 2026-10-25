import { motionScene } from '@lincyaw/addon-motion/scene'
import type { MotionSequence } from '@lincyaw/addon-motion/scene'

// Counting numbers: each figure is a motionValue animated in the sequence and written to the text on change.
// The epoch counter uses the `steps()` easing so it ticks in whole numbers; the loss uses `circOut` to fall fast then settle.
// Pitfall: format the value in the change handler (toFixed / Math.round); the motion value itself stays continuous.

export default motionScene(({ root, motion, at }) => {
  root.innerHTML = `<div class="cq">
    <style>
      .cq { container-type: size; width: 100%; height: 100%; }
      .kpi { width: 100%; height: 100%; display: grid; grid-template-columns: repeat(3, 1fr); align-items: center; gap: 3cqw; padding: 0 5cqw; box-sizing: border-box; font-family: var(--pm-font-sans); color: var(--pm-color-ink); }
      .kpi__card { border: 0.4cqh solid var(--pm-color-line); border-radius: 2cqh; padding: 9cqh 2cqw; background: var(--pm-color-surface); text-align: center; }
      .kpi__name { font-size: 6cqh; color: var(--pm-color-muted); }
      .kpi__num { font-family: var(--pm-font-mono); font-size: 19cqh; line-height: 1.2; font-variant-numeric: tabular-nums; }
      .kpi__card--loss .kpi__num { color: var(--pm-color-accent); }
      .kpi__unit { font-size: 5cqh; color: var(--pm-color-muted); }
    </style>
    <div class="kpi">
      <div class="kpi__card"><div class="kpi__name">训练轮数</div><div class="kpi__num" data-k="epoch">0</div><div class="kpi__unit">epoch / 50</div></div>
      <div class="kpi__card kpi__card--loss"><div class="kpi__name">损失</div><div class="kpi__num" data-k="loss">2.31</div><div class="kpi__unit">交叉熵</div></div>
      <div class="kpi__card"><div class="kpi__name">准确率</div><div class="kpi__num" data-k="acc">10.0</div><div class="kpi__unit">%</div></div>
    </div></div>`
  const text = (k: string) => root.querySelector<HTMLElement>(`[data-k="${k}"]`)!
  const epoch = motion.motionValue(0)
  const loss = motion.motionValue(2.31)
  const acc = motion.motionValue(10)
  epoch.on('change', v => { text('epoch').textContent = Math.round(v).toString() })
  loss.on('change', v => { text('loss').textContent = v.toFixed(2) })
  acc.on('change', v => { text('acc').textContent = v.toFixed(1) })
  const s = (k: number) => at(k) / 1000

  const seq: MotionSequence = [
    // Step 0: the first ten epochs.
    [epoch, [0, 10], { at: s(0), duration: 1.2, ease: motion.steps(10) }],
    [loss, [2.31, 1.12], { at: s(0), duration: 1.2, ease: 'circOut' }],
    [acc, [10, 63.4], { at: s(0), duration: 1.2, ease: 'easeOut' }],
    // Step 1: forty more epochs; the curve flattens.
    [epoch, [10, 50], { at: s(1), duration: 1.6, ease: motion.steps(40) }],
    [loss, [1.12, 0.42], { at: s(1), duration: 1.6, ease: 'circOut' }],
    [acc, [63.4, 91.3], { at: s(1), duration: 1.6, ease: 'easeOut' }],
  ]
  return motion.animate(seq)
})
