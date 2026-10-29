import { gsapScene } from '@lincyaw/addon-motion/scene'
import { frame, pick } from '../../../lengths/scenes/kit/frame.ts'

// Stat gauge, with GSAP: one number and how much of the whole it is, read from one clock. Three states. `setup`
// (0.7 s): the label appears and the empty track draws itself (0.5 s, power2.inOut), so the viewer knows the scale
// (0 to `max`) before any value. `fill` (1.5 s): one tween of a single progress drives both readouts: the arc (or
// bar) fills and the numeral counts up with it, decelerating as power3.out so the last digits settle slowly enough
// to be read; data never overshoots. As the fill lands, a ring spreads from the end of the arc: the arrival gets its
// reaction. `hold` (2 s): 0.1–0.5 s the source fades in under the gauge (a number without its source is not
// shown); then the result holds. Choose `shape: arc` for a share of a whole (a usage, an accuracy) and
// `shape: bar` for a progress along a line. Adapted from HyperFrames mk-progress-stat (with mk-usage-arc).
const W = 1280, H = 720

export default gsapScene(({ root, gsap, at, parameters }) => {
  const value = (parameters.value as number | undefined) ?? 86.4
  const max = (parameters.max as number | undefined) ?? 100
  const decimals = (parameters.decimals as number | undefined) ?? 1
  const unit = (parameters.unit as string | undefined) ?? '%'
  const label = (parameters.label as string | undefined) ?? 'MMLU 准确率 · GPT-4（5-shot）'
  const source = (parameters.source as string | undefined) ?? '数据：OpenAI，GPT-4 技术报告，2023'
  const shape = (parameters.shape as string | undefined) ?? 'arc'
  const arc = shape !== 'bar'
  // The arc: 270° opening downwards; the bar: a line under the numeral.
  const CX = W / 2, CY = 380, R = 200
  const pt = (deg: number) => [CX + R * Math.cos((deg * Math.PI) / 180), CY + R * Math.sin((deg * Math.PI) / 180)]
  const [ax, ay] = pt(135), [bx, by] = pt(45)
  const d = arc ? `M ${ax!.toFixed(1)} ${ay!.toFixed(1)} A ${R} ${R} 0 1 1 ${bx!.toFixed(1)} ${by!.toFixed(1)}` : `M 290 470 L 990 470`
  frame(root, `
    .sg { position: absolute; inset: 0; width: 100%; height: 100%; }
    .sg__num { position: absolute; left: 0; right: 0; top: ${arc ? 41 : 30}cqh; text-align: center; font: 500 ${arc ? 9 : 12}cqw/1 var(--pm-font-mono); font-variant-numeric: tabular-nums; color: var(--pm-color-ink); }
    .sg__unit { font-size: 0.45em; color: var(--pm-color-muted); margin-left: 0.1em; }
    .sg__label { position: absolute; left: 0; right: 0; top: ${arc ? 6 : 16}cqh; text-align: center; }
    .sg__source { position: absolute; left: 0; right: 0; top: 88cqh; text-align: center; }
  `, `<svg class="sg" viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <path class="sg__track" d="${d}" fill="none" stroke="var(--pm-color-sunk)" stroke-width="${arc ? 26 : 22}" stroke-linecap="round" />
    <path class="sg__fill" d="${d}" fill="none" stroke="var(--pm-color-accent)" stroke-width="${arc ? 26 : 22}" stroke-linecap="round" />
    <circle class="sg__ring" r="13" fill="none" stroke="var(--pm-color-accent)" stroke-width="4" />
    ${arc ? '' : `<text x="290" y="520" font-size="24" fill="var(--pm-color-muted)" font-family="var(--pm-font-mono)">0</text><text x="990" y="520" text-anchor="end" font-size="24" fill="var(--pm-color-muted)" font-family="var(--pm-font-mono)">${max}</text>`}
  </svg>
  <div class="lf-lead sg__label">${label}</div>
  <div class="sg__num"><span class="sg__digits">0</span><span class="sg__unit">${unit}</span></div>
  <div class="lf-caption sg__source">${source}</div>`)

  const S = (k: number) => at(k) / 1000
  const tl = gsap.timeline()
  const fill = pick<SVGPathElement>(root, '.sg__fill'), ring = pick<SVGCircleElement>(root, '.sg__ring')
  const digits = pick(root, '.sg__digits')
  const len = fill.getTotalLength()
  const share = Math.max(0, Math.min(1, value / max))
  const end = fill.getPointAtLength(len * share)
  ring.setAttribute('cx', String(end.x)); ring.setAttribute('cy', String(end.y))
  /** Both readouts from one progress p (0..1 of the value). */
  const render = (p: number) => {
    // A round cap draws a dot at zero length, so the fill is hidden until it has length.
    fill.style.strokeDasharray = `${len * share * p} ${len}`
    fill.style.visibility = p > 0.002 ? 'visible' : 'hidden'
    digits.textContent = (value * p).toFixed(decimals)
  }
  render(0)

  // setup
  gsap.set('.sg__label', { autoAlpha: 0, y: 20 })
  tl.to('.sg__label', { autoAlpha: 1, y: 0, duration: 0.45, ease: 'expo.out' }, 0.05)
  tl.fromTo('.sg__track', { drawSVG: '0%' }, { drawSVG: '100%', duration: 0.5, ease: 'power2.inOut' }, 0.15)

  // fill: one clock, two readouts
  const clock = { p: 0 }
  tl.to(clock, { p: 1, duration: 1.2, ease: 'power3.out', modifiers: { p: (v: number) => { render(+v); return v } } }, S(1))
  gsap.set(ring, { autoAlpha: 0 })
  tl.fromTo(ring, { autoAlpha: 0.9, attr: { r: 13 } }, { autoAlpha: 0, attr: { r: 42 }, duration: 0.45, ease: 'power2.out', immediateRender: false }, S(1) + 0.95)

  // hold
  gsap.set('.sg__source', { autoAlpha: 0 })
  tl.to('.sg__source', { autoAlpha: 1, duration: 0.4, ease: 'power1.out' }, S(2) + 0.1)
  return tl
})
