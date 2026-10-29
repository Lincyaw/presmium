import { defineScene } from '@lincyaw/addon-motion/scene'
import { frame, TYPE } from '../../../lengths/scenes/kit/frame.ts'
import { alpha } from '../../../lengths/scenes/kit/d3-fx.ts'
import { accentGlow } from '../../../lengths/scenes/kit/fx/theme.ts'

// Oscilloscope, drawn on a canvas: a beam sweeps a signal across a 10 × 8 graticule and leaves a fading phosphor
// trace; then the signal's frequency is turned up and the trace packs more cycles into the same screen.
// `screen` (1.2 s): the graticule fades in from the centre lines outwards, the readout (waveform, frequency, time
// base, volts per division) appears; no signal yet, so the reader learns the axes: time across, voltage up.
// `trace` (2.5 s): the beam starts at the left and draws the signal at the time base's speed (0.1 s per division,
// one second a sweep: slow enough to see that a trace is a moving dot). The phosphor glows where the beam has been
// and fades as exp(−age / τ); it is brighter where the beam moves slowly (the same energy on a shorter path).
// `change` (2.5 s): over 1.2 s the frequency ramps from `from` to `to` while the readout counts with it; the next
// sweeps show more, tighter cycles. The rest of the state keeps sweeping: a hold that lives.
// Each sweep is triggered: it starts when the signal next crosses zero upwards after the previous sweep ends, so
// the picture stands still from sweep to sweep. The sweep starts and the signal's phase (the integral of the
// frequency, in closed form for the ramp) are computed at build; a frame redraws the tail backwards from its time,
// so any seek is exact. Adapted from HyperFrames oscilloscope-trace.
type Wave = 'sine' | 'square' | 'triangle'
const DIV_X = 10, DIV_Y = 8

