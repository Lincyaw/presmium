import { animeScene } from '@lincyaw/addon-motion/scene'

// Counting with a modifier: a plain object's value is tweened and written as text by a setter (callbacks are muted under seek).
// The numbers span four orders of magnitude, so the bars are on a log scale and the counter tweens log10(n), not n.
const MODELS: Array<[string, number]> = [['GPT', 117e6], ['GPT-2', 1.5e9], ['GPT-3', 175e9]]
const fmt = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(n < 1e10 ? 1 : 0)}B` : `${Math.round(n / 1e6)}M`)

export default animeScene(({ root, anime, at, color }) => {
  const ink = color('ink')
  root.innerHTML = `
    <div style="position: absolute; inset: 0; container-type: size"><div style="height: 100%; box-sizing: border-box; display: flex; align-items: flex-end; justify-content: center; gap: 8%; padding: 6% 10% 9%;
                font-family: var(--pm-font-sans); color: ${ink}">
      ${MODELS.map(([name]) => `
        <div style="flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 0.4em">
          <div class="num" style="font: 600 5cqw var(--pm-font-mono)">0</div>
          <div class="bar" style="width: 100%; height: 75%; background: ${color('accent')}; border-radius: 0.4em 0.4em 0 0; transform-origin: bottom"></div>
          <div style="font-size: 3cqw; color: ${color('muted')}">${name}</div>
        </div>`).join('')}
    </div></div>`
  const nums = [...root.querySelectorAll<HTMLElement>('.num')]
  const bars = root.querySelectorAll('.bar')
  const tl = anime.createTimeline({ autoplay: false, defaults: { ease: 'outCubic' } })
  // Each counter is an object whose setter writes the formatted value: the text is a function of the tweened number.
  MODELS.forEach(([, n], k) => {
    const lo = 6
    const hi = Math.log10(175e9)
    let value = lo
    const counter = {
      get v() { return value },
      set v(x: number) { value = x; nums[k].textContent = x <= lo ? '0' : fmt(10 ** x) },
    }
    tl.add(counter, { v: [lo, Math.log10(n)], duration: 1100, modifier: anime.round(3) }, at(k))
    tl.add(bars[k], { scaleY: [0, (Math.log10(n) - lo) / (hi - lo)], duration: 1100 }, at(k))
  })
  return tl
})
