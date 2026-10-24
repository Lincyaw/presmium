// @ts-nocheck: @lincyaw/addon-motion resolves from the deck the tests build (its node_modules link it), not from e2e/.
import { animeScene } from '@lincyaw/addon-motion/scene'

// The compile pipeline drawn with Anime.js: the MyST source, the IR, then the media it renders to.
// The boxes are placed by an outer group, so the animated transform of the inner one only moves them a little.
const OUTPUTS = ['网页', '幻灯片', 'notebook', '视频']

export default animeScene(({ root, anime, at, color }) => {
  const accent = color('accent')
  const ink = color('ink')
  const line = color('line-strong') || '#888'
  const box = (id: string, x: number, y: number, w: number, label: string) => `
    <g transform="translate(${x} ${y})">
      <g class="node" data-node="${id}" style="transform-box: fill-box; transform-origin: center">
        <rect width="${w}" height="56" rx="10" fill="rgba(0,0,0,0)" stroke="${line}" stroke-width="2" />
        <text x="${w / 2}" y="35" text-anchor="middle" fill="${ink}" font-size="20">${label}</text>
      </g>
    </g>`
  const link = (id: string, d: string) => `<path class="link" data-link="${id}" d="${d}" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1" fill="none" stroke="${accent}" stroke-width="3" />`
  root.innerHTML = `
    <svg viewBox="0 0 800 450" width="100%" height="100%" style="font-family: var(--pm-font-sans)">
      ${link('ir', 'M 190 225 C 240 225, 250 225, 300 225')}
      ${OUTPUTS.map((_, i) => link(`out-${i}`, `M 460 225 C 520 225, 520 ${75 + i * 100}, 580 ${75 + i * 100}`)).join('')}
      ${box('source', 30, 197, 160, 'MyST 源码')}
      ${box('ir', 300, 197, 160, 'IR')}
      ${OUTPUTS.map((label, i) => box(`out-${i}`, 580, 47 + i * 100, 170, label)).join('')}
    </svg>`
  const node = (id: string) => root.querySelector(`[data-node="${id}"]`)!
  const outputs = OUTPUTS.map((_, i) => node(`out-${i}`))
  for (const el of [node('ir'), ...outputs]) el.setAttribute('opacity', '0')
  const tl = anime.createTimeline({ autoplay: false, defaults: { ease: 'outQuad' } })
  // Step 0: the source.
  tl.add(node('source'), { opacity: [0, 1], translateX: [-20, 0], duration: 600 }, at(0))
  // Step 1: the compiler turns it into the IR.
  tl.add('[data-link="ir"]', { strokeDashoffset: [1, 0], duration: 600 }, at(1))
  tl.add(node('ir'), { opacity: [0, 1], scale: [0.8, 1], duration: 500 }, at(1) + 500)
  // Step 2: the renderers, one after another.
  tl.add(OUTPUTS.map((_, i) => `[data-link="out-${i}"]`).join(', '), { strokeDashoffset: [1, 0], duration: 600, delay: anime.stagger(150) }, at(2))
  tl.add(outputs, { opacity: [0, 1], translateX: [-16, 0], duration: 400, delay: anime.stagger(150) }, at(2) + 400)
  // Step 3: the video, made from the same lecture.
  tl.add(node('out-3').querySelector('rect')!, { fill: ['rgba(0,0,0,0)', accent], duration: 500 }, at(3))
  tl.add(node('out-3').querySelector('text')!, { fill: [ink, color('bg')], duration: 500 }, at(3))
  return tl
})
