import { gsapScene } from '@lincyaw/addon-motion/scene'

// TextPlugin: code is typed character by character, then a comment is rewritten word by word (`delimiter: ' '`).
// The text at any time comes from the tween's progress, so it seeks exactly (unlike ScrambleText, which is random).
// `preserveSpaces` keeps the indentation; with a delimiter the start text gets a leading space when seeking back,
// so that line uses `white-space: normal`.
export default gsapScene(({ root, gsap, at }) => {
  root.innerHTML = `
    <style>
      .tp { position: absolute; inset: 12% 10%; padding: 1.4rem 1.6rem; border-radius: 0.8rem; background: var(--pm-color-code); border: 1px solid var(--pm-color-line); font: 1.25rem/1.8 var(--pm-font-mono); color: var(--pm-color-ink); }
      .tp__line { white-space: pre; min-height: 1.8em; }
      .tp__kw { color: var(--pm-color-syntax-keyword); }
      .tp__cm { color: var(--pm-color-muted); font-style: italic; white-space: normal; }
    </style>
    <div class="tp">
      <div class="tp__line tp__cm tp__c"></div>
      <div class="tp__line"><span class="tp__kw tp__1a"></span><span class="tp__1b"></span></div>
      <div class="tp__line tp__2"></div>
      <div class="tp__line tp__3"></div>
    </div>`
  const s = (k: number) => at(k) / 1000
  const type = (value: string, duration: number) => ({ text: { value, preserveSpaces: true }, duration, ease: 'none' })
  const tl = gsap.timeline()
  // Step 0: the function's head is typed.
  tl.to('.tp__1a', type('def ', 0.25), s(0))
  tl.to('.tp__1b', type('attention(q, k, v):', 0.9), '>')
  // Step 1: the body.
  tl.to('.tp__2', type('    w = softmax(q @ k.T / sqrt(d))', 1.2), s(1))
  tl.to('.tp__3', type('    return w @ v', 0.6), '>')
  // Step 2: a comment appears and is then rewritten word by word.
  tl.to('.tp__c', { text: { value: '# scaled dot-product attention' }, duration: 0.8, ease: 'none' }, s(2))
  tl.to('.tp__c', { text: { value: '# every query looks at every key', delimiter: ' ' }, duration: 0.8, ease: 'none' }, s(2) + 1.1)
  return tl
})
