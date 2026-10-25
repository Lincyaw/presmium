import { animeScene } from '@lincyaw/addon-motion/scene'

// Easing functions side by side: the same tween with nine eases (named strings, cubicBezier, steps, spring).
// A spring sets its own duration (its settling time) and ignores `duration`, so it is given a short one to stay inside the step.
// irregular() is left out: it is built from Math.random, so it changes on every load.
export default animeScene(({ root, anime, at, color }) => {
  const lanes: Array<[string, unknown]> = [
    ['linear', 'linear'],
    ['inOutQuad', 'inOutQuad'],
    ['outExpo', 'outExpo'],
    ['inBack', 'inBack'],
    ['outBack', 'outBack'],
    ['outElastic', 'outElastic(1, .5)'],
    ['outBounce', 'outBounce'],
    ['cubicBezier', anime.cubicBezier(0.7, 0, 0.3, 1)],
    ['steps(6)', anime.steps(6)],
    ['spring', anime.spring({ bounce: 0.45, duration: 700 })],
  ]
  const ink = color('ink')
  const muted = color('muted')
  const top = 34
  const gap = 40
  root.innerHTML = `
    <svg viewBox="0 0 800 450" width="100%" height="100%" style="font-family: var(--pm-font-mono)">
      <line x1="230" x2="230" y1="14" y2="436" stroke="${muted}" stroke-dasharray="3 5" />
      <line x1="680" x2="680" y1="14" y2="436" stroke="${muted}" stroke-dasharray="3 5" />
      ${lanes.map(([name], i) => `
        <text x="210" y="${top + i * gap + 6}" text-anchor="end" font-size="17" fill="${ink}">${name}</text>
        <line x1="230" x2="680" y1="${top + i * gap}" y2="${top + i * gap}" stroke="${color('line')}" />
        <g transform="translate(230 ${top + i * gap})"><circle class="dot" r="11" fill="${color('accent')}" /></g>`).join('')}
    </svg>`
  const dots = root.querySelectorAll('.dot')
  const tl = anime.createTimeline({ autoplay: false })
  // Step 0: every dot runs right in 1.4 s with its own ease (the lane leaves room past its end for the overshooting eases).
  lanes.forEach(([, ease], i) => tl.add(dots[i], { translateX: [0, 450], duration: 1400, ease: ease as never }, at(0)))
  // Step 1: and back, so the asymmetric eases show their other side.
  lanes.forEach(([, ease], i) => tl.add(dots[i], { translateX: 0, duration: 1400, ease: ease as never }, at(1)))
  return tl
})
