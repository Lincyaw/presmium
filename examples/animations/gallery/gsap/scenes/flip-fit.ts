import { gsapScene } from '@lincyaw/addon-motion/scene'

// Flip.fit with `getVars: true`: measure where a card must go to sit exactly on a slot (x, y, width, height)
// and put those vars in an ordinary tween. Flip.getState/Flip.from change the DOM when the scene is built and
// cannot be undone by seeking; fit's vars are plain numbers, so this seeks exactly (measured at build time).
const CANDIDATES = [['the cat sat', 0.12], ['the cat ran', 0.41], ['a cat sat', 0.07], ['the dog sat', 0.29], ['the cat is', 0.11]] as const

export default gsapScene(({ root, gsap, at, color, plugins }) => {
  const { Flip } = plugins
  root.innerHTML = `
    <style>
      .ff { position: absolute; inset: 0; font-family: var(--pm-font-sans); }
      .ff__list { position: absolute; left: 6%; top: 10%; width: 40%; display: flex; flex-direction: column; gap: 0.6rem; }
      .ff__card { display: flex; justify-content: space-between; padding: 0.55rem 0.9rem; border-radius: 0.6rem; background: var(--pm-color-surface); border: 2px solid var(--pm-color-line-strong); color: var(--pm-color-ink); font-size: 1.1rem; box-sizing: border-box; }
      .ff__card b { font-family: var(--pm-font-mono); color: var(--pm-color-muted); font-weight: 500; }
      .ff__beam { position: absolute; right: 6%; top: 18%; width: 38%; display: flex; flex-direction: column; gap: 1rem; }
      .ff__beam > span { color: var(--pm-color-muted); }
      .ff__slot { height: 4rem; border-radius: 0.8rem; border: 2px dashed var(--pm-color-line-strong); }
    </style>
    <div class="ff">
      <div class="ff__list">${CANDIDATES.map(([t, p], i) => `<div class="ff__card" data-i="${i}"><span>${t}</span><b>${p.toFixed(2)}</b></div>`).join('')}</div>
      <div class="ff__beam"><span>beam（宽度 2）</span><div class="ff__slot"></div><div class="ff__slot"></div></div>
    </div>`
  const s = (k: number) => at(k) / 1000
  const card = (i: number) => root.querySelector<HTMLElement>(`.ff__card[data-i="${i}"]`)!
  const slots = [...root.querySelectorAll<HTMLElement>('.ff__slot')]
  // Measured now, while every card is in its list place.
  const into = (i: number, k: number) => Flip.fit(card(i), slots[k], { getVars: true }) as gsap.TweenVars
  const best = into(1, 0)
  const second = into(3, 1)
  const tl = gsap.timeline()
  // Step 0: the candidates come in.
  tl.from('.ff__card', { x: -40, opacity: 0, duration: 0.4, stagger: 0.07, ease: 'power2.out' }, s(0))
  // Step 1: the most probable one moves into the first slot.
  tl.to(card(1), { ...best, borderColor: color('accent'), duration: 0.8, ease: 'power3.inOut' }, s(1))
  // Step 2: the next one into the second slot; the rest fade.
  tl.to(card(3), { ...second, borderColor: color('accent'), duration: 0.8, ease: 'power3.inOut' }, s(2))
  tl.to([card(0), card(2), card(4)], { opacity: 0.3, duration: 0.4 }, s(2) + 0.5)
  return tl
})
