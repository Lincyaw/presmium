import { animeScene } from '@lincyaw/addon-motion/scene'

// A scramble reveal written as a pure function of progress: a setter object turns the tweened progress into text,
// settled characters from the digest, the rest drawn from a hash of (position, frame). text.scrambleText is not used:
// its generator advances on every render, so seeking to the same time twice shows different characters even with `seed`.
// A tl.set of a non-numeric string (innerHTML: 'p') is not undone by a backward seek either, so the changed letter is an opacity swap.
const DIGESTS = [
  '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
  'fdd7585e08c4e2afd71dcabdb4636c89d557a3f42db9e2040c8bbd1708aa4ce7',
]
const HEX = '0123456789abcdef'
const noise = (i: number, frame: number) => {
  let h = (i * 374761393 + frame * 668265263) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return HEX[((h ^ (h >>> 16)) >>> 0) % 16]
}
// p in [0, 1]: characters left of the front are settled, a band of 12 ahead of it is scrambled, the rest shows `before`.
const reveal = (before: string, after: string, p: number) => {
  const front = p * (after.length + 12)
  const frame = Math.floor(p * 60)
  let s = ''
  for (let i = 0; i < after.length; i++) s += i < front - 12 ? after[i] : i < front ? noise(i, frame) : before[i] ?? ' '
  return s
}

export default animeScene(({ root, anime, at, color }) => {
  const ink = color('ink')
  root.innerHTML = `
    <div style="position: absolute; inset: 0; container-type: size; display: flex; flex-direction: column; justify-content: center; align-items: center;
                gap: 6cqh; font-family: var(--pm-font-mono); color: ${ink}">
      <div style="font-size: 7cqh">sha256("hell<span style="display: inline-grid"><span class="o" style="grid-area: 1 / 1">o</span><span class="p" style="grid-area: 1 / 1; color: ${color('warn')}">p</span></span>")</div>
      <div class="digest" style="font-size: 3.6cqw; width: 34ch; line-height: 1.5; overflow-wrap: anywhere; text-align: center; white-space: pre-wrap; color: ${color('accent')}"></div>
    </div>`
  const out = root.querySelector('.digest')!
  const blank = ' '.repeat(64)
  const make = (before: string, after: string) => {
    let p = 0
    return { get p() { return p }, set p(v: number) { p = v; out.textContent = reveal(before, after, v) } }
  }
  const first = make(blank, DIGESTS[0])
  const second = make(DIGESTS[0], DIGESTS[1])
  const tl = anime.createTimeline({ autoplay: false })
  // Step 0: the digest of "hello" settles left to right out of scrambled hex.
  tl.add(first, { p: [0, 1], duration: 1500, ease: 'linear' }, at(0))
  // Step 1: change the last letter: o becomes p.
  tl.add('.o', { opacity: [1, 0], duration: 250 }, at(1))
  tl.add('.p', { opacity: [0, 1], scale: [1.8, 1], duration: 400, ease: 'outBack' }, at(1) + 100)
  // Step 2: an entirely different digest: every character changes (the avalanche effect).
  tl.add(second, { p: [0, 1], duration: 1500, ease: 'linear' }, at(2))
  return tl
})
