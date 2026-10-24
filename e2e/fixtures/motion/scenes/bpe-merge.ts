// @ts-nocheck: @lincyaw/addon-motion resolves from the deck the tests build (its node_modules link it), not from e2e/.
import { gsapScene } from '@lincyaw/addon-motion/scene'

// Byte pair encoding on "low lower lowest": the tokens come in, the most frequent pair lights up,
// then "l o" merges into "lo" and "lo w" into "low". Each step is a part of one GSAP timeline.
const WORDS = ['low', 'lower', 'lowest']

export default gsapScene(({ root, gsap, at, color }) => {
  const lit = { backgroundColor: color('accent'), color: color('bg'), borderColor: color('accent') }
  root.innerHTML = `
    <style>
      .bpe { display: grid; grid-template-columns: 1fr 9rem; gap: 1.5rem; height: 100%; padding: 1.5rem; box-sizing: border-box; font-family: var(--pm-font-mono); }
      .bpe__words { display: flex; flex-direction: column; justify-content: center; gap: 1rem; }
      .bpe__word { display: flex; gap: 0.35rem; }
      .bpe__token { display: inline-grid; place-items: center; min-width: 2.4rem; height: 2.6rem; padding: 0 0.5rem; border-radius: 0.45rem; border: 2px solid var(--pm-color-line-strong, #888); background: var(--pm-color-surface, transparent); color: var(--pm-color-ink); font-size: 1.35rem; overflow: hidden; white-space: nowrap; box-sizing: border-box; }
      .bpe__vocab { align-self: center; padding: 0.75rem; border-radius: 0.6rem; border: 1px dashed var(--pm-color-line-strong, #888); color: var(--pm-color-muted); font-family: var(--pm-font-sans); }
      .bpe__vocab h4 { margin: 0 0 0.5rem; font-size: 0.9rem; }
      .bpe__entry { margin: 0.3rem 0; padding: 0.2rem 0.5rem; border-radius: 0.3rem; background: var(--pm-color-accent); color: var(--pm-color-bg); font-family: var(--pm-font-mono); font-size: 1.1rem; opacity: 0; }
    </style>
    <div class="bpe">
      <div class="bpe__words">${WORDS.map(word => `<div class="bpe__word">${[...word].map(c => `<span class="bpe__token" data-c="${c}">${c}</span>`).join('')}</div>`).join('')}</div>
      <div class="bpe__vocab"><h4>新符号</h4><div class="bpe__entry" data-entry="lo">lo</div><div class="bpe__entry" data-entry="low">low</div></div>
    </div>`
  const words = [...root.querySelectorAll<HTMLElement>('.bpe__word')]
  const nth = (k: number) => words.map(word => word.children[k] as HTMLElement)
  const [l, o, w] = [nth(0), nth(1), nth(2)]
  const s = (ms: number) => ms / 1000
  const tl = gsap.timeline()
  // Step 0: the tokens come in.
  tl.from('.bpe__token', { y: 28, opacity: 0, duration: 0.6, stagger: 0.03, ease: 'back.out(2)' }, s(at(0)))
  // Step 1: the most frequent pair, "l o", in all three words.
  tl.to([...l, ...o], { ...lit, duration: 0.4, stagger: 0.05 }, s(at(1)))
  tl.to([...l, ...o], { scale: 1.12, duration: 0.25, yoyo: true, repeat: 1 }, s(at(1)) + 0.45)
  // Step 2: "l o" becomes the one symbol "lo".
  tl.to(o, { width: 0, minWidth: 0, paddingLeft: 0, paddingRight: 0, borderWidth: 0, marginLeft: '-0.35rem', opacity: 0, duration: 0.5, ease: 'power2.in' }, s(at(2)))
  tl.set(l, { textContent: 'lo' }, s(at(2)) + 0.45)
  tl.fromTo('[data-entry="lo"]', { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.4, immediateRender: false }, s(at(2)) + 0.5)
  // Step 3: "lo w" becomes "low".
  tl.to(w, { ...lit, duration: 0.3 }, s(at(3)))
  tl.to(w, { width: 0, minWidth: 0, paddingLeft: 0, paddingRight: 0, borderWidth: 0, marginLeft: '-0.35rem', opacity: 0, duration: 0.5, ease: 'power2.in' }, s(at(3)) + 0.35)
  tl.set(l, { textContent: 'low' }, s(at(3)) + 0.8)
  tl.fromTo('[data-entry="low"]', { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.4, immediateRender: false }, s(at(3)) + 0.8)
  return tl
})
