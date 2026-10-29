import { defineScene } from '@lincyaw/addon-motion/scene'
import { frame, pick } from '../../../lengths/scenes/kit/frame.ts'
import { ease, phase } from '../../../lengths/scenes/kit/fx/time.ts'

// Pendulum settle, drawn from the time: a sign hangs from a pin and swings to rest, and beside it a pen plots the
// angle against time, so the motion and its graph are one mechanism (one clock, two readouts). Three states.
// `release` (0.6 s): the sign is held out at θ₀ and the empty axes draw in (0.45 s), the scale before the motion.
// `swing` (3 s): released, the sign swings as θ(t) = θ₀·e^(−γt)·cos(2πft) about the pin; every pass through
// upright is smaller, and the pen on the right draws the same θ(t) as it goes, the arc at the pin showing the
// current angle. `envelope` (2.4 s): 0–0.6 s the decay envelope ±θ₀·e^(−γt) draws over the curve in the accent,
// dashed; 0.3–0.7 s the formula rises in under the plot; then the hold, in which the sign keeps its last, tiny
// swing (the same function, so the hold lives and is still exact). γ is chosen so the swing falls to 4% by the end of
// `swing`. Without the plot (`plot: false`) it is the hanging-sign entrance for a chapter card. Adapted from
// HyperFrames pendulum-swing.
const W = 1280, H = 720

