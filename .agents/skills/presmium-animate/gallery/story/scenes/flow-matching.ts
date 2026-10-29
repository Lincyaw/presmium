import { defineScene } from '@lincyaw/addon-motion/scene'
import claude from '../../lengths/scenes/logos/claude-color.svg?raw'
import data from './data/flow-matching.json'

// Flow matching, told the way the 小红书 explainer "将生图路径，拉直！" tells it, with every number from a real
// training run (`data/flow-matching.py`: a 200k-parameter MLP that pushes Gaussian noise onto the Claude logo,
// then Reflow). One picture all the way through: two planes in space-time, noise at t = 0 on the left and the
// target at t = 1 on the right, with each particle's path between them; a time ruler under them. Colours keep one
// meaning: red is the truth (the exact path, the training target), the accent is the network's arrow, warn is what
// the sampler actually walks, ok is the straightened model.
//
// `intro`: the planes, then 2000 particles flow from the noise into the logo. `velocity`: one path; the tangent
// slides along it; the field of arrows on a slice at t = 0.5. `euler`: a cut to that path face on, in space only
// (space-time stretches its bends flat); Euler with 4, 8, 16 and 32 steps, each laid over the last, the end error read
// from the data. `straight`: the chord from start
// to end, walked in one step. `train`: random pairs joined by straight lines; one pair, a random t, the point on
// its line; the target arrow (red) and the network's arrow (accent) as it was at rounds 1 … 30,000, with the loss
// curve and the round counter. `result`: the noise coloured by position flows into the logo, and the colours stay
// in patches. `cross`: the lines through one point at t = 0.5, their directions and the network's arrow, which is
// their average; then the curved paths the model really takes. `reflow`: those paths straighten into the chords of
// their own start and end, and the retrained model's paths lie on them. `onestep`: a cut to two face-on panels,
// one Euler step each: the first model's particles bunch in the middle, the straightened model draws the logo.
// The canvas is drawn in a 1280 × 720 stage scaled to fit; a still at any state's end is that state's result.

interface Data {
  setup: { particles: number, frames: number, rounds1: number, parameters: number }
  m1: string, m2: string, m2frames: number
  euler: { exact: [number, number][], steps: Record<string, { path: [number, number][], error: number }> }
  field: { grid: [number, number][], v: Record<string, [number, number][]> }
  train: { x0: [number, number][], x1: [number, number][], highlight: number, t: number, checkpoints: [number, number, number][], loss: [number, number][] }
  cross: { t: number, point: [number, number], lines: [number, number, number, number][], model: [number, number], count: number }
  straightness: { m1: number, m2: number }
  onestep: Record<string, { points: string, error: number }>
}
type V = [number, number]

const D = data as unknown as Data
const unpack = (b64: string) => {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
  const ints = new Int16Array(bytes.buffer)
  return Float32Array.from(ints, v => v / 10000)
}

