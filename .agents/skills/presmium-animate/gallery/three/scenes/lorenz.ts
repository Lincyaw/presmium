import { threeScene } from '@lincyaw/addon-motion/scene'

// 3D axes with tick labels (AxesHelper, GridHelper, CSS2D), the Lorenz attractor integrated once with RK4 and drawn
// as a fat Line2 with per-vertex colors, grown by instanceCount, and a camera orbit computed from the time.
// Seek safety: the trajectory is precomputed; instanceCount is set from the time (never += per frame).
const clamp = (k: number) => Math.min(1, Math.max(0, k))
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2)
const STEPS = 5000

function lorenz(): number[] {
  const f = ([x, y, z]: number[]) => [10 * (y! - x!), x! * (28 - z!) - y!, x! * y! - (8 / 3) * z!]
  let p = [1, 1, 1]
  const h = 0.006
  const out: number[] = []
  for (let i = 0; i < STEPS; i++) {
    const k1 = f(p)
    const k2 = f(p.map((v, j) => v + (h / 2) * k1[j]!))
    const k3 = f(p.map((v, j) => v + (h / 2) * k2[j]!))
    const k4 = f(p.map((v, j) => v + h * k3[j]!))
    p = p.map((v, j) => v + (h / 6) * (k1[j]! + 2 * k2[j]! + 2 * k3[j]! + k4[j]!))
    // Scaled by 1/9 into a box about 5 units wide; the Lorenz z (24 at the center) is the vertical axis.
    out.push(p[0]! / 9, (p[2]! - 24) / 9, p[1]! / 9)
  }
  return out
}

export default threeScene(({ THREE, renderer, addons, root, at, total, width, height, color }) => {
  const phase = (ms: number, k: number) => ease(clamp((ms - at(k)) / (at(k + 1) - at(k))))
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100)

  const labels = new addons.CSS2DRenderer()
  labels.setSize(width, height)
  Object.assign(labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' })
  root.append(labels.domElement)

  const frame = new THREE.Group()
  const grid = new THREE.GridHelper(6, 12, color('line-strong'), color('line'))
  const axes = new THREE.AxesHelper(3.1)
  // AxesHelper's colors are red/green/blue by default; setColors puts them on the palette.
  axes.setColors(new THREE.Color(color('danger')), new THREE.Color(color('ok')), new THREE.Color(color('accent')))
  frame.add(grid, axes)
  scene.add(frame)
  const ticks: HTMLElement[] = []
  const tick = (text: string, x: number, y: number, z: number, css = '') => {
    const el = document.createElement('div')
    el.textContent = text
    el.style.cssText = `font: 0.8rem var(--pm-font-mono); color: var(--pm-color-muted); ${css}`
    const object = new addons.CSS2DObject(el)
    object.position.set(x, y, z)
    frame.add(object)
    ticks.push(el)
  }
  for (const v of [-2, -1, 1, 2]) tick(String(v * 9), v, 0, 0)
  for (const v of [-2, -1, 1, 2]) tick(String(v * 9), 0, 0, v)
  const axisCss = (token: string) => `font: 600 1.05rem var(--pm-font-serif); font-style: italic; color: var(--pm-color-${token})`
  tick('x', 3.35, 0, 0, axisCss('danger'))
  tick('z', 0, 3.35, 0, axisCss('ok'))
  tick('y', 0, 0, 3.35, axisCss('accent'))

  const positions = lorenz()
  const from = new THREE.Color(color('accent'))
  const to = new THREE.Color(color('warn'))
  const tint = new THREE.Color()
  const colors: number[] = []
  for (let i = 0; i < STEPS; i++) colors.push(...tint.copy(from).lerp(to, i / STEPS).toArray())
  const geometry = new addons.LineGeometry()
  geometry.setPositions(positions)
  geometry.setColors(colors)
  const material = new addons.LineMaterial({ vertexColors: true, linewidth: 2 })
  const line = new addons.Line2(geometry, material)
  scene.add(line)
  const headGeometry = new THREE.SphereGeometry(0.07, 16, 12)
  const headMaterial = new THREE.MeshBasicMaterial({ color: color('ink') })
  const head = new THREE.Mesh(headGeometry, headMaterial)
  scene.add(head)

  return {
    render(ms) {
      const show = phase(ms, 0)
      const draw = clamp((ms - at(1)) / (at(2) - at(1))) // linear: the pen moves at the solver's pace
      const orbit = phase(ms, 2)
      frame.scale.setScalar(Math.max(1e-3, show))
      for (const el of ticks) el.style.opacity = String(show)
      const n = Math.floor(draw * (STEPS - 1))
      geometry.instanceCount = n
      line.visible = n > 0
      head.visible = draw > 0 && draw < 1
      head.position.fromArray(positions, n * 3)
      // A drift over the whole timeline plus a half turn in the last step.
      const angle = 0.6 + 0.25 * (ms / total) + Math.PI * orbit
      camera.position.set(10 * Math.cos(angle), 4.4 - 1.8 * orbit, 10 * Math.sin(angle))
      camera.lookAt(0, 0.2, 0)
      renderer.render(scene, camera)
      labels.render(scene, camera)
    },
    resize(w, h) {
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      labels.setSize(w, h)
    },
    dispose() {
      grid.dispose()
      axes.dispose()
      for (const item of [geometry, material, headGeometry, headMaterial]) item.dispose()
      labels.domElement.remove()
    },
  }
})
