import { gsapScene } from '@lincyaw/addon-motion/scene'
import { frame, pick } from '../../../lengths/scenes/kit/frame.ts'

// Outline callout, with GSAP: in a figure that is already there, a pen circles the one part that matters, and only
// then does the rest step back. Two states. `table` (0.9 s): the header and the rows enter, 60 ms apart, so the
// viewer first reads the whole comparison. `circle` (2.6 s): 0.1–0.7 s a rounded outline draws clockwise around
// the chosen row from its top-left corner (power2.inOut), its leading end a bright dot riding the same progress;
// 0.7 s: the outline closes and a ring spreads from it once (the closure's reaction); 0.75–1.05 s the other rows
// step back to 35% and the chosen row's values take the accent: the outline is the cause, the dimming its effect.
// Then the hold. The caption names the data's source, or says it is illustrative. Use it on any table, legend or
// list where one row is the claim. Adapted from HyperFrames outline-draw.
interface Row { cells: string[] }

const W = 1280, H = 720, X0 = 230, X1 = 1050, TOP = 120, ROW = 92

export default gsapScene(({ root, gsap, at, color, parameters }) => {
  const header = (parameters.header as string[] | undefined) ?? ['方法', 'ImageNet top-1 (%)']
  const rows = (parameters.rows as Row[] | undefined) ?? [
    { cells: ['ResNet-50 基线', '76.1'] }, { cells: ['+ 数据增强', '77.4'] }, { cells: ['+ 标签平滑', '77.9'] }, { cells: ['+ 两者结合', '78.6'] },
  ]
  const chosen = (parameters.pick as number | undefined) ?? 3
  const caption = (parameters.caption as string | undefined) ?? '示意数据'
  const cy = (i: number) => TOP + ROW * (i + 1) + ROW / 2
  const y0 = cy(chosen) - 40, y1 = cy(chosen) + 40, x0 = X0 - 24, x1 = X1 + 24, r = 24
  const box = (m: number) => { const x0 = X0 - 24 - m, x1 = X1 + 24 + m, y0 = cy(chosen) - 40 - m, y1 = cy(chosen) + 40 + m, r = 24 + m
    return `M ${x0 + r} ${y0} H ${x1 - r} A ${r} ${r} 0 0 1 ${x1} ${y0 + r} V ${y1 - r} A ${r} ${r} 0 0 1 ${x1 - r} ${y1} H ${x0 + r} A ${r} ${r} 0 0 1 ${x0} ${y1 - r} V ${y0 + r} A ${r} ${r} 0 0 1 ${x0 + r} ${y0} Z` }
  const outline = `M ${x0 + r} ${y0} H ${x1 - r} A ${r} ${r} 0 0 1 ${x1} ${y0 + r} V ${y1 - r} A ${r} ${r} 0 0 1 ${x1 - r} ${y1} H ${x0 + r} A ${r} ${r} 0 0 1 ${x0} ${y1 - r} V ${y0 + r} A ${r} ${r} 0 0 1 ${x0 + r} ${y0} Z`
  frame(root, `
    .oc { position: absolute; inset: 0; width: 100%; height: 100%; font-family: var(--pm-font-sans); }
    .oc__caption { position: absolute; left: 0; right: 0; top: 90cqh; text-align: center; }
  `, `<svg class="oc" viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <g class="oc__row oc__head">
      <text x="${X0}" y="${TOP + 56}" font-size="30" font-weight="600" fill="var(--pm-color-muted)">${header[0]}</text>
      <text x="${X1}" y="${TOP + 56}" text-anchor="end" font-size="30" font-weight="600" fill="var(--pm-color-muted)">${header[1]}</text>
      <line x1="${X0}" x2="${X1}" y1="${TOP + ROW}" y2="${TOP + ROW}" stroke="var(--pm-color-line-strong)" stroke-width="3" />
    </g>
    ${rows.map((row, i) => `<g class="oc__row oc__body">
      <text class="oc__name" x="${X0}" y="${cy(i) + 12}" font-size="36" font-weight="${i === chosen ? 700 : 500}" fill="var(--pm-color-ink)">${row.cells[0]}</text>
      <text class="oc__value" x="${X1}" y="${cy(i) + 12}" text-anchor="end" font-size="38" font-weight="500" font-family="var(--pm-font-mono)" fill="var(--pm-color-ink)">${row.cells[1]}</text>
      ${i < rows.length - 1 ? `<line x1="${X0}" x2="${X1}" y1="${cy(i) + ROW / 2}" y2="${cy(i) + ROW / 2}" stroke="var(--pm-color-line)" stroke-width="2" />` : ''}
    </g>`).join('')}
    <path class="oc__ring" fill="none" stroke="var(--pm-color-accent)" stroke-width="5" />
    <path class="oc__outline" d="${outline}" fill="none" stroke="var(--pm-color-accent)" stroke-width="6" stroke-linecap="round" />
    <circle class="oc__dot" r="9" fill="var(--pm-color-sheen)" stroke="var(--pm-color-accent)" stroke-width="4" />
  </svg><div class="lf-caption oc__caption">${caption}</div>`)

  const S = (k: number) => at(k) / 1000
  const tl = gsap.timeline()
  const all = gsap.utils.toArray<SVGGElement>('.oc__row', root)
  const body = gsap.utils.toArray<SVGGElement>('.oc__body', root)
  const path = pick<SVGPathElement>(root, '.oc__outline'), head = pick<SVGCircleElement>(root, '.oc__dot')
  const len = path.getTotalLength()

  // table
  gsap.set(all, { autoAlpha: 0, y: 14 })
  tl.to(all, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'expo.out', stagger: 0.06 }, 0.05)
  gsap.set('.oc__caption', { autoAlpha: 0 })
  tl.to('.oc__caption', { autoAlpha: 1, duration: 0.3, ease: 'power1.out' }, 0.45)

  // circle: the outline and its bright end share one progress
  const t = S(1) + 0.1
  const render = (p: number) => {
    path.style.strokeDasharray = `${len * p} ${len}`
    path.style.visibility = p > 0.001 ? 'visible' : 'hidden'
    const pt = path.getPointAtLength(len * p)
    head.setAttribute('cx', String(pt.x)); head.setAttribute('cy', String(pt.y))
    head.style.opacity = p > 0.001 && p < 0.999 ? '1' : '0'
  }
  render(0)
  tl.to({ p: 0 }, { p: 1, duration: 0.6, ease: 'power2.inOut', modifiers: { p: (v: number) => { render(+v); return v } } }, t)
  // The ring grows by the same margin on every side (its path, not a scale, so the corners stay round).
  const ring = pick<SVGPathElement>(root, '.oc__ring')
  const grow = (m: number) => { ring.setAttribute('d', box(m)); ring.style.opacity = String(m > 0 ? 0.8 * (1 - m / 30) : 0) }
  grow(0)
  tl.to({ m: 0 }, { m: 30, duration: 0.4, ease: 'power2.out', modifiers: { m: (v: number) => { grow(+v); return v } } }, t + 0.6)
  tl.to(body.filter((_, i) => i !== chosen), { autoAlpha: 0.35, duration: 0.3, ease: 'power1.inOut' }, t + 0.65)
  tl.to(body[chosen]!.querySelectorAll('text'), { fill: color('accent'), duration: 0.3, ease: 'power1.out' }, t + 0.65)
  return tl
})
