import { gsapScene } from '@lincyaw/addon-motion/scene'
import { frame } from '../../../lengths/scenes/kit/frame.ts'
import { mulberry32, range } from '../../../lengths/scenes/kit/fx/random.ts'

// Surround, with GSAP: too many things close in on one calm subject; the problem shot before an answer. Three
// states. `subject` (0.8 s): the subject card rises into the middle and is read alone. `crowd` (2.4 s): chips fly in
// from beyond the frame's edge along the line to the centre and land on a ring around it, each with a small seeded
// tilt; the arrivals come faster and faster (start times go as the square root of the index, flights shorten from
// 0.6 to 0.35 s), so the pressure is felt in the rhythm rather than told. Every landing darkens the frame's edges a
// step and pulls the subject's outline a step towards the warning colour: the impact gets its reaction, and the
// subject itself never moves, so it stays legible in the chaos. `close` (2.2 s): 0–0.6 s the whole ring tightens
// towards the subject (power3.inOut), the edges darken to their deepest and the outline turns fully to warning;
// then a hold in which the ring breathes inward by 1%, so the crowded frame stays alive for the next shot's answer.
// The subject never zooms: it is surrounded, not approached. Adapted from HyperFrames radial-surround (with
// overwhelm-surround's accelerating arrivals).
const W = 1280, H = 720, CX = W / 2, CY = H / 2, RX = 470, RY = 262

export default gsapScene(({ root, gsap, at, color, parameters }) => {
  const subject = (parameters.subject as string | undefined) ?? '初学者'
  const chips = (parameters.chips as string[] | undefined) ?? ['线性代数', '概率论', '反向传播', '损失函数', '优化器', '正则化', '超参数', '梯度消失', '过拟合', '批归一化', '注意力', '微调']
  const seed = (parameters.seed as number | undefined) ?? 11
  const rng = mulberry32(seed)
  const n = chips.length
  const placed = chips.map((label, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n + range(rng, -0.12, 0.12)
    const r = i % 2 ? 0.8 : 1
    const w = 36 + label.length * 26
    return { label, w, x: RX * r * Math.cos(a), y: RY * r * Math.sin(a), tilt: range(rng, -7, 7) }
  })
  frame(root, `
    .sr { position: absolute; inset: 0; width: 100%; height: 100%; font-family: var(--pm-font-sans); }
    .sr__chip, .sr__subject, .sr__ring { transform-box: fill-box; transform-origin: center; }
    .sr__vignette { position: absolute; inset: 0; background: radial-gradient(ellipse at center, transparent 38%, var(--pm-color-backdrop) 100%); opacity: 0; }
  `, `<div class="sr__vignette"></div><svg class="sr" viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <g class="sr__subject">
      <rect class="sr__card" x="${CX - 140}" y="${CY - 64}" width="280" height="128" rx="24" fill="var(--pm-color-surface)" stroke="var(--pm-color-accent)" stroke-width="5" />
      <circle cx="${CX}" cy="${CY - 22}" r="14" fill="none" stroke="var(--pm-color-ink)" stroke-width="4" />
      <path d="M ${CX - 26} ${CY + 18} Q ${CX} ${CY - 8} ${CX + 26} ${CY + 18}" fill="none" stroke="var(--pm-color-ink)" stroke-width="4" stroke-linecap="round" />
      <text x="${CX}" y="${CY + 50}" text-anchor="middle" font-size="26" font-weight="600" fill="var(--pm-color-ink)">${subject}</text>
    </g>
    <g class="sr__ring">${placed.map(c => `<g transform="translate(${CX} ${CY})"><g class="sr__chip">
      <rect x="${-c.w / 2}" y="-26" width="${c.w}" height="52" rx="26" fill="var(--pm-color-surface)" stroke="var(--pm-color-line-strong)" stroke-width="2.5" />
      <text x="0" y="9" text-anchor="middle" font-size="25" font-weight="500" fill="var(--pm-color-ink)">${c.label}</text>
    </g></g>`).join('')}</g>
  </svg>`)

  const S = (k: number) => at(k) / 1000
  const tl = gsap.timeline()
  const els = gsap.utils.toArray<SVGGElement>('.sr__chip', root)

  // subject
  gsap.set('.sr__subject', { autoAlpha: 0, y: 24 })
  tl.to('.sr__subject', { autoAlpha: 1, y: 0, duration: 0.45, ease: 'expo.out' }, 0.1)

  // crowd: arrivals accelerate; each landing is answered by the edges and the subject's outline
  const t1 = S(1), span = S(2) - S(1) - 0.45
  const warn = gsap.utils.interpolate(color('accent'), color('warn'))
  placed.forEach((c, i) => {
    const el = els[i]!
    const u = n > 1 ? i / (n - 1) : 0
    const fly = 0.6 - 0.25 * u
    const land = t1 + span * Math.sqrt(u) + fly
    gsap.set(el, { x: c.x * 3, y: c.y * 3, rotation: c.tilt * 3, autoAlpha: 1 })
    tl.to(el, { x: c.x, y: c.y, rotation: c.tilt, duration: fly, ease: 'power3.out' }, land - fly)
    tl.to('.sr__vignette', { opacity: 0.55 * (i + 1) / n, duration: 0.25, ease: 'power2.out' }, land - 0.12)
    tl.to('.sr__card', { stroke: warn(0.6 * (i + 1) / n), duration: 0.25, ease: 'power2.out' }, land - 0.12)
  })

  // close: the ring tightens, then breathes
  const t2 = S(2), hold = (at(3) - at(2)) / 1000
  placed.forEach((c, i) => {
    tl.to(els[i]!, { x: c.x * 0.66, y: c.y * 0.7, rotation: c.tilt * 1.4, duration: 0.6, ease: 'power3.inOut' }, t2)
  })
  tl.to('.sr__vignette', { opacity: 1, duration: 0.6, ease: 'power2.inOut' }, t2)
  tl.to('.sr__card', { stroke: color('warn'), duration: 0.6, ease: 'power2.inOut' }, t2)
  tl.to('.sr__ring', { scale: 0.99, duration: hold - 0.6, ease: 'sine.inOut' }, t2 + 0.6)
  return tl
})