export default defineScene(({ root, at, durations, color, parameters, width, height }) => {
  const wave = (['sine', 'square', 'triangle'].includes(parameters.waveform as string) ? parameters.waveform : 'sine') as Wave
  const f1 = Number(parameters.from ?? 2), f2 = Number(parameters.to ?? 5)
  const amp = Math.min(3.8, Number(parameters.amplitude ?? 3))          // in divisions
  const tau = Number(parameters.persistence ?? 450) / 1000                 // phosphor decay constant, s
  const timebase = 0.1                                                     // s per division
  const sweep = DIV_X * timebase
  const names: Record<Wave, string> = { sine: '正弦波', square: '方波', triangle: '三角波' }
  frame(root, `
    .osc canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
    .osc__read { position: absolute; left: 72cqw; top: 14cqh; width: 23cqw; display: flex; flex-direction: column; gap: 1.6cqh; font-size: ${TYPE.label}cqw; }
    .osc__read > div { display: flex; justify-content: space-between; border-bottom: 0.12cqw solid var(--pm-color-line); padding-bottom: 0.8cqh; color: var(--pm-color-muted); }
    .osc__read b { font: 500 ${TYPE.label}cqw/1.2 var(--pm-font-mono); font-variant-numeric: tabular-nums; color: var(--pm-color-ink); }
    .osc__read .hz { color: var(--pm-color-accent); }
  `, `<div class="osc"><canvas></canvas><div class="osc__read">
      <div><span>波形</span><b>${names[wave]}</b></div>
      <div><span>频率</span><b class="hz">${f1.toFixed(1)} Hz</b></div>
      <div><span>时基</span><b>${timebase * 1000} ms/格</b></div>
      <div><span>幅度</span><b>1 V/格</b></div></div></div>`)
  const canvas = root.querySelector('canvas')!
  const ctx = canvas.getContext('2d')!
  const read = root.querySelector<HTMLElement>('.osc__read')!
  const hz = root.querySelector<HTMLElement>('.hz')!

  // Times in seconds on the scene's timeline.
  const tBeam = at(1) / 1000, tRamp = at(2) / 1000 + 0.15, ramp = 1.2, end = at(durations.length) / 1000
  const freq = (t: number) => (t < tRamp ? f1 : t > tRamp + ramp ? f2 : f1 + (f2 - f1) * (t - tRamp) / ramp)
  // The signal's phase in cycles since the beam started: the integral of the frequency, piecewise in closed form.
  const phase = (t: number) => {
    const a = Math.max(0, Math.min(t, tRamp) - tBeam)
    const r = Math.max(0, Math.min(t, tRamp + ramp) - tRamp)
    const b = Math.max(0, t - tRamp - ramp)
    return f1 * a + (f1 * r + (f2 - f1) * r * r / (2 * ramp)) + f2 * b
  }
  const signal = (t: number) => {
    const p = phase(t)
    if (wave === 'square') return Math.tanh(8 * Math.sin(2 * Math.PI * p))
    if (wave === 'triangle') return (2 / Math.PI) * Math.asin(Math.sin(2 * Math.PI * p))
    return Math.sin(2 * Math.PI * p)
  }
  // Sweep starts: the first at the beam's start, each next one at the next whole cycle after the previous sweep.
  const starts: number[] = []
  for (let s = tBeam; s < end + sweep; ) {
    starts.push(s)
    const target = Math.ceil(phase(s + sweep) + 1e-9)
    let lo = s + sweep, hi = lo + 2 / Math.min(f1, f2)
    for (let i = 0; i < 50; i++) { const mid = (lo + hi) / 2; if (phase(mid) < target) lo = mid; else hi = mid }
    s = hi
  }
  const sweepOf = (t: number) => { let k = -1; for (let i = 0; i < starts.length && starts[i]! <= t; i++) k = i; return k }

  let w = width, h = height
  const draw = (ms: number) => {
    const dpr = window.devicePixelRatio || 1
    const box = root.getBoundingClientRect()
    const scale = box.width > 0 ? box.width / w : 1
    const pw = Math.max(1, Math.round(w * dpr * scale)), phx = Math.max(1, Math.round(h * dpr * scale))
    if (canvas.width !== pw || canvas.height !== phx) { canvas.width = pw; canvas.height = phx }
    const W = canvas.width, H = canvas.height
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, W, H)
    const div = W * 0.062, sx = W * 0.05, sw = div * DIV_X, sh = div * DIV_Y, sy = (H - sh) / 2, cy = sy + sh / 2
    const t = ms / 1000
    // The screen and its graticule: centre lines first, then the others outwards.
    const g = Math.min(1, t / 0.9)
    ctx.fillStyle = color('code'); ctx.strokeStyle = color('line-strong'); ctx.lineWidth = Math.max(1, W * 0.0012)
    ctx.beginPath(); ctx.roundRect(sx - div * 0.3, sy - div * 0.3, sw + div * 0.6, sh + div * 0.6, div * 0.25); ctx.fill(); ctx.stroke()
    for (let i = 0; i <= DIV_X; i++) {
      const o = Math.max(0, Math.min(1, g * 2.2 - Math.abs(i - DIV_X / 2) / (DIV_X / 2)))
      ctx.strokeStyle = alpha(color(i === DIV_X / 2 ? 'line-strong' : 'line'), o)
      ctx.beginPath(); ctx.moveTo(sx + i * div, sy); ctx.lineTo(sx + i * div, sy + sh); ctx.stroke()
    }
    for (let j = 0; j <= DIV_Y; j++) {
      const o = Math.max(0, Math.min(1, g * 2.2 - Math.abs(j - DIV_Y / 2) / (DIV_Y / 2)))
      ctx.strokeStyle = alpha(color(j === DIV_Y / 2 ? 'line-strong' : 'line'), o)
      ctx.beginPath(); ctx.moveTo(sx, sy + j * div); ctx.lineTo(sx + sw, sy + j * div); ctx.stroke()
    }
    read.style.opacity = String(Math.max(0, Math.min(1, (t - 0.4) / 0.4)))
    hz.textContent = `${freq(t).toFixed(1)} Hz`
    if (t <= tBeam) return
    // The tail: the beam's path from t − 3τ to t, segment by segment, each as bright as exp(−age/τ) and the
    // inverse of its length; the retrace between sweeps is blanked.
    const accent = color('accent')
    const steps = Math.max(240, Math.round(3 * tau * 700))
    const dt = (3 * tau) / steps
    const beam = (u: number) => {
      const k = sweepOf(u)
      const x = sx + Math.min(1, (u - starts[k]!) / sweep) * sw
      return { k, x, y: cy - signal(u) * amp * div, inside: u - starts[k]! <= sweep }
    }
    const segs: [number, number, number, number, number][] = []
    let prev = beam(t)
    const minLen = (sw / sweep) * dt
    for (let i = 1; i <= steps; i++) {
      const u = t - i * dt
      if (u < tBeam) break
      const cur = beam(u)
      if (cur.k === prev.k && cur.inside && prev.inside) {
        const len = Math.hypot(prev.x - cur.x, prev.y - cur.y)
        segs.push([prev.x, prev.y, cur.x, cur.y, Math.exp(-(i * dt) / tau) * Math.min(1, Math.max(0.25, minLen / Math.max(len, 1e-6)))])
      }
      prev = cur
    }
    // Two passes, no canvas blur: a wide faint halo (weaker on the light page, where a halo muddies), then the core.
    const halo = accentGlow(color('bg'), 0.12, 0.22)
    for (const [width, strength] of [[div * 0.2, halo], [div * 0.045, 1]] as const) {
      // Butt caps on the halo: round caps would overlap at every joint and bead the faint line.
      ctx.lineCap = strength < 1 ? 'butt' : 'round'
      ctx.lineWidth = width
      for (const [x0, y0, x1, y1, a] of segs) {
        ctx.strokeStyle = alpha(accent, a * strength)
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke()
      }
    }
    // The beam's spot.
    const spot = beam(t)
    if (spot.inside) {
      ctx.fillStyle = alpha(accent, halo * 1.5)
      ctx.beginPath(); ctx.arc(spot.x, spot.y, div * 0.2, 0, 2 * Math.PI); ctx.fill()
      ctx.fillStyle = accent
      ctx.beginPath(); ctx.arc(spot.x, spot.y, div * 0.07, 0, 2 * Math.PI); ctx.fill()
    }
  }
  return {
    seek: draw,
    resize(nw: number, nh: number) { w = nw; h = nh },
  }
})
