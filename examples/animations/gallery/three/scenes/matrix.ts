import { threeScene } from '@lincyaw/addon-motion/scene'

// A 2×2 matrix acting on the plane: an OrthographicCamera, a LineSegments grid whose endpoints are multiplied by
// the matrix of the time, a filled unit square (a 4-vertex BufferGeometry) and the determinant as a CSS2D label.
// Seek safety: the matrix is lerped entry by entry between keyframes picked by step, so any time gives one matrix.
const clamp = (k: number) => Math.min(1, Math.max(0, k))
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2)
type M2 = [number, number, number, number] // [a, b, c, d] for [[a, b], [c, d]]
const KEYS: M2[] = [[1, 0, 0, 1], [1, 1, 0, 1], [1.5, 1, 0.5, 1.5], [1, 2, 0.5, 1]]
const N = 5 // grid lines from -N to N

export default threeScene(({ THREE, renderer, addons, root, at, width, height, color }) => {
  const phase = (ms: number, k: number) => ease(clamp((ms - at(k)) / (at(k + 1) - at(k))))
  const scene = new THREE.Scene()
  const half = 3.4
  const camera = new THREE.OrthographicCamera(-half * width / height, half * width / height, half, -half, -10, 10)
  camera.position.z = 5

  const labels = new addons.CSS2DRenderer()
  labels.setSize(width, height)
  Object.assign(labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' })
  root.append(labels.domElement)

  // The fixed reference grid, and the grid that the matrix moves (both as segments: lines stay lines).
  const still = new THREE.GridHelper(2 * N, 2 * N, color('line'), color('line'))
  still.rotation.x = Math.PI / 2
  scene.add(still)
  const ends: [number, number][] = []
  for (let i = -N; i <= N; i++) ends.push([i, -N], [i, N], [-N, i], [N, i])
  const gridGeometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(ends.length * 3, 3))
  const gridMaterial = new THREE.LineBasicMaterial({ color: color('accent'), transparent: true, opacity: 0.55 })
  const grid = new THREE.LineSegments(gridGeometry, gridMaterial)
  grid.frustumCulled = false
  scene.add(grid)

  const squareGeometry = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(12, 3))
  squareGeometry.setIndex([0, 1, 2, 0, 2, 3])
  const squareMaterial = new THREE.MeshBasicMaterial({ color: color('warn'), transparent: true, opacity: 0.35, side: THREE.DoubleSide })
  const square = new THREE.Mesh(squareGeometry, squareMaterial)
  square.frustumCulled = false
  scene.add(square)

  const iHat = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 1, color('danger'), 0.25, 0.16)
  const jHat = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1, color('ok'), 0.25, 0.16)
  iHat.position.z = jHat.position.z = 0.1
  scene.add(iHat, jHat)
  const tag = (text: string, css: string) => {
    const el = document.createElement('div')
    el.textContent = text
    el.style.cssText = css
    const object = new addons.CSS2DObject(el)
    scene.add(object)
    return { el, object }
  }
  const hatCss = (token: string) => `font: 600 1.1rem var(--pm-font-serif); color: var(--pm-color-${token})`
  const iTag = tag('î', hatCss('danger'))
  const jTag = tag('ĵ', hatCss('ok'))
  const det = tag('', 'font: 0.95rem var(--pm-font-mono); color: var(--pm-color-ink); background: var(--pm-color-surface); padding: 0.1em 0.45em; border-radius: 0.3em')
  const matrix = tag('', 'font: 1rem var(--pm-font-mono); color: var(--pm-color-ink); white-space: pre; line-height: 1.3')
  matrix.object.center.set(0, 0)

  const m: M2 = [1, 0, 0, 1]
  const apply = ([x, y]: [number, number]): [number, number] => [m[0] * x + m[1] * y, m[2] * x + m[3] * y]
  const v = new THREE.Vector3()
  return {
    render(ms) {
      const show = phase(ms, 0)
      // Which keyframe pair the time is between, and how far.
      let k = 0
      for (let s = 1; s < KEYS.length; s++) if (ms >= at(s)) k = s
      const from = KEYS[Math.max(0, k - 1)]!
      const to = KEYS[k]!
      const t = k === 0 ? 1 : phase(ms, k)
      for (let e = 0; e < 4; e++) m[e] = from[e]! + (to[e]! - from[e]!) * t

      const grid3 = gridGeometry.attributes.position!
      ends.forEach((p, i) => { const [x, y] = apply(p); grid3.setXYZ(i, x, y, 0) })
      grid3.needsUpdate = true
      gridMaterial.opacity = 0.55 * show
      const sq = squareGeometry.attributes.position!
      ;([[0, 0], [1, 0], [1, 1], [0, 1]] as [number, number][]).forEach((p, i) => { const [x, y] = apply(p); sq.setXYZ(i, x, y, 0.05) })
      sq.needsUpdate = true
      squareMaterial.opacity = 0.35 * show

      const [ix, iy] = apply([1, 0])
      const [jx, jy] = apply([0, 1])
      iHat.setDirection(v.set(ix, iy, 0).normalize())
      iHat.setLength(Math.max(0.01, Math.hypot(ix, iy)), 0.25, 0.16)
      jHat.setDirection(v.set(jx, jy, 0).normalize())
      jHat.setLength(Math.max(0.01, Math.hypot(jx, jy)), 0.25, 0.16)
      iHat.visible = jHat.visible = show > 0.01
      iTag.object.position.set(ix * 1.15 + 0.1, iy * 1.15 - 0.15, 0)
      jTag.object.position.set(jx * 1.15 - 0.15, jy * 1.15 + 0.1, 0)
      const d = m[0] * m[3] - m[1] * m[2]
      det.el.textContent = `det = ${d.toFixed(2)}`
      det.object.position.set((ix + jx) / 2, (iy + jy) / 2, 0)
      matrix.el.textContent = `⎡${m[0].toFixed(2).padStart(5)} ${m[1].toFixed(2).padStart(5)}⎤\n⎣${m[2].toFixed(2).padStart(5)} ${m[3].toFixed(2).padStart(5)}⎦`
      matrix.object.position.set(camera.left + 0.3, camera.top - 0.3, 0)
      for (const label of [iTag, jTag, det, matrix]) label.el.style.opacity = String(show)
      renderer.render(scene, camera)
      labels.render(scene, camera)
    },
    resize(w, h) {
      camera.left = -half * w / h
      camera.right = half * w / h
      camera.updateProjectionMatrix()
      labels.setSize(w, h)
    },
    dispose() {
      for (const item of [still, iHat, jHat]) item.dispose()
      for (const item of [gridGeometry, gridMaterial, squareGeometry, squareMaterial]) item.dispose()
      labels.domElement.remove()
    },
  }
})
