import { animeScene } from '@lincyaw/addon-motion/scene'

// text.splitText: an English sentence split into words (word-level tokens), a Chinese one into characters.
// splitText wraps each word/char in an inline-block span, so translateY works; the scope's revert restores the text.
// Splitting by lines is avoided: it waits for fonts and re-splits on resize, which a seek-driven scene cannot follow.
export default animeScene(({ root, anime, at, color }) => {
  root.innerHTML = `
    <div style="position: absolute; inset: 0; container-type: size">
    <div style="height: 100%; display: flex; flex-direction: column; justify-content: center; gap: 1.2em; padding: 0 8%;
                font-family: var(--pm-font-sans); color: ${color('ink')}; font-size: 5.4cqw">
      <p class="en" style="margin: 0">Attention is all you need</p>
      <p class="zh" style="margin: 0">注意力就是你所需要的一切</p>
    </div></div>`
  const en = anime.splitText(root.querySelector('.en')!, { words: { class: 'word' } })
  const zh = anime.splitText(root.querySelector('.zh')!, { chars: { class: 'char' } })
  for (const el of [...en.words, ...zh.chars]) Object.assign((el as HTMLElement).style, { padding: '0 0.06em', borderRadius: '0.2em' })
  const accent = color('accent')
  const soft = color('accent-soft')
  const clear = 'rgba(0, 0, 0, 0)'
  const tl = anime.createTimeline({ autoplay: false, defaults: { ease: 'outQuad' } })
  // Step 0: the words rise in one by one, each a token.
  tl.add(en.words, { opacity: [0, 1], translateY: ['0.8em', '0em'], duration: 450, delay: anime.stagger(140) }, at(0))
  // Step 1: the Chinese sentence arrives character by character.
  tl.add(zh.chars, { opacity: [0, 1], translateY: ['0.6em', '0em'], duration: 300, delay: anime.stagger(70) }, at(1))
  // Step 2: tokens are marked: each word gets a box, then the characters of 注意力 light up.
  tl.add(en.words, { backgroundColor: [clear, soft], duration: 300, delay: anime.stagger(80) }, at(2))
  tl.add(zh.chars.slice(0, 3), { backgroundColor: [clear, soft], color: [color('ink'), accent], translateY: '-0.15em', duration: 300, delay: anime.stagger(80) }, at(2) + 500)
  return tl
})
