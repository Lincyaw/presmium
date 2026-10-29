import { gsapScene } from '@lincyaw/addon-motion/scene'
import { frame } from '../../../lengths/scenes/kit/frame.ts'

// Focus words, with GSAP: a definition comes into focus word by word, as a lens pulls focus. One state, `resolve`
// (2.6 s). From 0.1 s, every 90 ms the next word (in reading order) resolves out of a blur: opacity first (0.2 s),
// then the blur and a short rise over 0.45 s (power3.out), so each word is readable before the next has settled and
// the eye can follow the line without a jump. The key words (`key`, indices into `words`) resolve a little slower
// (0.6 s) and land in the accent: the term to remember is the last thing to sharpen in its place. The source line
// fades in after the sentence, and the rest is a hold. Use it for a definition, a quotation or a theorem
// statement that should be read, not watched; for one key word in a sentence that is already there, use
// `fx/motion/emphasize-marker`. Adapted from HyperFrames blur-in.
export default gsapScene(({ root, gsap, width, parameters }) => {
  const words = (parameters.words as string[] | undefined) ?? ['过拟合', '：', '模型', '记住了', '训练数据里的', '噪声，', '却没有', '学到', '可以推广的', '规律。']
  const key = (parameters.key as number[] | undefined) ?? [0, 9]
  const source = (parameters.source as string | undefined) ?? '《机器学习》第 2 章'
  frame(root, `
    .fw { position: absolute; left: 12cqw; right: 12cqw; top: 50%; transform: translateY(-60%); display: flex; flex-wrap: wrap; justify-content: center; row-gap: 2cqh;
      font: 600 5cqw/1.3 var(--pm-font-serif); }
    .fw__w { display: inline-block; }
    .fw__w--key { color: var(--pm-color-accent); }
    .fw__source { position: absolute; left: 0; right: 0; top: 74cqh; text-align: center; }
  `, `<div class="fw">${words.map((w, i) => `<span class="fw__w${key.includes(i) ? ' fw__w--key' : ''}">${w}</span>`).join('')}</div><div class="lf-caption fw__source">${source}</div>`)
  const tl = gsap.timeline()
  const blur = (0.9 * width) / 100
  const els = gsap.utils.toArray<HTMLElement>('.fw__w', root)
  els.forEach((el, i) => {
    const t = 0.1 + i * 0.09, slow = key.includes(i)
    const d = slow ? 0.6 : 0.45
    gsap.set(el, { autoAlpha: 0, y: '0.3em', filter: `blur(${blur.toFixed(2)}px)` })
    tl.to(el, { autoAlpha: 1, duration: 0.2, ease: 'power1.out' }, t)
    tl.to(el, { y: 0, filter: 'blur(0px)', duration: d, ease: 'power3.out' }, t)
  })
  gsap.set('.fw__source', { autoAlpha: 0 })
  tl.to('.fw__source', { autoAlpha: 1, duration: 0.4, ease: 'power1.out' }, 0.1 + els.length * 0.09 + 0.4)
  return tl
})
