import { animeScene } from '@lincyaw/addon-motion/scene'

// Keyframes two ways: percentage keyframes ('0%' ... '100%') place a falling ball's heights on one duration,
// duration keyframes (an array per property) squash and stretch it on each impact. Both are plain tweens, so seeking is exact.
// The ball sits in an outer <g> at its x; the animated inner <g> has transform-box: fill-box so it squashes about its own center.
export default animeScene(({ root, anime, at, color }) => {
  const ground = 380
  const r = 34
  root.innerHTML = `
    <svg viewBox="0 0 800 450" width="100%" height="100%" style="font-family: var(--pm-font-sans)">
      <line x1="80" y1="${ground}" x2="720" y2="${ground}" stroke="${color('line-strong')}" stroke-width="3" />
      ${[0, 1, 2, 3].map(k => `<line class="h" x1="560" x2="640" y1="${ground - r - [300, 180, 105, 60][k]}" y2="${ground - r - [300, 180, 105, 60][k]}" stroke="${color('muted')}" stroke-dasharray="4 6" opacity="0" />`).join('')}
      <g transform="translate(400 ${ground - r})">
        <g id="ball" style="transform-box: fill-box; transform-origin: 50% 100%">
          <circle r="${r}" cy="0" fill="${color('accent')}" />
        </g>
      </g>
    </svg>`
  const tl = anime.createTimeline({ autoplay: false })
  // Step 0: dropped from 300 units up, it bounces lower each time: one tween, heights at percentages of its duration.
  tl.add('#ball', {
    keyframes: {
      '0%': { translateY: -300, ease: 'inQuad' },
      '38%': { translateY: 0, ease: 'outQuad' },
      '61%': { translateY: -180, ease: 'inQuad' },
      '79%': { translateY: 0, ease: 'outQuad' },
      '89%': { translateY: -105, ease: 'inQuad' },
      '100%': { translateY: 0 },
    },
    duration: 2200,
  }, at(0))
  tl.add('.h', { opacity: [0, 0.8], duration: 200, delay: anime.stagger(500) }, at(0))
  // Step 1: the same drop with squash and stretch: duration keyframes on scaleX/scaleY, one pair per impact.
  tl.add('#ball', { translateY: -300, duration: 500, ease: 'outQuad' }, at(1))
  tl.add('#ball', {
    keyframes: {
      '0%': { translateY: -300, ease: 'inQuad' },
      '45%': { translateY: 0, ease: 'outQuad' },
      '75%': { translateY: -120, ease: 'inQuad' },
      '100%': { translateY: 0 },
    },
    duration: 1600,
  }, at(1) + 500)
  const impact = (t: number, k: number) => {
    tl.add('#ball', {
      scaleY: [{ to: 1 - 0.35 * k, duration: 90, ease: 'outQuad' }, { to: 1 + 0.12 * k, duration: 120 }, { to: 1, duration: 160, ease: 'outElastic(1, .5)' }],
      scaleX: [{ to: 1 + 0.35 * k, duration: 90, ease: 'outQuad' }, { to: 1 - 0.1 * k, duration: 120 }, { to: 1, duration: 160, ease: 'outElastic(1, .5)' }],
    }, t)
  }
  impact(at(1) + 500 + 0.45 * 1600, 1)
  impact(at(1) + 500 + 1600, 0.6)
  return tl
})
