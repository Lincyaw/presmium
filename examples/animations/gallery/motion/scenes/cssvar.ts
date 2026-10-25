import { motionScene } from '@lincyaw/addon-motion/scene'
import type { MotionSequence } from '@lincyaw/addon-motion/scene'

// One CSS variable drives a whole layout: `--p` (the training share of a dataset split) sets the widths of both parts,
// the position of the handle and how strong the training color is, all in CSS with calc() and color-mix().
// Motion writes the variable as a unitless number; the CSS decides what it means. The label is a motionValue.
export default motionScene(({ root, motion, at }) => {
  root.innerHTML = `<div class="cq">
    <style>
      .cq { container-type: size; width: 100%; height: 100%; }
      .split { --p: 0.5; width: 100%; height: 100%; display: grid; align-content: center; gap: 5cqh; padding: 0 7cqw; box-sizing: border-box; font-family: var(--pm-font-sans); color: var(--pm-color-ink); }
      .split__bar { position: relative; display: flex; height: 22cqh; border-radius: 2cqh; overflow: hidden; border: 0.4cqh solid var(--pm-color-line-strong); }
      .split__train { width: calc(var(--p) * 100%); display: grid; place-items: center; font-size: 7cqh; white-space: nowrap; overflow: hidden; color: var(--pm-color-on-accent); background: color-mix(in srgb, var(--pm-color-accent) calc(40% + var(--p) * 60%), var(--pm-color-muted)); }
      .split__test { flex: 1; display: grid; place-items: center; font-size: 7cqh; white-space: nowrap; overflow: hidden; background: var(--pm-color-sunk); color: var(--pm-color-ink); }
      .split__handle { position: absolute; top: -2cqh; bottom: -2cqh; left: calc(var(--p) * 100%); width: 1cqh; margin-left: -0.5cqh; background: var(--pm-color-ink); }
      .split__scale { position: relative; height: 8cqh; font-family: var(--pm-font-mono); font-size: 6.5cqh; }
      .split__scale span { position: absolute; left: calc(var(--p) * 100%); transform: translateX(-50%); white-space: nowrap; }
    </style>
    <div class="split">
      <div class="split__bar"><div class="split__train">训练集</div><div class="split__test">测试集</div><div class="split__handle"></div></div>
      <div class="split__scale"><span data-label>50% : 50%</span></div>
    </div></div>`
  const split = root.querySelector<HTMLElement>('.split')!
  const label = root.querySelector<HTMLElement>('[data-label]')!
  const share = motion.motionValue(0.5)
  share.on('change', v => { const p = Math.round(v * 100); label.textContent = `${p}% : ${100 - p}%` })
  const s = (k: number) => at(k) / 1000
  const seq: MotionSequence = [
    [split, { '--p': [0.5, 0.7] }, { at: s(0), duration: 0.9, ease: 'easeInOut' }],
    [share, [0.5, 0.7], { at: s(0), duration: 0.9, ease: 'easeInOut' }],
    [split, { '--p': 0.9 }, { at: s(1), duration: 0.9, ease: 'backOut' }],
    [share, [0.7, 0.9], { at: s(1), duration: 0.9, ease: 'backOut' }],
  ]
  return motion.animate(seq)
})
