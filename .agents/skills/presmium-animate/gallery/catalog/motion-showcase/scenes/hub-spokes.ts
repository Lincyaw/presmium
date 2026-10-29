import { gsapScene } from '@lincyaw/addon-motion/scene'
import { frame } from '../../../lengths/scenes/kit/frame.ts'

// Hub and spokes, with GSAP: one idea in the middle, its parts named one at a time around it. Three states.
// `hub` (0.8 s): 0–0.45 s the hub rises from 0.92 to 1.04 and settles to 1 (a hero, so 4% overshoot); a ring
// spreads from it once. `spokes` (0.7 s per part): every 0.7 s a spoke draws from the hub's edge to its part
// (0.4 s, power2.inOut), the hub gives a 3% kick as the spoke leaves, and only when the line arrives does its part
// enter and light up in the accent: cause before effect. The part lit before goes back to calm as the next spoke
// leaves, so one thing is in focus at a time and the order of the parts is the order of the narration. `hold`
// (2 s): every part comes back to the same weight, the spokes deepen to one colour, and the whole figure breathes
// by 1%, a lockup that is read as one picture. The parts sit on an ellipse, starting at twelve o'clock and going
// clockwise, so reading order and drawing order agree. Adapted from HyperFrames constellation-hub.
const W = 1280, H = 720, CX = W / 2, CY = H / 2 + 10, RX = 430, RY = 238, HUB = 96

