import { gsapScene } from '@lincyaw/addon-motion/scene'
import { atoms, esc, frame, list, num, pick, POINTER, POINTER_CSS, shadow } from './lib/ui.ts'

// Drag and drop: the pointer carries one card of a task board to another column. States `board`, `grab`,
// `carry`, `drop`. `board` (1 s): the columns rise 70 ms apart, the pointer arrives on the card. `grab` (0.6 s):
// 0–0.12 s the press; 0.12–0.4 s the card lifts: it grows 4%, tilts 2° and its shadow deepens and spreads (one
// height value drives all three). `carry` (0.9 s): the card and the pointer move as one, both ends eased, the
// card leaning into the move and straightening as it slows (the tilt follows the speed); the cards of the target
// column slide down to open the slot just before it arrives, and the gap it left closes. `drop` (1.8 s): 0–0.25 s
// the card comes down, squashes 2% and settles (the impact), the two column counts change and the target's count
// pops (the effect after the cause); the pointer steps aside; hold. Adapted from HyperFrames cursor-drag-drop.
interface Column { title: string, cards: string[] }
const COL_X = [9, 37.5, 66], COL_W = 25, TOP = 24, CARD_H = 12, CARD_GAP = 2.6   // % of the frame

export default gsapScene(({ root, gsap, at, parameters }) => {
  const cols = list<Column>(parameters, 'columns', [
    { title: '待写', cards: ['第 4 讲 · 正则化', '习题课 3'] },
    { title: '录制中', cards: ['第 3 讲 · 过拟合', '期中复习'] },
    { title: '已发布', cards: ['第 1 讲 · 线性回归', '第 2 讲 · 梯度下降'] },
  ]).slice(0, 3)
  const from = Math.min(cols.length - 1, num(parameters, 'from', 1))
  const index = Math.min((cols[from]?.cards.length ?? 1) - 1, num(parameters, 'index', 0))
  const to = Math.min(cols.length - 1, num(parameters, 'to', 2))
  const slot = (i: number) => TOP + i * (CARD_H + CARD_GAP)
  const f = frame(root, `
    ${POINTER_CSS}
    .dd__col { position: absolute; top: 9%; height: 82%; width: ${COL_W}%; border-radius: 1.4cqw; background: var(--pm-color-sunk); }
    .dd__head { position: absolute; left: 1.4cqw; right: 1.4cqw; top: 3cqh; display: flex; align-items: center; gap: 0.8cqw; font-size: 1.9cqw; font-weight: 600; }
    .dd__n { min-width: 2.6cqw; padding: 0.2cqh 0.7cqw; border-radius: 99cqw; background: var(--pm-color-line); color: var(--pm-color-muted); font: 500 1.4cqw var(--pm-font-mono); text-align: center; }
    .dd__card { position: absolute; width: ${COL_W - 3}%; height: ${CARD_H}%; display: flex; align-items: center; gap: 1cqw; padding: 0 1.4cqw; border-radius: 1cqw; background: var(--pm-color-surface); border: 0.15cqw solid var(--pm-color-line); box-shadow: ${shadow(0.5)}; font-size: 1.75cqw; white-space: nowrap; }
    .dd__card::before { content: ''; width: 0.5cqw; align-self: stretch; margin: 2.4cqh 0; border-radius: 99cqw; background: var(--pm-color-line-strong); }
    .dd__card.is-moving::before { background: var(--pm-color-accent); }
    .dd__lift { position: absolute; inset: 0; border-radius: inherit; box-shadow: ${shadow(3)}; opacity: 0; }
  `, `
    ${cols.map((c, i) => `<div class="dd__col" style="left:${COL_X[i]}%"><div class="dd__head">${esc(c.title)}<span class="dd__n" data-c="${i}">${c.cards.length}</span></div></div>`).join('')}
    ${cols.map((c, i) => c.cards.map((t, j) => `<div class="dd__card${i === from && j === index ? ' is-moving' : ''}" data-c="${i}" data-j="${j}" style="left:${COL_X[i]! + 1.5}%;top:${slot(j)}%">${esc(t)}<i class="dd__lift"></i></div>`).join('')).join('')}
    <div class="lf-pointer-layer">${POINTER}</div>`)
  const s = (k: number) => at(k) / 1000
  const tl = gsap.timeline()
  const a = atoms(gsap, tl)
  const card = pick(f, `.dd__card[data-c="${from}"][data-j="${index}"]`), layer = pick(f, '.lf-pointer-layer')
  const lift = card.querySelector('.dd__lift')!
  const grip = { x: COL_X[from]! + 1.5 + 6, y: slot(index) + CARD_H / 2 }   // where the pointer holds the card
  const dest = { x: COL_X[to]! + 1.5, y: slot(0) }
  // board
  a.enter('.dd__col', 0, { stagger: 0.07 })
  a.enter('.dd__card', 0.15, { stagger: 0.03, from: 'fade', duration: 0.3 })
  gsap.set(layer, { xPercent: 92, yPercent: 96, autoAlpha: 0 })
  tl.to(layer, { autoAlpha: 1, duration: 0.2 }, 0.35)
  a.point(layer, Math.max(0.4, s(1) - 0.65), grip.x, grip.y)
  // grab: press, then lift (scale, tilt and shadow from one height)
  const g = s(1)
  a.click('.lf-pointer', '.lf-pointer__ring', undefined, g)
  tl.set(card, { zIndex: 3 }, g)
  tl.to(card, { scale: 1.04, rotation: 2, duration: 0.28, ease: 'power2.out' }, g + 0.12)
  tl.to(lift, { opacity: 1, duration: 0.28, ease: 'power2.out' }, g + 0.12)
  // carry: card and pointer in lockstep; the tilt leans into the move and straightens as it slows
  const c = s(2), move = 0.75
  tl.to(card, { left: `${dest.x}%`, top: `${dest.y}%`, duration: move, ease: 'power3.inOut' }, c)
  a.point(layer, c, dest.x + 6, dest.y + CARD_H / 2, { duration: move })
  tl.to(card, { keyframes: [{ rotation: 5, duration: move * 0.45, ease: 'power2.out' }, { rotation: 2, duration: move * 0.55, ease: 'power2.inOut' }] }, c)
  // the target column opens the slot just before the card arrives; the gap in the source closes
  f.querySelectorAll<HTMLElement>(`.dd__card[data-c="${to}"]`).forEach(el => {
    tl.to(el, { top: `${slot(Number(el.dataset.j) + 1)}%`, duration: 0.45, ease: 'power3.inOut' }, c + 0.25)
  })
  f.querySelectorAll<HTMLElement>(`.dd__card[data-c="${from}"]`).forEach(el => {
    const j = Number(el.dataset.j)
    if (j > index) tl.to(el, { top: `${slot(j - 1)}%`, duration: 0.45, ease: 'power3.inOut' }, c + 0.3)
  })
  // drop: down, squash, settle; the counts change, the target's count pops
  const d = s(3)
  tl.to(card, { keyframes: [{ scale: 0.98, rotation: 0, duration: 0.12, ease: 'power2.in' }, { scale: 1, duration: 0.3, ease: 'back.out(2)' }] }, d)
  tl.to(lift, { opacity: 0, duration: 0.2, ease: 'power2.in' }, d)
  const nFrom = pick(f, `.dd__n[data-c="${from}"]`), nTo = pick(f, `.dd__n[data-c="${to}"]`)
  tl.set(nFrom, { textContent: String(cols[from]!.cards.length - 1) }, d + 0.15)
  tl.set(nTo, { textContent: String(cols[to]!.cards.length + 1) }, d + 0.15)
  tl.to(nTo, { keyframes: [{ scale: 1.3, duration: 0.15, ease: 'power2.out' }, { scale: 1, duration: 0.4, ease: 'back.out(3)' }] }, d + 0.15)
  a.point(layer, d + 0.25, dest.x + 20, 86)
  return tl
})
