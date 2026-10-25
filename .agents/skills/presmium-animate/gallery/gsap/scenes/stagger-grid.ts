import { gsapScene } from '@lincyaw/addon-motion/scene'

// Stagger on a grid: `grid: [rows, cols]` with `from: 'center'`, a diagonal wave from a corner, then row by row.
// Seek-safe: every offset is fixed when the timeline is built. Avoid `from: 'random'` (Math.random, differs per load).
// `repeat`/`yoyo` per cell go INSIDE `stagger`; on the tween they repeat the whole wave (twice as long).
const ROWS = 6
const COLS = 10

export default gsapScene(({ root, gsap, at, color }) => {
  root.innerHTML = `
    <style>
      .sg { position: absolute; inset: 9% 14%; display: grid; grid-template-columns: repeat(${COLS}, 1fr); grid-template-rows: repeat(${ROWS}, 1fr); gap: 0.45rem; }
      .sg__c { border-radius: 0.35rem; background: var(--pm-color-line-strong); }
    </style>
    <div class="sg">${'<div class="sg__c"></div>'.repeat(ROWS * COLS)}</div>`
  const s = (k: number) => at(k) / 1000
  const grid: [number, number] = [ROWS, COLS]
  const tl = gsap.timeline()
  // Step 0: the cells appear from the centre outwards.
  tl.from('.sg__c', { scale: 0, opacity: 0, duration: 0.4, ease: 'back.out(2)', stagger: { grid, from: 'center', amount: 0.7 } }, s(0))
  // Step 1: a wave runs from the top-left corner: each cell lights up and fades back.
  tl.to('.sg__c', { backgroundColor: color('accent'), scale: 1.15, duration: 0.25, ease: 'sine.inOut', stagger: { grid, from: 0, amount: 0.9, yoyo: true, repeat: 1 } }, s(1))
  // Step 2: row by row (axis: 'y'), the cells shrink into dots, from the bottom.
  tl.to('.sg__c', { scale: 0.45, borderRadius: '50%', backgroundColor: color('accent'), duration: 0.35, ease: 'power2.inOut', stagger: { grid, from: 'end', axis: 'y', amount: 0.6 } }, s(2))
  return tl
})
