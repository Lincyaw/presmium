import { defineScene } from '@lincyaw/addon-motion/scene'
import { frame, pick } from '../../../lengths/scenes/kit/frame.ts'
import { mulberry32, range } from '../../../lengths/scenes/kit/fx/random.ts'
import { ease, phase, spring01 } from '../../../lengths/scenes/kit/fx/time.ts'

// Confetti, drawn from the time: a result is reached and the frame celebrates it, once. Two states. `pass`
// (0.7 s): 0.1–0.6 s the badge springs in (scale from 0.6, bounce 0.45: a celebration may overshoot by about 20%).
// `burst` (2.6 s): at the start of the state, as the badge settles, two cannons at the bottom corners fire the
// paper inwards and upwards: cause (the result), then effect (the joy). Each piece follows a closed-form flight with
// drag and gravity, x(t) = x₀ + vₓ(1 − e^(−kt))/k, y(t) = y₀ + v_y(1 − e^(−kt))/k + g·t/k − g(1 − e^(−kt))/k², so it
// shoots out fast, slows, and drifts down at its terminal speed; it spins at its own rate and flutters (its height
// follows a cosine, the paper turning edge-on). The pieces fade only in their last 0.5 s. Every piece's speed, size,
// spin and colour come from a seeded generator, so the burst is the same at every build and every seek. The
// colours are the design's own (accent, ok, warn, danger, the film violet and lamp), content of the picture.
// Adapted from HyperFrames confetti.
const W = 1280, H = 720
const PALETTE = ['accent', 'ok', 'warn', 'danger', 'film-violet', 'film-lamp']

export default defineScene(({ root, at, parameters }) => {
  const text = (parameters.text as string | undefined) ?? '全部 128 个测试通过'
  const count = (parameters.count as number | undefined) ?? 90
  const rng = mulberry32((parameters.seed as number | undefined) ?? 3)
  const G = 700, K = 2.2
  const pieces = Array.from({ length: count }, (_, i) => {
    const side = i % 2 ? 1 : -1
    const a = range(rng, 45, 78) * (Math.PI / 180)
    const v = range(rng, 1150, 1850)
    return {
      x0: side < 0 ? 40 : W - 40, y0: H + 10,
      vx: -side * v * Math.cos(a), vy: -v * Math.sin(a),
      w: range(rng, 10, 18), h: range(rng, 6, 12), spin: range(rng, -720, 720), rot: range(rng, 0, 360),
      flutter: range(rng, 4, 9), phase: range(rng, 0, Math.PI * 2), delay: range(rng, 0, 0.12),
      color: PALETTE[Math.floor(rng() * PALETTE.length)]!,
      round: rng() < 0.25,
    }
  })
  const f = frame(root, `
    .cf { position: absolute; inset: 0; width: 100%; height: 100%; }
    .cf__badge { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: flex; align-items: center; gap: 1.6cqw;
      padding: 2.4cqh 3cqw; border-radius: 99cqw; background: var(--pm-color-ok-soft); color: var(--pm-color-ok); font-size: 3.6cqw; font-weight: 700; white-space: nowrap; }
    .cf__badge svg { width: 4cqw; height: 4cqw; }
  `, `<div class="cf__badge"><svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="var(--pm-color-ok)" /><path d="M 11 21 L 17.5 27 L 29 14" fill="none" stroke="var(--pm-color-ok-soft)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" /></svg><span>${text}</span></div>
    <svg class="cf" viewBox="0 0 ${W} ${H}" aria-hidden="true">${pieces.map(p => p.round
      ? `<circle class="cf__p" r="${(p.w / 2).toFixed(1)}" fill="var(--pm-color-${p.color})" />`
      : `<rect class="cf__p" x="${(-p.w / 2).toFixed(1)}" y="${(-p.h / 2).toFixed(1)}" width="${p.w.toFixed(1)}" height="${p.h.toFixed(1)}" rx="1.5" fill="var(--pm-color-${p.color})" />`).join('')}</svg>`)
  const badge = pick(f, '.cf__badge')
  const els = [...f.querySelectorAll<SVGElement>('.cf__p')]
  const T1 = at(1) / 1000, END = at(2) / 1000

  return (ms: number) => {
    const s = ms / 1000
    const b = spring01(s - 0.1, { duration: 0.5, bounce: 0.45 })
    badge.style.transform = `translate(-50%, -50%) scale(${(0.6 + 0.4 * b).toFixed(4)})`
    badge.style.opacity = String(ease.out2(phase(s, 0.1, 0.15)))
    pieces.forEach((p, i) => {
      const t = s - T1 - p.delay
      const el = els[i]!
      if (t <= 0) { el.style.display = 'none'; return }
      el.style.display = ''
      const e = 1 - Math.exp(-K * t)
      const x = p.x0 + (p.vx * e) / K
      const y = p.y0 + (p.vy * e) / K + (G * t) / K - (G * e) / (K * K)
      const flip = Math.cos(p.phase + p.flutter * t)
      el.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(p.rot + p.spin * t).toFixed(1)}) scale(1 ${flip.toFixed(3)})`)
      el.style.opacity = String(1 - phase(s, END - 0.5, 0.5))
    })
  }
})
