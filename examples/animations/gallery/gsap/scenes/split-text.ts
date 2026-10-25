import { gsapScene } from '@lincyaw/addon-motion/scene'

// SplitText: characters rise out of their masks, one word is picked out, then lines slide up out of line masks.
// The split happens once, when the scene is built; leave `autoSplit` off (its re-split makes a new animation
// that the deck does not drive). Lines depend on the width at build time.
export default gsapScene(({ root, gsap, at, color, plugins }) => {
  const { SplitText } = plugins
  root.innerHTML = `
    <style>
      .st { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; gap: 1.4rem; padding: 0 10%; color: var(--pm-color-ink); }
      .st__title { font-family: var(--pm-font-serif); font-size: 2.6rem; line-height: 1.15; font-weight: 600; }
      .st__body { font-family: var(--pm-font-sans); font-size: 1.15rem; line-height: 1.6; color: var(--pm-color-muted); max-width: 34rem; }
    </style>
    <div class="st">
      <div class="st__title">Attention Is All You Need</div>
      <div class="st__body">注意力让每个词直接看到句子里的所有其他词，按相关程度取加权平均。它不需要循环，可以整句并行计算，这就是 Transformer 的核心。</div>
    </div>`
  const title = SplitText.create(root.querySelector('.st__title'), { type: 'words,chars', mask: 'chars' })
  const body = SplitText.create(root.querySelector('.st__body'), { type: 'lines', mask: 'lines' })
  const s = (k: number) => at(k) / 1000
  // Before step 2 the lines wait below their masks.
  gsap.set(body.lines, { yPercent: 110 })
  const tl = gsap.timeline()
  // Step 0: each character rises out of its own mask.
  tl.from(title.chars, { yPercent: 110, duration: 0.5, ease: 'power3.out', stagger: 0.025 }, s(0))
  // Step 1: the word "Attention" is picked out.
  tl.to(title.words[0], { color: color('accent'), duration: 0.4, ease: 'power2.out' }, s(1))
  tl.to(title.words.slice(1), { opacity: 0.45, duration: 0.4 }, s(1))
  // Step 2: the explanation comes in line by line.
  tl.to(body.lines, { yPercent: 0, duration: 0.6, ease: 'power3.out', stagger: 0.12 }, s(2))
  return tl
})