export default defineScene(({ root, at, color, width, height }) => {
  const N = D.setup.particles, F = D.setup.frames
  const m1 = unpack(D.m1), m2 = unpack(D.m2), F2 = D.m2frames
  const one1 = unpack(D.onestep['m1-1']!.points), one2 = unpack(D.onestep['m2-1']!.points)
  const logo = new Path2D(claude.match(/\sd="([^"]+)"/)![1]!)
  const css = getComputedStyle(root)
  const sans = css.getPropertyValue('--pm-font-sans').trim() || 'sans-serif'
  const mono = css.getPropertyValue('--pm-font-mono').trim() || 'monospace'
  const C = Object.fromEntries(['bg', 'ink', 'muted', 'line', 'line-strong', 'sunk', 'accent', 'warn', 'ok', 'danger', 'surface'].map(n => [n, color(n)]))
  const rgba = (c: string, a: number) => c.replace(/rgba?\(([^,]+),([^,]+),([^,)]+)(,[^)]*)?\)/, `rgba($1,$2,$3,${a})`)
  const nums = (c: string) => (c.match(/[\d.]+/g) ?? ['0', '0', '0']).slice(0, 3).map(Number)
  const mix = (a: string, b: string, f: number) => { const p = nums(a), q = nums(b); return p.map((v, i) => Math.round(v + (q[i]! - v) * f)) }

  // Each particle's colour from the angle of its starting point: four token colours around the circle.
  const ring = [C.accent!, C.ok!, C.warn!, C.danger!]
  const BUCKETS = 24
  const palette = Array.from({ length: BUCKETS }, (_, b) => {
    const a = (b / BUCKETS) * 4, i = Math.floor(a)
    return `rgb(${mix(ring[i % 4]!, ring[(i + 1) % 4]!, a - i).join(',')})`
  })
  const bucket = Uint8Array.from({ length: N }, (_, i) => {
    const x = m1[i * F * 2]!, y = m1[i * F * 2 + 1]!
    return Math.floor(((Math.atan2(y, x) / (2 * Math.PI) + 1) % 1) * BUCKETS) % BUCKETS
  })
  const byBucket = Array.from({ length: BUCKETS }, (_, b) => [...bucket.keys()].filter(i => bucket[i] === b))

  const canvas = document.createElement('canvas')
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block'
  root.append(canvas)
  const g = canvas.getContext('2d')!
  let W = width, H = height
  const size = (w: number, h: number) => {
    W = w; H = h
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.max(1, Math.round(w * dpr)); canvas.height = Math.max(1, Math.round(h * dpr))
  }
  size(width, height)

  // Space-time: (x, y) in [-1, 1]² on a plane at time t; planes are parallelograms, t runs left to right.
  const L: V = [300, 372], R: V = [980, 372], EX: V = [80, 34], EY: V = [0, 158]
  const base = (x: number, y: number, t: number): V => [L[0] + (R[0] - L[0]) * t + x * EX[0] + y * EY[0], L[1] + (R[1] - L[1]) * t + x * EX[1] + y * EY[1]]
  const cam = { s: 1, c: [640, 360] as V }
  const P = (x: number, y: number, t: number): V => { const [sx, sy] = base(x, y, t); return [640 + (sx - cam.c[0]) * cam.s, 360 + (sy - cam.c[1]) * cam.s] }
  const at01 = (traj: Float32Array, frames: number, i: number, t: number): V => {
    const f = Math.min(frames - 1.0001, Math.max(0, t * (frames - 1))), k = Math.floor(f), u = f - k, o = i * frames * 2 + k * 2
    return [traj[o]! + (traj[o + 2]! - traj[o]!) * u, traj[o + 1]! + (traj[o + 3]! - traj[o + 1]!) * u]
  }
  // A velocity as a space-time arrow: dt units of time along with the moves it makes in that time.
  const arrowTo = (x: number, y: number, t: number, v: V, dt: number): [V, V] => [P(x, y, t), P(x + v[0] * dt, y + v[1] * dt, t + dt)]

  const clamp = (v: number) => Math.max(0, Math.min(1, v))
  const ph = (ms: number, k: number, a = 0, b = 1) => clamp(((ms - at(k)) / (at(k + 1) - at(k)) - a) / (b - a))
  const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2)
  const out = (p: number) => 1 - (1 - p) ** 3
  const S = { intro: 0, velocity: 1, euler: 2, straight: 3, train: 4, result: 5, cross: 6, reflow: 7, onestep: 8 }

  const line = (pts: V[], stroke: string, w: number, dash: number[] = []) => {
    if (pts.length < 2) return
    g.beginPath(); g.moveTo(pts[0]![0], pts[0]![1])
    for (const p of pts.slice(1)) g.lineTo(p[0], p[1])
    g.setLineDash(dash); g.strokeStyle = stroke; g.lineWidth = w; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); g.setLineDash([])
  }
  const arrow = ([a, b]: [V, V], stroke: string, w: number) => {
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy)
    if (len < 1) return
    const ux = dx / len, uy = dy / len, head = Math.min(14, len * 0.4) + w
    line([a, [b[0] - ux * head * 0.6, b[1] - uy * head * 0.6]], stroke, w)
    g.beginPath(); g.moveTo(b[0], b[1]); g.lineTo(b[0] - ux * head - uy * head * 0.45, b[1] - uy * head + ux * head * 0.45)
    g.lineTo(b[0] - ux * head + uy * head * 0.45, b[1] - uy * head - ux * head * 0.45); g.closePath(); g.fillStyle = stroke; g.fill()
  }
  const dot = (p: V, r: number, fill: string) => { g.beginPath(); g.arc(p[0], p[1], r, 0, Math.PI * 2); g.fillStyle = fill; g.fill() }
  const text = (s: string, x: number, y: number, o: { size?: number, fill?: string, font?: string, align?: CanvasTextAlign, weight?: number } = {}) => {
    g.font = `${o.weight ?? 500} ${o.size ?? 24}px ${o.font ?? sans}`; g.fillStyle = o.fill ?? C.ink!; g.textAlign = o.align ?? 'center'; g.textBaseline = 'middle'; g.fillText(s, x, y)
  }
  const plane = (t: number, alpha: number, dashed = false) => {
    const k = 1.18, c = [P(-k, -k, t), P(k, -k, t), P(k, k, t), P(-k, k, t)]
    g.beginPath(); c.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath()
    if (!dashed) { g.fillStyle = rgba(C.sunk!, 0.55 * alpha); g.fill() }
    g.setLineDash(dashed ? [6, 7] : []); g.strokeStyle = rgba(C['line-strong']!, alpha); g.lineWidth = 1.5; g.stroke(); g.setLineDash([])
  }
  const logoOn = (t: number, fill: string | undefined, stroke: string | undefined) => {
    // The logo's 24-unit box onto the plane at t: unit (u − 12) / 12 along EX and EY.
    const o = P(-1, -1, t), ax = P(1, -1, t), ay = P(-1, 1, t)
    g.save(); g.transform((ax[0] - o[0]) / 24, (ax[1] - o[1]) / 24, (ay[0] - o[0]) / 24, (ay[1] - o[1]) / 24, o[0], o[1])
    if (fill) { g.fillStyle = fill; g.fill(logo) }
    if (stroke) { g.lineWidth = 24 / Math.hypot(ax[0] - o[0], ax[1] - o[1]) * 1.4; g.strokeStyle = stroke; g.setLineDash([0.4, 0.4]); g.stroke(logo); g.setLineDash([]) }
    g.restore()
  }
  const particles = (pos: (i: number) => V, alpha: number, colored: boolean, size = 2.6) => {
    if (alpha <= 0) return
    g.globalAlpha = alpha
    for (let b = 0; b < BUCKETS; b++) {
      g.fillStyle = colored ? palette[b]! : C.ink!
      for (const i of byBucket[b]!) { const p = pos(i); g.fillRect(p[0] - size / 2, p[1] - size / 2, size, size) }
    }
    g.globalAlpha = 1
  }
  const TRAILS = Array.from({ length: 140 }, (_, k) => Math.floor((k * N) / 140))
  const trail = (traj: Float32Array, frames: number, i: number, t: number): V[] => {
    const pts: V[] = []
    for (let k = 0; k <= 24; k++) { const tk = (k / 24) * t; const [x, y] = at01(traj, frames, i, tk); pts.push(P(x, y, tk)) }
    return pts
  }
  const ruler = (alpha: number, ticks: number, marker?: number) => {
    if (alpha <= 0) return
    const y = 664, x0 = 300, x1 = 980
    g.globalAlpha = alpha
    line([[x0, y], [x1, y]], C.muted!, 2)
    for (let i = 0; i <= ticks; i++) line([[x0 + ((x1 - x0) * i) / ticks, y - 7], [x0 + ((x1 - x0) * i) / ticks, y + 7]], C.muted!, 2)
    text('t = 0', x0 - 46, y, { size: 18, fill: C.muted, font: mono }); text('1', x1 + 22, y, { size: 18, fill: C.muted, font: mono })
    if (marker !== undefined) { const x = x0 + (x1 - x0) * marker; dot([x, y], 7, C.danger!); text(`t = ${marker.toFixed(1)}`, x, y + 26, { size: 18, fill: C.danger, font: mono }) }
    g.globalAlpha = 1
  }
  const readout = (s: string, alpha: number, fill = C.ink!, y = 64) => { if (alpha > 0) { g.globalAlpha = alpha; text(s, 640, y, { size: 30, font: mono, fill }); g.globalAlpha = 1 } }

  const ex = D.euler.exact
  const exactPts = (upTo: number) => ex.slice(0, Math.max(2, Math.round(upTo * 64) + 1)).map((p, k): V => P(p[0], p[1], k / 64))
  // The highlighted path face on, in space only (its bends are in x and y; space-time stretches them flat along t),
  // fitted with its Euler paths into the middle of the stage.
  const facePts = [...ex, ...Object.values(D.euler.steps).flatMap(e => e.path)]
  const fx0 = Math.min(...facePts.map(p => p[0])), fx1 = Math.max(...facePts.map(p => p[0]))
  const fy0 = Math.min(...facePts.map(p => p[1])), fy1 = Math.max(...facePts.map(p => p[1]))
  const fs = Math.min(1400, 880 / Math.max(1e-3, fx1 - fx0), 420 / Math.max(1e-3, fy1 - fy0))
  const FP = (x: number, y: number): V => [640 + (x - (fx0 + fx1) / 2) * fs, 380 + (y - (fy0 + fy1) / 2) * fs]
  const tr = D.train, hi = tr.highlight
  const target: V = [tr.x1[hi]![0] - tr.x0[hi]![0], tr.x1[hi]![1] - tr.x0[hi]![1]]
  const xt: V = [tr.x0[hi]![0] * (1 - tr.t) + tr.x1[hi]![0] * tr.t, tr.x0[hi]![1] * (1 - tr.t) + tr.x1[hi]![1] * tr.t]
  const lossMax = Math.max(...tr.loss.map(l => l[1])), lossMin = Math.min(...tr.loss.map(l => l[1]))
  const SHOWN = Array.from({ length: 60 }, (_, k) => Math.floor((k * N) / 60) + 3)
  const chordOf = (traj: Float32Array, frames: number, i: number, t: number): V => {
    const a = at01(traj, frames, i, 0), b = at01(traj, frames, i, 1)
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
  }
  const pct = (e: number) => `${(e * 100).toFixed(e < 0.1 ? 1 : 0)}%`

  const draw = (ms: number) => {
    const s0 = Math.min(W / 1280, H / 720), dpr = canvas.width / Math.max(1, W)
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H)
    g.setTransform(dpr * s0, 0, 0, dpr * s0, dpr * (W - 1280 * s0) / 2, dpr * (H - 720 * s0) / 2)

    // The Euler steps and the chord cut to the face-on view of the one path; training cuts back to space-time.
    const face = ease(ph(ms, S.euler, 0, 0.12)) * (1 - ease(ph(ms, S.train, 0, 0.12)))
    const view = ph(ms, S.intro, 0, 0.12) * (1 - ph(ms, S.onestep, 0, 0.15)) * (1 - face)

    if (view > 0) {
      g.globalAlpha = view
      plane(0, 1); plane(1, 1)
      logoOn(1, rgba(C.danger!, 0.08), rgba(C.muted!, 0.7))
      text('噪声  t = 0', ...P(0, 1.42, 0), { size: 20, fill: C.muted }); text('目标  t = 1', ...P(0, 1.42, 1), { size: 20, fill: C.muted })
      g.globalAlpha = 1
    }

    // The particles: neutral in the intro, coloured by their start from `result` on; dimmed while a single path,
    // the training or the crossing is the subject.
    const recolor = ph(ms, S.result, 0.04, 0.14)
    const tFlow = ms <= at(S.result) ? ease(ph(ms, S.intro, 0.16, 0.8)) : ease(ph(ms, S.result, 0.18, 0.8))
    const dim = Math.max(ph(ms, S.velocity, 0, 0.15) * (1 - ph(ms, S.result, 0, 0.05)) * 0.82, ph(ms, S.cross, 0, 0.1) * 0.75)
    const fadeOld = ms > at(S.result) ? 1 - ph(ms, S.result, 0, 0.06) : 1
    const cloudAlpha = view * ph(ms, S.intro, 0.06, 0.16) * (1 - dim)
    if (ms <= at(S.result) || recolor < 1) {
      // Before `result` (and while it fades in), the neutral cloud at its place on the flow.
      const t = ms <= at(S.result) ? tFlow : 1
      if (ms <= at(S.velocity)) for (const i of TRAILS) line(trail(m1, F, i, t), rgba(C.muted!, 0.22 * view), 1)
      particles(i => { const [x, y] = at01(m1, F, i, t); return P(x, y, t) }, cloudAlpha * 0.75 * (ms > at(S.result) ? fadeOld : 1), false, 2.4)
    }
    if (ms > at(S.result)) {
      const t = tFlow
      for (const i of TRAILS) line(trail(m1, F, i, t), rgba(palette[bucket[i]!]!, 0.3 * view * (1 - dim)), 1)
      particles(i => { const [x, y] = at01(m1, F, i, t); return P(x, y, t) }, view * recolor * (1 - dim), true, 2.6)
    }
    readout(`${N} 个粒子`, ph(ms, S.intro, 0.1, 0.2) * (1 - ph(ms, S.velocity, 0, 0.1)), C.muted)

    // One path, its tangent, the field on a slice: `velocity`.
    const pathOn = ph(ms, S.velocity, 0.05, 0.3) * (1 - ph(ms, S.train, 0, 0.1))
    if (pathOn > 0) {
      line(exactPts(ph(ms, S.velocity, 0.05, 0.3)), rgba(C.danger!, pathOn * (1 - face)), 3.2)
      const slide = ph(ms, S.velocity, 0.3, 0.6) * (1 - ph(ms, S.euler, 0, 0.08))
      if (slide > 0) {
        const k = Math.round(8 + 48 * ease(slide)), p = ex[k]!, q = ex[k + 2]!
        const v: V = [(q[0] - p[0]) * 32, (q[1] - p[1]) * 32]
        dot(P(p[0], p[1], k / 64), 5, C.accent!)
        arrow(arrowTo(p[0], p[1], k / 64, v, 0.16), rgba(C.accent!, Math.min(1, slide * 6)), 3)
      }
    }
    const field = ph(ms, S.velocity, 0.6, 0.85) * (1 - ph(ms, S.euler, 0, 0.1))
    if (field > 0) {
      g.globalAlpha = field; plane(0.5, 0.8, true)
      // Every other grid point, so the field reads as a field and the path stays in front.
      D.field.grid.forEach((q, i) => {
        if ((i % 13) % 2 || Math.floor(i / 13) % 2) return
        arrow(arrowTo(q[0], q[1], 0.5, D.field.v['0.5']![i]!, 0.045), rgba(C.accent!, 0.6), 1.3)
      })
      g.globalAlpha = 1
    }
    readout('速度 = 路径的切线', field * (1 - ph(ms, S.euler, 0, 0.1)), C.accent)

    // Euler with 4, 8, 16, 32 steps over the exact path, face on: `euler`.
    if (face > 0) {
      g.globalAlpha = face
      const [a0, b0] = FP(fx0, fy0), [a1, b1] = FP(fx1, fy1)
      g.fillStyle = rgba(C.sunk!, 0.55); g.strokeStyle = C['line-strong']!; g.lineWidth = 1.5
      g.beginPath(); g.rect(a0 - 44, b0 - 44, a1 - a0 + 88, b1 - b0 + 88); g.fill(); g.stroke()
      line(ex.map(p => FP(p[0], p[1])), C.danger!, 3.2)
      const s0 = FP(ex[0]![0], ex[0]![1]), s1 = FP(ex[64]![0], ex[64]![1])
      dot(s0, 6, C.ink!); dot(s1, 6, C.danger!)
      // Labels outside the hairpin: the start below its dot, the end above its dot.
      text('起点（噪声）', s0[0], s0[1] + 26, { size: 20, fill: C.muted }); text('真正的终点', s1[0], s1[1] - 24, { size: 20, fill: C.danger })
      g.globalAlpha = 1
    }
    const counts = [4, 8, 16, 32]
    let shownN = 0
    counts.forEach((n, j) => {
      const a = 0.16 + j * 0.18, on = ph(ms, S.euler, a, a + 0.12)
      if (on <= 0) return
      shownN = n
      const later = j < 3 ? ph(ms, S.euler, a + 0.18, a + 0.24) : 0
      const fade = (1 - 0.65 * later) * (1 - ph(ms, S.train, 0, 0.1)) * (ms > at(S.straight) ? 0.35 + 0.65 * (1 - ph(ms, S.straight, 0, 0.2)) : 1)
      const path = D.euler.steps[String(n)]!.path, pts = path.map((p): V => FP(p[0], p[1]))
      const drawn = Math.max(2, Math.ceil(pts.length * on))
      line(pts.slice(0, drawn), rgba(C.warn!, fade * face), n < 16 ? 2.6 : 1.8)
      if (n <= 8) pts.slice(0, drawn).forEach(p => dot(p, 4, rgba(C.warn!, fade * face)))
    })
    if (shownN && ms <= at(S.straight)) {
      const err = D.euler.steps[String(shownN)]!.error
      readout(`欧拉法 ${shownN} 步 · 终点偏差 ${pct(err)}`, 1, C.warn)
    }
    ruler(ph(ms, S.intro, 0, 0.12) * (1 - ph(ms, S.onestep, 0, 0.1)), ms > at(S.euler) && ms <= at(S.straight) ? Math.max(1, shownN) : ms > at(S.straight) && ms <= at(S.train) ? 1 : 0,
      ms > at(S.train) && ms <= at(S.result) ? (ph(ms, S.train, 0.3, 0.38) > 0 ? tr.t : undefined) : undefined)

    // The chord, walked in one step: `straight`.
    const chord = ph(ms, S.straight, 0.05, 0.4) * (1 - ph(ms, S.train, 0, 0.1))
    if (chord > 0) {
      const a = ex[0]!, b = ex[64]!
      g.globalAlpha = face
      line([FP(a[0], a[1]), FP(a[0] + (b[0] - a[0]) * chord, a[1] + (b[1] - a[1]) * chord)], C.ok!, 3, [9, 8])
      const step = out(ph(ms, S.straight, 0.45, 0.7))
      if (step > 0) arrow([FP(a[0], a[1]), FP(a[0] + (b[0] - a[0]) * step, a[1] + (b[1] - a[1]) * step)], C.ok!, 3.2)
      g.globalAlpha = 1
      readout('路是直的：一步就到', ph(ms, S.straight, 0.45, 0.6), C.ok)
    }

    // Training: random pairs, one point on one line, the two arrows, the loss: `train`.
    const lines = ph(ms, S.train, 0.08, 0.22) * (1 - ph(ms, S.result, 0, 0.08)) + ph(ms, S.cross, 0, 0.1) * (1 - 0.6 * ph(ms, S.cross, 0.58, 0.7)) * (1 - ph(ms, S.reflow, 0, 0.15))
    if (lines > 0 && view > 0) {
      g.globalAlpha = Math.min(1, lines) * view
      tr.x0.forEach((p, i) => line([P(p[0], p[1], 0), P(tr.x1[i]![0], tr.x1[i]![1], 1)], rgba(C.muted!, 0.32), 1.1))
      g.globalAlpha = 1
    }
    const trainOn = 1 - ph(ms, S.result, 0, 0.08)
    if (ms > at(S.train) && trainOn > 0) {
      const pick = ph(ms, S.train, 0.22, 0.3) * trainOn
      line([P(tr.x0[hi]![0], tr.x0[hi]![1], 0), P(tr.x1[hi]![0], tr.x1[hi]![1], 1)], rgba(C.danger!, pick), 2.4)
      dot(P(tr.x0[hi]![0], tr.x0[hi]![1], 0), 6 * pick, C.danger!); dot(P(tr.x1[hi]![0], tr.x1[hi]![1], 1), 6 * pick, C.danger!)
      const mark = ph(ms, S.train, 0.3, 0.38) * trainOn
      if (mark > 0) dot(P(xt[0], xt[1], tr.t), 7 * out(mark), C.ink!)
      const red = ph(ms, S.train, 0.38, 0.45) * trainOn
      if (red > 0) arrow(arrowTo(xt[0], xt[1], tr.t, target, 0.22 * out(red)), C.danger!, 3)
      const learn = ph(ms, S.train, 0.45, 0.9)
      if (learn > 0 && trainOn > 0) {
        // The round on a log scale; the network's arrow interpolates between the saved checkpoints.
        const cps = tr.checkpoints, logR = Math.log10(D.setup.rounds1) * ease(learn), round = Math.round(10 ** logR)
        let j = 0
        while (j < cps.length - 2 && cps[j + 1]![0] <= round) j++
        const a = cps[j]!, b = cps[j + 1]!, u = clamp((Math.log10(round) - Math.log10(a[0])) / Math.max(1e-6, Math.log10(b[0]) - Math.log10(a[0])))
        const v: V = [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]
        g.globalAlpha = trainOn
        arrow(arrowTo(xt[0], xt[1], tr.t, v, 0.22), C.accent!, 3)
        // The loss chart, top centre.
        const cx = 500, cy = 52, cw = 280, chh = 70
        line([[cx, cy + chh], [cx + cw, cy + chh]], C.muted!, 1.5)
        const pts = tr.loss.filter(l => l[0] <= round).map((l): V => [cx + (Math.log10(l[0]) / Math.log10(D.setup.rounds1)) * cw, cy + chh - ((l[1] - lossMin) / (lossMax - lossMin)) * chh])
        line(pts, C.accent!, 2.2)
        const last = tr.loss.filter(l => l[0] <= round).at(-1)
        text(`第 ${round.toLocaleString('en-US')} 轮`, cx + cw + 20, cy + 22, { size: 20, font: mono, align: 'left', fill: C.ink })
        if (last) text(`loss ${last[1].toFixed(2)}`, cx + cw + 20, cy + 50, { size: 20, font: mono, align: 'left', fill: C.muted })
        g.globalAlpha = 1
      }
      const formula = ph(ms, S.train, 0.4, 0.48) * trainOn
      if (formula > 0) {
        g.globalAlpha = formula
        const y = 150, parts: [string, string][] = [['L = ‖ ', C.ink!], ['v', C.accent!], [' − ', C.ink!], ['(x₁ − x₀)', C.danger!], [' ‖²', C.ink!]]
        g.font = `500 26px ${mono}`
        let x = 640 - parts.reduce((w, [s]) => w + g.measureText(s).width, 0) / 2
        for (const [s, f] of parts) { text(s, x, y, { size: 26, font: mono, align: 'left', fill: f }); x += g.measureText(s).width }
        g.globalAlpha = 1
      }
    }
    readout(`训练 ${D.setup.rounds1.toLocaleString('en-US')} 轮 · ${N} 个粒子`, ph(ms, S.result, 0.1, 0.2) * (1 - ph(ms, S.cross, 0, 0.1)), C.muted)

    // The crossing: lines through one point, their directions, the average; then the real, curved paths: `cross`.
    const cr = D.cross
    const crossOn = (1 - ph(ms, S.reflow, 0, 0.12)) * view
    if (ms > at(S.cross) && crossOn > 0) {
      g.globalAlpha = crossOn
      plane(cr.t, ph(ms, S.cross, 0.05, 0.15), true)
      // The lines through the point and their arrows step back once the curved paths come in.
      const lit = ph(ms, S.cross, 0.12, 0.32) * (1 - 0.7 * ph(ms, S.cross, 0.58, 0.7))
      cr.lines.forEach(([a, b, c, d]) => line([P(a, b, 0), P(c, d, 1)], rgba(C.danger!, 0.55 * lit), 1.4))
      const fan = ph(ms, S.cross, 0.32, 0.45)
      if (fan > 0) cr.lines.forEach(([a, b, c, d]) => arrow(arrowTo(cr.point[0], cr.point[1], cr.t, [c - a, d - b], 0.12 * out(fan)), rgba(C.danger!, 0.6 * (1 - 0.7 * ph(ms, S.cross, 0.58, 0.7))), 1.4))
      const avg = ph(ms, S.cross, 0.45, 0.55)
      if (avg > 0) { dot(P(cr.point[0], cr.point[1], cr.t), 6, C.ink!); arrow(arrowTo(cr.point[0], cr.point[1], cr.t, cr.model, 0.12 * out(avg)), C.accent!, 4) }
      g.globalAlpha = 1
    }
    const curved = ph(ms, S.cross, 0.6, 0.85) * (1 - ph(ms, S.onestep, 0, 0.1)) * view
    const straighten = ease(ph(ms, S.reflow, 0.1, 0.4))
    if (curved > 0) for (const i of SHOWN) {
      const pts: V[] = []
      for (let k = 0; k <= 24; k++) {
        const t = k / 24, c = at01(m1, F, i, t), s = chordOf(m1, F, i, t)
        pts.push(P(c[0] + (s[0] - c[0]) * straighten, c[1] + (s[1] - c[1]) * straighten, t))
      }
      line(pts.slice(0, Math.max(2, Math.ceil(25 * ph(ms, S.cross, 0.6, 0.85)))), rgba(C.accent!, 0.65 * curved * (1 - 0.6 * ph(ms, S.reflow, 0.45, 0.6))), 1.5)
    }

    // Reflow: the paths straighten into their chords, the retrained model's paths lie on them: `reflow`.
    const second = ph(ms, S.reflow, 0.45, 0.75) * (1 - ph(ms, S.onestep, 0, 0.1)) * view
    if (second > 0) for (const i of SHOWN) {
      const pts: V[] = []
      for (let k = 0; k <= 24; k++) { const t = (k / 24) * second; const [x, y] = at01(m2, F2, i, t); pts.push(P(x, y, t)) }
      line(pts, rgba(C.ok!, 0.9), 1.8)
    }
    readout(`路程 ÷ 直线距离：${D.straightness.m1.toFixed(1)} → ${D.straightness.m2.toFixed(2)}`, ph(ms, S.reflow, 0.75, 0.85) * (1 - ph(ms, S.onestep, 0, 0.1)), C.ok)

    // One step each, face on: `onestep`.
    const panels = ph(ms, S.onestep, 0.1, 0.25)
    if (panels > 0) {
      const box = (cx: number, pts: Float32Array, label: string, err: number, fill: string, show: number) => {
        const k = 150, pos = (i: number): V => [cx + pts[i * 2]! * k, 380 + pts[i * 2 + 1]! * k]
        g.globalAlpha = panels
        g.fillStyle = rgba(C.sunk!, 0.55); g.strokeStyle = C['line-strong']!; g.lineWidth = 1.5
        g.beginPath(); g.rect(cx - k * 1.18, 380 - k * 1.18, k * 2.36, k * 2.36); g.fill(); g.stroke()
        g.save(); g.transform(k / 12, 0, 0, k / 12, cx - k, 380 - k); g.fillStyle = rgba(C.danger!, 0.08); g.fill(logo); g.restore()
        text(label, cx, 170, { size: 24, fill: C.ink })
        g.globalAlpha = 1
        particles(pos, panels * show, true, 2.6)
        if (show > 0) { g.globalAlpha = ph(ms, S.onestep, 0.55, 0.65); text(`终点偏差 ${pct(err)}`, cx, 600, { size: 28, font: mono, fill }); g.globalAlpha = 1 }
      }
      box(400, one1, '第一个模型 · 走 1 步', D.onestep['m1-1']!.error, C.warn!, out(ph(ms, S.onestep, 0.25, 0.4)))
      box(880, one2, 'Reflow 之后 · 走 1 步', D.onestep['m2-1']!.error, C.ok!, out(ph(ms, S.onestep, 0.4, 0.55)))
    }
  }

  let last = 0
  return {
    seek(ms: number) { last = ms; draw(ms) },
    resize(w: number, h: number) { size(w, h); draw(last) },
    dispose() { canvas.remove() },
  }
})
