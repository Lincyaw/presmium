import { motionScene } from '@lincyaw/addon-motion/scene'
import type { MotionSequence } from '@lincyaw/addon-motion/scene'

// Motion values driving a canvas: gradient descent and momentum on an elongated bowl. Each optimizer has one motion
// value, its progress along a precomputed path (a float index), and the canvas is redrawn from all of them on change.
// Pitfall: animating a plain object updates it in Motion's render step, after `change` handlers ran; reading motion
// values in the handler is current. The canvas is sized once from the scene's width and height.
const A = 1
const B = 12
const grad = (x: number, y: number) => [A * x, B * y] as const
const START: [number, number] = [-4.2, 1.2]

function run(lr: number, beta: number, n: number) {
  const pts: [number, number][] = [START]
  let [x, y] = START
  let vx = 0
  let vy = 0
  for (let i = 0; i < n; i++) {
    const [gx, gy] = grad(x, y)
    vx = beta * vx + gx
    vy = beta * vy + gy
    x -= lr * vx
    y -= lr * vy
    pts.push([x, y])
  }
  return pts
}

export default motionScene(({ root, motion, at, width, height, color }) => {
  root.innerHTML = '<canvas style="width:100%;height:100%;display:block"></canvas>'
  const canvas = root.querySelector('canvas')!
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  const g = canvas.getContext('2d')!
  const paths = [run(0.155, 0, 30), run(0.05, 0.8, 30)]
  const hues = [color('danger'), color('accent')]
  const names = ['梯度下降', '动量法']
  const ink = color('muted')
  const line = color('line-strong')
  const progress = paths.map(() => motion.motionValue(0))
  const W = canvas.width
  const H = canvas.height
  const sx = (x: number) => W / 2 + x * W / 10.5
  const sy = (y: number) => H / 2 - y * H / 3.4
  const draw = () => {
    g.clearRect(0, 0, W, H)
    g.lineWidth = 1.2 * dpr
    g.strokeStyle = line
    for (let r = 1; r <= 9; r++) {
      const c = r * r * 0.25 // contour of f = (x² + 12y²) / 2
      g.beginPath()
      g.ellipse(sx(0), sy(0), Math.sqrt(2 * c / A) * W / 10.5, Math.sqrt(2 * c / B) * H / 3.4, 0, 0, Math.PI * 2)
      g.stroke()
    }
    paths.forEach((pts, k) => {
      const p = progress[k]!.get()
      const whole = Math.floor(p)
      const f = p - whole
      g.strokeStyle = hues[k]!
      g.fillStyle = hues[k]!
      g.lineWidth = 2.4 * dpr
      g.beginPath()
      g.moveTo(sx(pts[0]![0]), sy(pts[0]![1]))
      for (let i = 1; i <= whole; i++) g.lineTo(sx(pts[i]![0]), sy(pts[i]![1]))
      const a = pts[whole]!
      const b = pts[Math.min(whole + 1, pts.length - 1)]!
      const hx = a[0] + (b[0] - a[0]) * f
      const hy = a[1] + (b[1] - a[1]) * f
      g.lineTo(sx(hx), sy(hy))
      g.stroke()
      g.beginPath()
      g.arc(sx(hx), sy(hy), 6 * dpr, 0, Math.PI * 2)
      g.fill()
      g.font = `${Math.round(H * 0.045)}px sans-serif`
      g.fillText(names[k]!, W * 0.04, H * (0.86 + k * 0.07))
    })
    g.fillStyle = ink
    g.fillText('最小值', sx(0) + 8 * dpr, sy(0) - 8 * dpr)
  }
  draw()
  for (const value of progress) value.on('change', draw)
  const s = (k: number) => at(k) / 1000
  const steps = paths[0]!.length - 1
  const seq: MotionSequence = [
    // Step 0: plain gradient descent zig-zags across the narrow valley.
    [progress[0]!, [0, steps], { at: s(0), duration: 2.4, ease: 'linear' }],
    // Step 1: momentum averages the zig-zag away and rolls down the valley.
    [progress[1]!, [0, steps], { at: s(1), duration: 2.4, ease: 'linear' }],
  ]
  return motion.animate(seq)
})
