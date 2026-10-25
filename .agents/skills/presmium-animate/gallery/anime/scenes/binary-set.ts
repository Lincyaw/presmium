import { animeScene } from '@lincyaw/addon-motion/scene'

// tl.set for discrete changes: a 4-bit counter counts 0 to 15 by setting each bit's text and color at fixed times
// (a set is a zero-length tween with composition 'replace', so a backward seek restores the earlier value).
// Each flipping bit also gets a short scale pulse; carries ripple from right to left.
const BITS = 4

export default animeScene(({ root, anime, at, color }) => {
  const accent = color('accent')
  const surface = color('surface')
  const ink = color('ink')
  root.innerHTML = `
    <div style="position: absolute; inset: 0; container-type: size; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6cqh;
                font-family: var(--pm-font-mono); color: ${ink}">
      <div style="display: flex; gap: 2.4cqw">
        ${Array.from({ length: BITS }, (_, i) => `<div style="display: flex; flex-direction: column; align-items: center; gap: 2cqh">
          <div class="bit" style="width: 13cqw; height: 13cqw; border-radius: 2cqw; display: grid; place-items: center; font-size: 8cqw; border: 0.4cqw solid ${color('line-strong')}; background: ${surface}; color: ${ink}">0</div>
          <div style="font-size: 3cqw; color: ${color('muted')}">2<sup>${BITS - 1 - i}</sup></div></div>`).join('')}
      </div>
      <div style="font-size: 7cqh">= <span class="dec">0</span></div>
    </div>`
  const bits = [...root.querySelectorAll<HTMLElement>('.bit')]
  const tl = anime.createTimeline({ autoplay: false })
  const TICK = 180
  // Step 0: the bits appear.
  tl.add(bits, { opacity: [0, 1], translateY: ['20%', '0%'], duration: 400, delay: anime.stagger(80), ease: 'outQuad' }, at(0))
  // Step 1: count 1 ... 15, one value per tick.
  for (let n = 1; n < 16; n++) {
    const t = at(1) + n * TICK
    bits.forEach((bit, i) => {
      const was = ((n - 1) >> (BITS - 1 - i)) & 1
      const now = (n >> (BITS - 1 - i)) & 1
      if (was === now) return
      tl.set(bit, { innerHTML: String(now), backgroundColor: now ? accent : surface, color: now ? color('on-accent') : ink }, t)
      tl.add(bit, { scale: [{ to: 1.12, duration: 60 }, { to: 1, duration: 100 }] }, t)
    })
    tl.set('.dec', { innerHTML: String(n) }, t)
  }
  return tl
})
