import { gsapScene } from '@lincyaw/addon-motion/scene'

// Merging tokens: the right token collapses (width, padding, margin to 0), the left one's text changes with
// `tl.set(..., { textContent })` at a later position (a set inside the timeline reverts when the deck goes back),
// and a fromTo with immediateRender: false gives the merged token a pop.
const TOKENS = ['机', '器', '学', '习']

export default gsapScene(({ root, gsap, at, color }) => {
  root.innerHTML = `
    <style>
      .mg { position: absolute; inset: 0; display: flex; justify-content: center; align-items: center; }
      .mg__tok { display: inline-grid; place-items: center; min-width: 4.2rem; height: 4.2rem; padding: 0 0.8rem; margin: 0 0.4rem; border-radius: 0.7rem; border: 3px solid var(--pm-color-line-strong); background: var(--pm-color-surface); color: var(--pm-color-ink); font: 600 2.2rem var(--pm-font-sans); white-space: nowrap; overflow: hidden; box-sizing: border-box; }
    </style>
    <div class="mg">${TOKENS.map((t, i) => `<span class="mg__tok" data-i="${i}">${t}</span>`).join('')}</div>`
  const s = (k: number) => at(k) / 1000
  const tok = (i: number) => root.querySelector<HTMLElement>(`[data-i="${i}"]`)!
  const collapse = { width: 0, minWidth: 0, paddingLeft: 0, paddingRight: 0, marginLeft: 0, marginRight: 0, borderWidth: 0, opacity: 0, duration: 0.45, ease: 'power2.in' }
  const pop = (el: HTMLElement, t: number) => tl.fromTo(el, { scale: 1.25 }, { scale: 1, duration: 0.4, ease: 'back.out(3)', immediateRender: false }, t)
  const tl = gsap.timeline()
  // Step 0: the characters come in.
  tl.from('.mg__tok', { y: 30, opacity: 0, duration: 0.5, stagger: 0.08, ease: 'back.out(2)' }, s(0))
  // Step 1: 机+器 and 学+习 merge into two words.
  tl.to([tok(0), tok(1), tok(2), tok(3)], { borderColor: color('accent'), duration: 0.25 }, s(1))
  tl.to([tok(1), tok(3)], collapse, s(1) + 0.3)
  tl.set(tok(0), { textContent: '机器' }, s(1) + 0.75)
  tl.set(tok(2), { textContent: '学习' }, s(1) + 0.75)
  pop(tok(0), s(1) + 0.75)
  pop(tok(2), s(1) + 0.75)
  // Step 2: the two words merge into one token.
  tl.to(tok(2), collapse, s(2))
  tl.set(tok(0), { textContent: '机器学习' }, s(2) + 0.45)
  tl.to(tok(0), { backgroundColor: color('accent'), borderColor: color('accent'), color: color('on-accent'), duration: 0.3 }, s(2) + 0.45)
  pop(tok(0), s(2) + 0.45)
  return tl
})
