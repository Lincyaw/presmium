import { gsapScene } from '@lincyaw/addon-motion/scene'

// Numbers that count: `textContent` tweens with `snap` (whole epochs) and `modifiers` (loss to two decimals),
// with a bar driven by the same timeline. onUpdate is muted while the deck seeks, so formatting must happen in
// `snap`/`modifiers`, never in a callback.
export default gsapScene(({ root, gsap, at }) => {
  root.innerHTML = `
    <style>
      .ct { position: absolute; inset: 0; display: grid; grid-template-columns: repeat(3, 1fr); align-content: center; gap: 1.5rem; padding: 0 8%; font-family: var(--pm-font-sans); }
      .ct__card { padding: 1.2rem; border-radius: 0.8rem; background: var(--pm-color-surface); border: 1px solid var(--pm-color-line); }
      .ct__label { color: var(--pm-color-muted); font-size: 1rem; }
      .ct__num { font: 600 3rem/1.2 var(--pm-font-mono); color: var(--pm-color-ink); font-variant-numeric: tabular-nums; }
      .ct__bar { height: 0.6rem; border-radius: 0.3rem; background: var(--pm-color-sunk); overflow: hidden; margin-top: 0.6rem; }
      .ct__fill { height: 100%; width: 100%; background: var(--pm-color-accent); transform-origin: 0 50%; transform: scaleX(0); }
    </style>
    <div class="ct">
      <div class="ct__card"><div class="ct__label">epoch</div><div class="ct__num ct__epoch">0</div></div>
      <div class="ct__card"><div class="ct__label">loss</div><div class="ct__num ct__loss">2.30</div></div>
      <div class="ct__card"><div class="ct__label">accuracy %</div><div class="ct__num ct__acc">10</div><div class="ct__bar"><div class="ct__fill"></div></div></div>
    </div>`
  const s = (k: number) => at(k) / 1000
  const twoPlaces = { textContent: (v: string | number) => Number(v).toFixed(2) }
  const tl = gsap.timeline({ defaults: { duration: 1.4, ease: 'power2.out' } })
  // Step 0: the first five epochs: loss falls fast.
  tl.to('.ct__epoch', { textContent: 5, snap: { textContent: 1 }, ease: 'none' }, s(0))
  tl.to('.ct__loss', { textContent: 0.61, modifiers: twoPlaces }, s(0))
  tl.to('.ct__acc', { textContent: 81, snap: { textContent: 1 } }, s(0))
  tl.to('.ct__fill', { scaleX: 0.81 }, s(0))
  // Step 1: five more epochs: the gains get smaller.
  tl.to('.ct__epoch', { textContent: 10, snap: { textContent: 1 }, ease: 'none' }, s(1))
  tl.to('.ct__loss', { textContent: 0.12, modifiers: twoPlaces }, s(1))
  tl.to('.ct__acc', { textContent: 97, snap: { textContent: 1 } }, s(1))
  tl.to('.ct__fill', { scaleX: 0.97 }, s(1))
  return tl
})
