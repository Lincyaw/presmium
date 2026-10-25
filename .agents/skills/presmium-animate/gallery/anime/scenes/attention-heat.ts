import { animeScene } from '@lincyaw/addon-motion/scene'

// A CSS custom property as the tweened value: each cell's background is color-mix(... var(--w) ...) and only --w is animated,
// so the color stays a design token (and follows the dark theme); the text flips to on-accent once --w passes 0.6. Function-based values give each cell its own [from, to].
// The numbers are written by setter objects, one per cell, since onUpdate is muted under seek.
const TOKENS = ['我', '爱', '吃', '苹', '果']
const N = TOKENS.length
// A fixed, row-normalized attention matrix (a tiny seeded PRNG keeps it the same on every load).
const rng = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647) })()
const WEIGHTS = TOKENS.map((_, i) => {
  const row = TOKENS.map((_, j) => (i === j ? 2.2 : 0.3) + rng())
  const sum = row.reduce((a, b) => a + b, 0)
  return row.map(v => v / sum)
})
const MASKED = WEIGHTS.map((row, i) => {
  const kept = row.map((v, j) => (j <= i ? v : 0))
  const sum = kept.reduce((a, b) => a + b, 0)
  return kept.map(v => v / sum)
})

export default animeScene(({ root, anime, at, color }) => {
  const label = `display: grid; place-items: center; color: ${color('muted')}; font-size: 4cqh`
  root.innerHTML = `
    <div style="position: absolute; inset: 0; container-type: size; display: grid; place-items: center; font-family: var(--pm-font-sans)">
      <div style="display: grid; grid-template-columns: repeat(${N + 1}, 12cqh); grid-auto-rows: 12cqh; gap: 1.4cqh">
        <div></div>${TOKENS.map(t => `<div style="${label}">${t}</div>`).join('')}
        ${TOKENS.map((t, i) => `<div style="${label}">${t}</div>${TOKENS.map((_, j) => `
          <div class="cell" data-i="${i}" data-j="${j}" style="--w: 0; border-radius: 1.6cqh; display: grid; place-items: center;
               font: 3.2cqh var(--pm-font-mono);
               color: color-mix(in oklab, var(--pm-color-on-accent) calc(clamp(0, (var(--w) - 0.6) * 1000, 1) * 100%), var(--pm-color-ink));
               background: color-mix(in oklab, var(--pm-color-accent) calc(var(--w) * 100%), var(--pm-color-surface))"></div>`).join('')}`).join('')}
      </div>
    </div>`
  const cells = [...root.querySelectorAll<HTMLElement>('.cell')]
  const at2 = (el: HTMLElement, m: number[][]) => m[+el.dataset.i!][+el.dataset.j!]
  // Each cell shows its weight as text: a setter object per cell writes it (no onUpdate under seek).
  const texts = cells.map(el => {
    let v = 0
    return { get v() { return v }, set v(x: number) { v = x; el.textContent = x > 0.005 ? x.toFixed(2).replace(/^0/, '') : '' } }
  })
  const tl = anime.createTimeline({ autoplay: false, defaults: { ease: 'outQuad' } })
  // Step 0: the weights fill in, row by row (the stagger follows the cells' order).
  tl.add(cells, { '--w': (el: HTMLElement) => [0, at2(el, WEIGHTS) * 1.6], duration: 500, delay: anime.stagger(40) }, at(0))
  cells.forEach((el, k) => tl.add(texts[k], { v: [0, at2(el, WEIGHTS)], duration: 500 }, at(0) + k * 40))
  // Step 1: the causal mask: no token may look ahead, and each row renormalizes.
  tl.add(cells, { '--w': (el: HTMLElement) => at2(el, MASKED) * 1.6, duration: 600 }, at(1))
  cells.forEach((el, k) => tl.add(texts[k], { v: at2(el, MASKED), duration: 600 }, at(1)))
  return tl
})
