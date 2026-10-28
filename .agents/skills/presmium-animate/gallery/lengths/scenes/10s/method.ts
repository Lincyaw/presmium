import { animeScene } from '@lincyaw/addon-motion/scene'
import { frame } from '../kit/frame.ts'

// A method in one figure (the Transformer encoder), with Anime.js: three words, an "×6", and the rest is
// shapes. `input`: the input tokens arrive as coloured squares. `build`: the blocks are outlined left to right and
// linked, in the order data passes through them. `flow`: a pulse travels the pipeline; each block fills as it
// passes, and inside the attention block every token connects to every other at once, the idea of the paper.
// `stack`: two shadow copies slide out behind the middle blocks and "×6" pops: the block is repeated. `hold`: the
// output tokens arrive, tinted like the inputs but mixed, because each now carries the others.
const BLOCKS = [
  { label: '嵌入', x: 300, w: 150 },
  { label: '自注意力', x: 520, w: 230, key: true },
  { label: '前馈', x: 820, w: 150 },
]
const TINTS = ['accent', 'warn', 'ok']

export default animeScene(({ root, anime, at, color, parameters }) => {
  const labels = (parameters.labels as string[] | undefined) ?? BLOCKS.map(b => b.label)
  const ink = color('ink'), accent = color('accent'), soft = color('accent-soft'), line = color('line-strong'), sunk = color('sunk')
  const tint = TINTS.map(t => color(t))
  const Y = 360, H = 150
  const dots = [0, 1, 2].map(i => [BLOCKS[1]!.x + 55 + i * 60, Y + 26] as const)
  frame(root, '', `<svg viewBox="0 0 1280 720" width="100%" height="100%" style="font-family: var(--pm-font-sans)">
    ${[2, 1].map(n => `<g class="me__ghost" data-n="${n}" opacity="0">${BLOCKS.slice(1).map(b => `<rect x="${b.x + n * 14}" y="${Y - H / 2 - n * 14}" width="${b.w}" height="${H}" rx="18" fill="${sunk}" stroke="${line}" stroke-width="2" />`).join('')}</g>`).join('')}
    ${[0, 1, 2].map(i => `<rect class="me__in" x="110" y="${Y - 75 + i * 55}" width="44" height="44" rx="9" fill="${tint[i]}" />`).join('')}
    <path class="me__link" d="M 170 ${Y} H 296" stroke="${accent}" stroke-width="5" fill="none" />
    ${BLOCKS.slice(1).map((b, i) => `<path class="me__link" d="M ${BLOCKS[i]!.x + BLOCKS[i]!.w + 4} ${Y} H ${b.x - 4}" stroke="${accent}" stroke-width="5" fill="none" />`).join('')}
    <path class="me__link" d="M ${BLOCKS[2]!.x + BLOCKS[2]!.w + 4} ${Y} H 1080" stroke="${accent}" stroke-width="5" fill="none" />
    ${BLOCKS.map((b, i) => `<rect class="me__block" data-i="${i}" x="${b.x}" y="${Y - H / 2}" width="${b.w}" height="${H}" rx="18" fill="${soft}" fill-opacity="0" stroke="${line}" stroke-width="3" />
      <text class="me__label" x="${b.x + b.w / 2}" y="${Y - 18}" text-anchor="middle" font-size="30" font-weight="600" fill="${ink}">${labels[i]}</text>`).join('')}
    ${dots.flatMap((p, i) => dots.slice(i + 1).map(q => `<path class="me__arc" d="M ${p[0]} ${p[1]} Q ${(p[0] + q[0]) / 2} ${p[1] - 40 - (q[0] - p[0]) * 0.25} ${q[0]} ${q[1]}" stroke="${accent}" stroke-width="3" fill="none" />`)).join('')}
    ${dots.map(([x, y], i) => `<circle class="me__dot" cx="${x}" cy="${y}" r="11" fill="${tint[i]}" opacity="0" />`).join('')}
    <path class="me__bracket" d="M ${BLOCKS[1]!.x - 16} ${Y + H / 2 + 30} V ${Y + H / 2 + 46} H ${BLOCKS[2]!.x + BLOCKS[2]!.w + 16} V ${Y + H / 2 + 30}" stroke="${ink}" stroke-width="3" fill="none" />
    <text class="me__times" x="${(BLOCKS[1]!.x + BLOCKS[2]!.x + BLOCKS[2]!.w) / 2}" y="${Y + H / 2 + 96}" text-anchor="middle" font-size="40" font-weight="600" fill="${ink}" opacity="0" style="transform-box: fill-box; transform-origin: center">×6</text>
    <circle class="me__pulse" cx="0" cy="0" r="14" fill="${accent}" opacity="0" />
    ${[0, 1, 2].map(i => `<rect class="me__out" x="1100" y="${Y - 75 + i * 55}" width="44" height="44" rx="9" fill="${tint[i]}" stroke="${tint[(i + 1) % 3]}" stroke-width="8" opacity="0" />`).join('')}
    <path class="me__route" d="M 154 ${Y} H 1100" fill="none" stroke="none" />
  </svg>`)
  const tl = anime.createTimeline({ autoplay: false })
  // input
  tl.add('.me__in', { opacity: [0, 1], translateX: ['-40px', '0px'], duration: 450, delay: anime.stagger(90), ease: 'outExpo' }, at(0) + 200)
  // build: outline, then label, then the link to the next block, in data order.
  tl.add(anime.svg.createDrawable('.me__link'), { draw: ['0 0', '0 1'], duration: 300, delay: anime.stagger(550), ease: 'inOutQuad' }, at(1))
  tl.add(anime.svg.createDrawable('.me__block'), { draw: ['0 0', '0 1'], duration: 500, delay: anime.stagger(550), ease: 'inOutCubic' }, at(1) + 250)
  tl.add('.me__label', { opacity: [0, 1], duration: 300, delay: anime.stagger(550) }, at(1) + 550)
  // flow: the pulse along the route; each block fills as the pulse enters it (pulse x = 154 + 946 * progress).
  const route = anime.svg.createMotionPath('.me__route')
  const flow = at(3) - at(2) - 400
  tl.add('.me__pulse', { ...route, opacity: [{ to: 1, duration: 100 }, { to: 1, duration: flow - 200 }, { to: 0, duration: 100 }], duration: flow, ease: 'inOutSine' }, at(2) + 200)
  BLOCKS.forEach((b, i) => {
    const p = (b.x - 154) / 946
    // inOutSine reaches p at acos(1 - 2p) / π of its duration.
    const t = at(2) + 200 + flow * (Math.acos(1 - 2 * p) / Math.PI)
    tl.add(`.me__block[data-i="${i}"]`, { fillOpacity: [0, 1], stroke: [line, accent], duration: 300, ease: 'outQuad' }, t)
    if (b.key) {
      tl.add('.me__dot', { opacity: [0, 1], duration: 200, delay: anime.stagger(60) }, t + 100)
      tl.add(anime.svg.createDrawable('.me__arc'), { draw: ['0 0', '0 1'], duration: 400, ease: 'outCubic' }, t + 300)
    }
  })
  // stack
  tl.add('.me__ghost', { opacity: [0, 1], translateX: ['-14px', '0px'], translateY: ['14px', '0px'], duration: 450, delay: anime.stagger(120), ease: 'outExpo' }, at(3))
  tl.add(anime.svg.createDrawable('.me__bracket'), { draw: ['0 0', '0 1'], duration: 400, ease: 'inOutQuad' }, at(3) + 300)
  tl.add('.me__times', { opacity: [0, 1], scale: [0.5, 1], duration: 400, ease: 'outBack(2)' }, at(3) + 650)
  // hold: the outputs arrive.
  tl.add('.me__out', { opacity: [0, 1], translateX: ['-30px', '0px'], duration: 400, delay: anime.stagger(90), ease: 'outExpo' }, at(4))
  return tl
})