export default defineScene(({ root, at, parameters }) => {
  const label = (parameters.label as string | undefined) ?? '阻尼振动'
  const theta0 = (parameters.amplitude as number | undefined) ?? 34
  const freq = (parameters.frequency as number | undefined) ?? 1.1
  const formula = (parameters.formula as string | undefined) ?? 'θ(t) = θ₀ · e^(−γt) · cos(2πft)'
  const plot = (parameters.plot as boolean | undefined) ?? true
  const T1 = at(1) / 1000, T2 = at(2) / 1000, span = T2 - T1
  const gamma = Math.log(25) / span
  const theta = (s: number) => (s <= T1 ? theta0 : theta0 * Math.exp(-gamma * (s - T1)) * Math.cos(2 * Math.PI * freq * (s - T1)))
  const PX = plot ? 330 : W / 2, PY = 120, L = 270
  const X0 = 690, X1 = 1190, Y0 = 380, A = 150
  const gx = (s: number) => X0 + ((s - T1) / span) * (X1 - X0)
  const gy = (v: number) => Y0 - (v / theta0) * A
  const env = (sign: number) => Array.from({ length: 61 }, (_, i) => {
    const s = T1 + (span * i) / 60
    return `${i ? 'L' : 'M'} ${gx(s).toFixed(1)} ${gy(sign * theta0 * Math.exp(-gamma * (s - T1))).toFixed(1)}`
  }).join(' ')
  const f = frame(root, `
    .pd { position: absolute; inset: 0; width: 100%; height: 100%; font-family: var(--pm-font-sans); }
    .pd__formula { position: absolute; left: 50cqw; right: 2cqw; top: 82cqh; font-size: 3cqw; text-align: center; font-family: var(--pm-font-serif); font-style: italic; }
  `, `<svg class="pd" viewBox="0 0 ${W} ${H}" aria-hidden="true">
    <line x1="${PX - 90}" y1="${PY}" x2="${PX + 90}" y2="${PY}" stroke="var(--pm-color-line-strong)" stroke-width="6" stroke-linecap="round" />
    <line x1="${PX}" y1="${PY}" x2="${PX}" y2="${PY + L + 40}" stroke="var(--pm-color-line)" stroke-width="2" stroke-dasharray="6 8" />
    <path class="pd__arc" fill="none" stroke="var(--pm-color-accent)" stroke-width="4" stroke-linecap="round" />
    <g class="pd__sign">
      <path d="M ${PX} ${PY} L ${PX - 70} ${PY + L} M ${PX} ${PY} L ${PX + 70} ${PY + L}" fill="none" stroke="var(--pm-color-ink)" stroke-width="3" />
      <rect x="${PX - 130}" y="${PY + L}" width="260" height="110" rx="14" fill="var(--pm-color-surface)" stroke="var(--pm-color-ink)" stroke-width="4" />
      <text x="${PX}" y="${PY + L + 70}" text-anchor="middle" font-size="44" font-weight="700" fill="var(--pm-color-ink)">${label}</text>
    </g>
    <circle cx="${PX}" cy="${PY}" r="10" fill="var(--pm-color-accent)" />
    <g class="pd__plot" ${plot ? '' : 'display="none"'}>
      <path class="pd__axes" d="M ${X0} ${Y0 - A - 30} L ${X0} ${Y0 + A + 30} M ${X0} ${Y0} L ${X1 + 20} ${Y0}" fill="none" stroke="var(--pm-color-line-strong)" stroke-width="3" />
      <text class="pd__axis-label" x="${X0 - 14}" y="${Y0 - A - 40}" text-anchor="end" font-size="28" font-style="italic" fill="var(--pm-color-muted)">θ</text>
      <text class="pd__axis-label" x="${X1 + 24}" y="${Y0 + 34}" font-size="28" font-style="italic" fill="var(--pm-color-muted)">t</text>
      <path class="pd__env" d="${env(1)} ${env(-1)}" fill="none" stroke="var(--pm-color-accent)" stroke-width="3" stroke-dasharray="10 9" />
      <path class="pd__curve" fill="none" stroke="var(--pm-color-ink)" stroke-width="4" stroke-linejoin="round" />
      <circle class="pd__pen" r="8" fill="var(--pm-color-accent)" />
    </g>
  </svg><div class="lf-lead pd__formula">${formula}</div>`)
  const sign = pick<SVGGElement>(f, '.pd__sign'), arc = pick<SVGPathElement>(f, '.pd__arc')
  const axes = pick<SVGPathElement>(f, '.pd__axes'), curve = pick<SVGPathElement>(f, '.pd__curve')
  const pen = pick<SVGCircleElement>(f, '.pd__pen'), envelope = pick<SVGPathElement>(f, '.pd__env')
  const formulaEl = pick(f, '.pd__formula')
  const axisLabels = [...f.querySelectorAll<SVGTextElement>('.pd__axis-label')]
  const axesLen = axes.getTotalLength()
  axes.style.strokeDasharray = `${axesLen} ${axesLen}`

  return (ms: number) => {
    const s = ms / 1000
    const th = theta(s)
    sign.setAttribute('transform', `rotate(${th.toFixed(3)} ${PX} ${PY})`)
    // The arc at the pin shows the angle now: from the dashed vertical to the sign's direction.
    const r = 70, a = Math.PI / 2 + (th * Math.PI) / 180
    const ex = PX + r * Math.cos(a), ey = PY + r * Math.sin(a)
    arc.setAttribute('d', Math.abs(th) < 0.5 ? '' : `M ${PX} ${PY + r} A ${r} ${r} 0 0 ${th > 0 ? 1 : 0} ${ex.toFixed(1)} ${ey.toFixed(1)}`)
    // Axes draw in during `release`.
    const ax = ease.inOut2(phase(s, 0.1, 0.45))
    axes.style.strokeDashoffset = String(axesLen * (1 - ax))
    axisLabels.forEach(t => { t.style.opacity = String(ax) })
    // The pen plots θ up to now (the swing state's span fills the axis).
    const now = Math.min(s, T2)
    const pts: string[] = []
    for (let k = 0; k <= 240; k++) {
      const u = T1 + (span * k) / 240
      if (u > now) break
      pts.push(`${pts.length ? 'L' : 'M'} ${gx(u).toFixed(1)} ${gy(theta(u)).toFixed(1)}`)
    }
    if (s > T1) pts.push(`L ${gx(now).toFixed(1)} ${gy(theta(now)).toFixed(1)}`)
    curve.setAttribute('d', s > T1 ? pts.join(' ') : '')
    pen.setAttribute('cx', String(gx(Math.max(T1, now))))
    pen.setAttribute('cy', String(gy(theta(Math.max(T1, now)))))
    pen.style.opacity = String(ax * (1 - phase(s, T2, 0.3)))
    // The envelope and the formula, after the motion.
    const e = ease.inOut2(phase(s, T2, 0.6))
    envelope.style.clipPath = `inset(0 ${(100 * (1 - e)).toFixed(2)}% 0 0)`
    envelope.style.opacity = e > 0 ? '1' : '0'
    const fm = ease.outExpo(phase(s, T2 + 0.3, 0.4))
    formulaEl.style.opacity = String(plot ? fm : 0)
    formulaEl.style.transform = `translateY(${30 * (1 - fm)}%)`
  }
})
