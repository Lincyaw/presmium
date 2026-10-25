import { animeScene } from '@lincyaw/addon-motion/scene'

// loop + alternate: one dot oscillates (simple harmonic motion), then a row of dots with staggered delays makes a travelling wave.
// A looped tween's length is (loop + 1) x duration; give the step that much time. Start times shift each dot's phase.
// A from-value shows from the start of the timeline until its tween runs, so the other dots stay hidden (opacity) until they join.
const N = 16

export default animeScene(({ root, anime, at, color }) => {
  const xs = Array.from({ length: N }, (_, i) => 70 + i * (660 / (N - 1)))
  root.innerHTML = `
    <svg viewBox="0 0 800 450" width="100%" height="100%">
      <line x1="40" x2="760" y1="225" y2="225" stroke="${color('line')}" stroke-width="2" />
      ${xs.map((x, i) => `<g transform="translate(${x} 225)"><circle class="d ${i ? 'rest' : 'lead'}" r="12" fill="${color('accent')}" /></g>`).join('')}
    </svg>`
  const tl = anime.createTimeline({ autoplay: false })
  // Step 0: the first dot oscillates: up and down, three times (loop: 5 with alternate = six half-periods).
  tl.add('.lead', { translateY: [-110, 110], duration: 400, ease: 'inOutSine', loop: 5, alternate: true }, at(0))
  // Step 1: the others join with a delay proportional to their distance: a wave travels to the right.
  tl.add('.rest', { opacity: [0, 1], duration: 150, delay: anime.stagger(70, { start: 70 }) }, at(1))
  tl.add('.lead', { translateY: 110, duration: 400, ease: 'inOutSine', loop: 7, alternate: true }, at(1))
  // One add per dot, placed 70 ms apart: with a stagger `delay`, `loop` repeats the whole staggered animation (delays included)
  // as one iteration, so the dots would each swing once and then wait for the slowest.
  root.querySelectorAll('.rest').forEach((dot, i) => {
    tl.add(dot, { translateY: [-110, 110], duration: 400, ease: 'inOutSine', loop: 7, alternate: true }, at(1) + (i + 1) * 70)
  })
  return tl
})
