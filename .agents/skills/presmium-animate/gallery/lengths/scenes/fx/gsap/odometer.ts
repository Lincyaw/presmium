import { gsapScene } from '@lincyaw/addon-motion/scene'
import { atoms } from '../../kit/atoms.ts'
import { frame } from '../../kit/frame.ts'
import { blurFilter } from '../../kit/fx/defs.ts'
import { uid } from '../../kit/fx/ids.ts'

// Odometer, with GSAP: a number rolls into place like the wheels of a meter. State `roll` (1 s). 0–0.88 s: every
// digit is a wheel, a column of 0…9 behind a window one digit tall; the lowest digit turns three times, the next
// two, the rest once, starting 40 ms apart from the right, so the size of the change is felt and the wheels read
// as a machine. The roll is fastest at the start and slows like power3.out, so the smear peaks early: the window
// blurs along the motion only (an SVG blur in y) and the column stretches, then both fall with the speed. Each
// wheel passes its digit by a tenth of a row and settles back onto it with zero speed (its own ease, so every
// wheel overshoots by the same tenth however far it turned), a click into place. 0.55–0.85 s: the unit fades in.
// 0.88–1 s: rest, with the filters removed, so the digits are sharp. Only transforms and a blur move; no text is
// written, nothing is random. Plex Mono ships 400 and 500 only; separators (the decimal point) stay still.
const TURNS = [3, 2, 1]     // full turns of each wheel, from the right; wheels further left turn once
const ROW = 1.3             // the height of a digit row, in em: room for the window's faded edges
const OVERSHOOT = 0.1       // rows past the target before the click back

/**
 * f(p) = 1 − (1 − p)²(1 − a·p): starts at full speed, passes 1 by `over` and comes back to it with zero speed.
 * The overshoot peaks at p = (2 + a) / 3a; `a` is found by bisection (the overshoot grows with a on [1, 3]).
 */
function rollEase(over: number): (p: number) => number {
  const peak = (a: number) => { const p = (2 + a) / (3 * a); return (1 - p) ** 2 * (a * p - 1) }
  let lo = 1, hi = 3
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (peak(mid) < over) lo = mid; else hi = mid }
  const a = (lo + hi) / 2
  return p => 1 - (1 - p) ** 2 * (1 - a * p)
}

export default gsapScene(({ root, gsap, width, parameters }) => {
  const to = (parameters.to as number | undefined) ?? 28.4
  const decimals = (parameters.decimals as number | undefined) ?? 1
  const unit = (parameters.unit as string | undefined) ?? 'BLEU · 英德翻译'
  const text = Math.abs(to).toFixed(decimals)
  const digits = [...text].filter(ch => /\d/.test(ch)).length
  let k = digits   // wheel index from the right, counted down as the text is read from the left
  const ids: string[] = []
  const cells = [...text].map(ch => {
    if (!/\d/.test(ch)) return `<span class="od__sep">${ch}</span>`
    k -= 1
    const turns = TURNS[k] ?? 1, rows = turns * 10 + Number(ch) + 1
    const id = uid('od-blur')
    ids.push(id)
    return `<span class="od__cell" data-i="${k}" data-rows="${rows}" data-target="${rows - 1}" data-blur="${id}"><span class="od__lens"><span class="od__col">${Array.from({ length: rows }, (_, r) => `<span>${r % 10}</span>`).join('')}</span></span></span>`
  })
  frame(root, `
    .od { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5cqh; }
    .od__n { display: flex; font: 500 14cqw/${ROW} var(--pm-font-mono); font-variant-numeric: tabular-nums; color: var(--pm-color-accent); }
    .od__cell { display: block; height: ${ROW}em; overflow: clip;
      -webkit-mask-image: linear-gradient(transparent, var(--pm-color-ink) 22%, var(--pm-color-ink) 80%, transparent);
      mask-image: linear-gradient(transparent, var(--pm-color-ink) 22%, var(--pm-color-ink) 80%, transparent); }
    .od__lens { display: block; height: ${ROW}em; transform-origin: 50% 50%; }
    .od__col { display: flex; flex-direction: column; }
    .od__col > span, .od__sep { display: block; height: ${ROW}em; }
    .od__defs { position: absolute; width: 0; height: 0; }
  `, `<svg class="od__defs" aria-hidden="true"><defs>${ids.map(id => blurFilter(id, 0, 0)).join('')}</defs></svg>
    <div class="od"><div class="od__n" aria-label="${to.toFixed(decimals)}">${to < 0 ? '<span class="od__sep">−</span>' : ''}${cells.join('')}</div><div class="lf-caption od__unit">${unit}</div></div>`)

  const tl = gsap.timeline()
  const cqw = width / 100
  const wheels = [...root.querySelectorAll<HTMLElement>('.od__cell')]
  const most = Math.max(...wheels.map(c => Number(c.dataset.target)))
  for (const cell of wheels) {
    const i = Number(cell.dataset.i), rows = Number(cell.dataset.rows), target = Number(cell.dataset.target)
    const col = cell.querySelector('.od__col')!, lens = cell.querySelector('.od__lens')!
    const id = cell.dataset.blur!, blur = root.querySelector(`.${id}__blur`)!
    const t = i * 0.04, roll = 0.8
    const pct = (row: number) => (-100 * row) / rows
    const fast = target / most   // the wheels that travel further smear more
    tl.to(col, { yPercent: pct(target), duration: roll, ease: rollEase(OVERSHOOT / target) }, t)
    // Smear: up in 50 ms, then down with the speed, which falls about as (1 - p)², the curve power2.out traces.
    tl.set(cell, { filter: `url(#${id})` }, t)
    tl.to(blur, { keyframes: [
      { attr: { stdDeviation: `0 ${(0.9 * fast * cqw).toFixed(2)}` }, duration: 0.05, ease: 'power1.out' },
      { attr: { stdDeviation: '0 0' }, duration: 0.5, ease: 'power2.out' },
    ] }, t)
    tl.to(lens, { keyframes: [
      { scaleY: 1 + 0.22 * fast, duration: 0.05, ease: 'power1.out' },
      { scaleY: 1, duration: 0.5, ease: 'power2.out' },
    ] }, t)
    tl.set(cell, { filter: 'none' }, t + 0.56)
  }
  atoms(gsap, tl).enter('.od__unit', 0.55, { from: 'fade', duration: 0.3 })
  return tl
})
