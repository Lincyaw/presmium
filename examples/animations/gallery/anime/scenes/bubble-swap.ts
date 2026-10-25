import { animeScene } from '@lincyaw/addon-motion/scene'

// Bubble sort as data: the swaps are computed first, then each becomes a pair of `left` tweens at its own time.
// A bar gets many tweens on `left`: they are added in time order and give only `to` (each starts where the last ended).
// In Anime.js 4.5 a later tween with an explicit [from, to] is not restored when seeking back past its start; a bare `to` is.
const DATA = [5, 2, 8, 1, 9, 3, 6]
const SLOT = 100 / DATA.length

export default animeScene(({ root, anime, at, color }) => {
  const accent = color('accent')
  const warn = color('warn')
  const ok = color('ok')
  root.innerHTML = `
    <div style="position: absolute; inset: 6% 6% 8%; container-type: size; font-family: var(--pm-font-mono)">
      ${DATA.map((v, i) => `
        <div class="bar" data-i="${i}" style="position: absolute; bottom: 0; left: ${i * SLOT}%; width: ${SLOT}%; height: ${v * 10}%;
             display: flex; padding: 0 1.4%; box-sizing: border-box">
          <div class="fill" style="flex: 1; display: flex; align-items: flex-end; justify-content: center; border-radius: 1.4cqw 1.4cqw 0 0;
               background: ${accent}; color: ${color('on-accent')}; font-size: 5cqh; padding-bottom: 2cqh">${v}</div>
        </div>`).join('')}
    </div>`
  const bars = [...root.querySelectorAll<HTMLElement>('.bar')]
  const fills = bars.map(b => b.firstElementChild as HTMLElement)
  const tl = anime.createTimeline({ autoplay: false, defaults: { ease: 'inOutQuad' } })
  // Run the sort on the indices, recording each compare/swap with the pass it belongs to.
  const order = DATA.map((_, i) => i)
  const passes = 3
  const STEP = 220
  for (let pass = 0; pass < passes; pass++) {
    let t = at(pass)
    for (let j = 0; j < DATA.length - 1 - pass; j++) {
      const a = order[j]
      const b = order[j + 1]
      // Compare: both bars flash.
      tl.add([fills[a], fills[b]], { backgroundColor: [{ to: warn, duration: 80 }, { to: accent, duration: 120 }] }, t)
      if (DATA[a] > DATA[b]) {
        tl.add(bars[a], { left: `${(j + 1) * SLOT}%`, duration: STEP }, t + 60)
        tl.add(bars[b], { left: `${j * SLOT}%`, duration: STEP }, t + 60)
        order[j] = b
        order[j + 1] = a
      }
      t += STEP
    }
    // The largest remaining bar has bubbled to the end: it is settled.
    tl.add(fills[order[DATA.length - 1 - pass]], { backgroundColor: ok, duration: 200 }, t)
  }
  // Last step: the array is already in order after three passes, so the rest settle at once.
  tl.add(order.slice(0, DATA.length - passes).map(i => fills[i]), { backgroundColor: ok, duration: 300, delay: anime.stagger(60) }, at(passes))
  return tl
})
