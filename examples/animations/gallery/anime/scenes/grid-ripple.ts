import { animeScene } from '@lincyaw/addon-motion/scene'

// stagger with `grid`: cells appear from the center, a ripple runs out from a chosen cell (`from: index`),
// then `axis: 'y'` turns the delay into a sweep down the rows, the way a convolution kernel slides.
// The pulse uses keyframes on `scale` after the first tween on `scale`; they are added in time order, so each one starts from the last.
const ROWS = 9
const COLS = 15

export default animeScene(({ root, anime, at, color }) => {
  root.innerHTML = `
    <div style="position: absolute; inset: 0; display: grid; place-items: center">
      <div style="display: grid; grid-template-columns: repeat(${COLS}, 1fr); gap: 1.2%; width: 82%; aspect-ratio: ${COLS} / ${ROWS}">
        ${Array.from({ length: ROWS * COLS }, () => `<div class="cell" style="border-radius: 22%; background: ${color('accent')}"></div>`).join('')}
      </div>
    </div>`
  const grid = [COLS, ROWS]
  const tl = anime.createTimeline({ autoplay: false })
  // Step 0: the cells grow out from the center.
  tl.add('.cell', { scale: [0, 1], opacity: [0, 0.35], duration: 500, ease: 'outBack', delay: anime.stagger(45, { grid, from: 'center' }) }, at(0))
  // Step 1: a ripple from the cell at row 2, column 3: each cell pulses up and back.
  tl.add('.cell', {
    scale: [{ to: 0.55, duration: 220, ease: 'outQuad' }, { to: 1, duration: 420, ease: 'outElastic(1, .6)' }],
    opacity: [{ to: 1, duration: 220 }, { to: 0.35, duration: 420 }],
    delay: anime.stagger(55, { grid, from: 2 * COLS + 3 }),
  }, at(1))
  // Step 2: a sweep row by row (only the y distance counts), lifting each row in turn.
  tl.add('.cell', {
    translateY: [{ to: '-30%', duration: 200, ease: 'outQuad' }, { to: '0%', duration: 300, ease: 'inQuad' }],
    opacity: [{ to: 1, duration: 200 }, { to: 0.6, duration: 300 }],
    delay: anime.stagger(110, { grid, from: 'first', axis: 'y' }),
  }, at(2))
  return tl
})