export default gsapScene(({ root, gsap, at, color, parameters }) => {
  const hub = (parameters.hub as string | undefined) ?? 'Transformer'
  const parts = (parameters.parts as string[] | undefined) ?? ['自注意力', '前馈网络', '残差连接', '层归一化', '位置编码']
  const n = parts.length
  const nodes = parts.map((label, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / n
    const x = CX + RX * Math.cos(a), y = CY + RY * Math.sin(a)
    const w = Math.max(150, 40 + label.length * 34), h = 70
    // The spoke ends where it meets the part's box, so it touches the edge instead of hiding under it.
    const dx = x - CX, dy = y - CY, len = Math.hypot(dx, dy)
    const sx = CX + (dx / len) * (HUB + 6)
    const sy = CY + (dy / len) * (HUB + 6)
    const k = Math.min((w / 2 + 8) / Math.abs(dx || 1e-6), (h / 2 + 8) / Math.abs(dy || 1e-6))
    const ex = x - dx * Math.min(k, 1), ey = y - dy * Math.min(k, 1)
    return { label, x, y, w, h, d: `M ${sx.toFixed(1)} ${sy.toFixed(1)} L ${ex.toFixed(1)} ${ey.toFixed(1)}` }
  })
  frame(root, `
    .hs { position: absolute; inset: 0; width: 100%; height: 100%; font-family: var(--pm-font-sans); }
    .hs__g, .hs__hub, .hs__node { transform-box: fill-box; transform-origin: center; }
  `, `<svg class="hs" viewBox="0 0 ${W} ${H}" aria-hidden="true"><g class="hs__g">
    ${nodes.map(nd => `<path class="hs__spoke" d="${nd.d}" fill="none" stroke="var(--pm-color-line-strong)" stroke-width="3" stroke-linecap="round" />`).join('')}
    <circle class="hs__ring" cx="${CX}" cy="${CY}" r="${HUB}" fill="none" stroke="var(--pm-color-accent)" stroke-width="4" />
    <g class="hs__hub">
      <circle cx="${CX}" cy="${CY}" r="${HUB}" fill="var(--pm-color-accent)" />
      <text x="${CX}" y="${CY + 11}" text-anchor="middle" font-size="${hub.length > 8 ? 26 : 32}" font-weight="700" fill="var(--pm-color-on-accent)">${hub}</text>
    </g>
    ${nodes.map(nd => `<g class="hs__node">
      <rect class="hs__box" x="${nd.x - nd.w / 2}" y="${nd.y - nd.h / 2}" width="${nd.w}" height="${nd.h}" rx="35" fill="var(--pm-color-surface)" stroke="var(--pm-color-line-strong)" stroke-width="3" />
      <text class="hs__label" x="${nd.x}" y="${nd.y + 11}" text-anchor="middle" font-size="30" font-weight="600" fill="var(--pm-color-ink)">${nd.label}</text>
    </g>`).join('')}
  </g></svg>`)

  const S = (k: number) => at(k) / 1000
  const tl = gsap.timeline()
  const spokes = gsap.utils.toArray<SVGPathElement>('.hs__spoke', root)
  const boxes = gsap.utils.toArray<SVGRectElement>('.hs__box', root)
  const groups = gsap.utils.toArray<SVGGElement>('.hs__node', root)
  const labels = gsap.utils.toArray<SVGTextElement>('.hs__label', root)

  // hub
  gsap.set('.hs__hub', { autoAlpha: 0, scale: 0.92 })
  tl.to('.hs__hub', { keyframes: [
    { autoAlpha: 1, scale: 1.04, duration: 0.3, ease: 'power2.out' },
    { scale: 1, duration: 0.3, ease: 'power2.inOut' },
  ] }, 0.05)
  tl.fromTo('.hs__ring', { autoAlpha: 0.8, attr: { r: HUB, 'stroke-width': 6 } },
    { autoAlpha: 0, attr: { r: HUB + 60, 'stroke-width': 1 }, duration: 0.5, ease: 'power2.out', immediateRender: false }, 0.3)
  gsap.set('.hs__ring', { autoAlpha: 0 })

  // spokes: one part at a time
  const t1 = S(1), beat = (S(2) - S(1)) / n
  gsap.set(spokes, { drawSVG: '0%' })
  gsap.set(groups, { autoAlpha: 0, scale: 0.9 })
  nodes.forEach((_, i) => {
    const t = t1 + i * beat
    tl.to('.hs__hub', { keyframes: [{ scale: 0.97, duration: 0.08, ease: 'power2.out' }, { scale: 1, duration: 0.3, ease: 'back.out(3)' }] }, t)
    tl.to(spokes[i]!, { drawSVG: '100%', stroke: color('accent'), duration: 0.4, ease: 'power2.inOut' }, t)
    tl.to(groups[i]!, { autoAlpha: 1, scale: 1, duration: 0.35, ease: 'back.out(2)' }, t + 0.36)
    tl.to(boxes[i]!, { fill: color('accent-soft'), stroke: color('accent'), duration: 0.2, ease: 'power1.out' }, t + 0.36)
    tl.to(labels[i]!, { fill: color('accent'), duration: 0.2, ease: 'power1.out' }, t + 0.36)
    if (i > 0) {
      tl.to(boxes[i - 1]!, { fill: color('surface'), stroke: color('line-strong'), duration: 0.3, ease: 'power1.inOut' }, t)
      tl.to(labels[i - 1]!, { fill: color('ink'), duration: 0.3, ease: 'power1.inOut' }, t)
      tl.to(spokes[i - 1]!, { stroke: color('line-strong'), duration: 0.3, ease: 'power1.inOut' }, t)
    }
  })

  // hold: one lockup, breathing
  const t2 = S(2), hold = (at(3) - at(2)) / 1000
  tl.to(boxes[n - 1]!, { fill: color('surface'), stroke: color('line-strong'), duration: 0.4, ease: 'power1.inOut' }, t2)
  tl.to(labels[n - 1]!, { fill: color('ink'), duration: 0.4, ease: 'power1.inOut' }, t2)
  tl.to(spokes, { stroke: color('accent'), strokeOpacity: 0.55, duration: 0.4, ease: 'power1.inOut' }, t2)
  tl.to('.hs__g', { scale: 1.01, duration: hold, ease: 'sine.inOut' }, t2)
  return tl
})
