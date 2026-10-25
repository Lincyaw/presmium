import { animeScene } from '@lincyaw/addon-motion/scene'

// createDrawable on <rect> and <path>: the five stages of a CPU pipeline are outlined, linked, then filled.
// The fill is a separate attribute (fill-opacity) from the outline, so the two never fight over one property.
const STAGES = ['取指 IF', '译码 ID', '执行 EX', '访存 MEM', '写回 WB']

export default animeScene(({ root, anime, at, color }) => {
  const ink = color('ink')
  const accent = color('accent')
  const soft = color('accent-soft')
  const line = color('line-strong')
  const w = 120
  const gap = 32
  const x = (i: number) => 30 + i * (w + gap)
  root.innerHTML = `
    <svg viewBox="0 0 800 450" width="100%" height="100%" style="font-family: var(--pm-font-sans)">
      ${STAGES.map((_, i) => i ? `<path class="link" d="M ${x(i - 1) + w + 2} 225 L ${x(i) - 10} 225" stroke="${accent}" stroke-width="3" fill="none" />
        <path class="head" d="M ${x(i) - 13} 218 L ${x(i) - 2} 225 L ${x(i) - 13} 232 z" fill="${accent}" />` : '').join('')}
      ${STAGES.map((label, i) => `
        <rect class="stage" x="${x(i)}" y="185" width="${w}" height="80" rx="12" fill="${soft}" fill-opacity="0" stroke="${line}" stroke-width="2.5" />
        <text class="name" x="${x(i) + w / 2}" y="233" text-anchor="middle" fill="${ink}" font-size="21" opacity="0">${label}</text>`).join('')}
      <text class="note" x="400" y="340" text-anchor="middle" fill="${ink}" font-size="22" opacity="0">每个时钟周期，一条指令前进一级</text>
    </svg>`
  const tl = anime.createTimeline({ autoplay: false, defaults: { ease: 'inOutQuad' } })
  // Step 0: the outlines and names, left to right.
  tl.add(anime.svg.createDrawable('.stage'), { draw: ['0 0', '0 1'], duration: 700, delay: anime.stagger(120) }, at(0))
  tl.add('.name', { opacity: [0, 1], duration: 300, delay: anime.stagger(120) }, at(0) + 400)
  // Step 1: the links between stages.
  // The arrowheads are separate shapes that appear as each line arrives (a marker-end would show before its line is drawn).
  tl.add(anime.svg.createDrawable('.link'), { draw: ['0 0', '0 1'], duration: 350, delay: anime.stagger(200) }, at(1))
  tl.add('.head', { opacity: [0, 1], duration: 100, delay: anime.stagger(200) }, at(1) + 300)
  // Step 2: the stages fill one per "cycle", and the outline turns the accent color.
  tl.add('.stage', { fillOpacity: [0, 1], stroke: [line, accent], duration: 300, delay: anime.stagger(250) }, at(2))
  tl.add('.note', { opacity: [0, 1], duration: 400 }, at(2) + 1000)
  return tl
})
