import { animeScene } from '@lincyaw/addon-motion/scene'

// A canvas driven by a timeline: Anime.js tweens a plain object whose setters redraw the canvas.
// onUpdate would be the usual way, but callbacks are muted under seek(ms, true); a setter runs on every seek.
// The path is computed once up front (gradient descent with and without momentum), the tween only says how far along it is.
const A = 1
const B = 9
const loss = (x: number, y: number) => A * x * x + B * y * y
const descend = (momentum: number, lr: number, steps = 40) => {
  let x = -3.6
  let y = 1.25
  let vx = 0
  let vy = 0
  const path: Array<[number, number]> = [[x, y]]
  for (let i = 0; i < steps; i++) {
    vx = momentum * vx - lr * 2 * A * x
    vy = momentum * vy - lr * 2 * B * y
    x += vx
    y += vy
    path.push([x, y])
  }
  return path
}

export default animeScene(({ root, anime, at, color, width, height }) => {
  const dpr = window.devicePixelRatio || 1
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  Object.assign(canvas.style, { width: '100%', height: '100%', display: 'block' })
  root.append(canvas)
  const g = canvas.getContext('2d')!
  const W = canvas.width
  const H = canvas.height
  const sx = (x: number) => W / 2 + (x / 4.2) * (W / 2)
  const sy = (y: number) => H / 2 - (y / 2.1) * (H / 2) * 0.9
  const plain = descend(0, 0.105)
  const heavy = descend(0.75, 0.03)
  const colors = { line: color('line-strong'), plain: color('accent'), heavy: color('warn'), ink: color('ink') }
  const state = { contours: 0, plain: 0, heavy: 0 }
  const trail = (path: Array<[number, number]>, upto: number, stroke: string) => {
    const n = Math.floor(upto)
    if (upto <= 0) return
    g.strokeStyle = stroke
    g.fillStyle = stroke
    g.lineWidth = 3 * dpr
    g.beginPath()
    g.moveTo(sx(path[0][0]), sy(path[0][1]))
    for (let i = 1; i <= n; i++) g.lineTo(sx(path[i][0]), sy(path[i][1]))
    const f = upto - n
    const [x0, y0] = path[n]
    const [x1, y1] = path[Math.min(n + 1, path.length - 1)]
    const hx = x0 + (x1 - x0) * f
    const hy = y0 + (y1 - y0) * f
    g.lineTo(sx(hx), sy(hy))
    g.stroke()
    g.beginPath()
    g.arc(sx(hx), sy(hy), 7 * dpr, 0, Math.PI * 2)
    g.fill()
  }
  const draw = () => {
    g.clearRect(0, 0, W, H)
    g.globalAlpha = state.contours
    g.strokeStyle = colors.line
    g.lineWidth = 1.5 * dpr
    for (let level = 1; level <= 9; level++) {
      const c = level * level * 0.25
      g.beginPath()
      g.ellipse(sx(0), sy(0), sx(Math.sqrt(c / A)) - sx(0), sy(0) - sy(Math.sqrt(c / B)), 0, 0, Math.PI * 2)
      g.stroke()
    }
    g.globalAlpha = 1
    trail(plain, state.plain, colors.plain)
    trail(heavy, state.heavy, colors.heavy)
    g.fillStyle = colors.ink
    g.font = `${16 * dpr}px sans-serif`
    if (state.plain > 0) g.fillText('梯度下降', 16 * dpr, 28 * dpr)
    if (state.heavy > 0) { g.fillStyle = colors.heavy; g.fillText('带动量', 16 * dpr, 52 * dpr) }
  }
  // Each property's setter stores the value and redraws, so the picture follows every seek.
  const view = {
    get contours() { return state.contours }, set contours(v: number) { state.contours = v; draw() },
    get plain() { return state.plain }, set plain(v: number) { state.plain = v; draw() },
    get heavy() { return state.heavy }, set heavy(v: number) { state.heavy = v; draw() },
  }
  const tl = anime.createTimeline({ autoplay: false })
  // Step 0: the loss surface's contour lines.
  tl.add(view, { contours: [0, 1], duration: 600, ease: 'linear' }, at(0))
  // Step 1: plain gradient descent zig-zags across the narrow valley.
  tl.add(view, { plain: [0, plain.length - 1], duration: 2400, ease: 'linear' }, at(1))
  // Step 2: with momentum, the same start runs along the valley.
  tl.add(view, { heavy: [0, heavy.length - 1], duration: 2400, ease: 'linear' }, at(2))
  draw()
  return tl
})
