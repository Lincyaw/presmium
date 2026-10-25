import { threeScene } from '@lincyaw/addon-motion/scene'

// Vectors with ArrowHelper (setDirection / setLength each frame), a dashed Line (LineDashedMaterial needs
// computeLineDistances after the points move), GridHelper/AxesHelper and CSS2D labels whose text follows the time.
// Seek safety: b's angle and the projection are functions of the time, never incremented.
const clamp = (k: number) => Math.min(1, Math.max(0, k))
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2)

export default threeScene(({ THREE, renderer, addons, root, at, width, height, color }) => {
  const phase = (ms: number, k: number) => ease(clamp((ms - at(k)) / (at(k + 1) - at(k))))
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100)
  camera.position.set(4.2, 3.6, 6.2)
  camera.lookAt(0.8, 0.6, 0)

  const labels = new addons.CSS2DRenderer()
  labels.setSize(width, height)
  Object.assign(labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' })
  root.append(labels.domElement)
  const tag = (token: string) => {
    const el = document.createElement('div')
    el.style.cssText = `font: 600 1.05rem var(--pm-font-serif); font-style: italic; color: var(--pm-color-${token})`
    const object = new addons.CSS2DObject(el)
    scene.add(object)
    return { el, object }
  }

  const grid = new THREE.GridHelper(8, 16, color('line-strong'), color('line'))
  const axes = new THREE.AxesHelper(2.5)
  axes.setColors(new THREE.Color(color('line-strong')), new THREE.Color(color('line-strong')), new THREE.Color(color('line-strong')))
  scene.add(grid, axes)

  const origin = new THREE.Vector3()
  const a = new THREE.Vector3(1.2, 2.2, 0.6)
  const arrowA = new THREE.ArrowHelper(a.clone().normalize(), origin, 1, color('accent'))
  const arrowB = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), origin, 1, color('warn'))
  const arrowP = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), origin, 1, color('danger'))
  scene.add(arrowA, arrowB, arrowP)
  const length = (arrow: InstanceType<typeof THREE.ArrowHelper>, len: number) => {
    arrow.visible = len > 0.01
    arrow.setLength(Math.max(len, 0.01), Math.min(0.25, len * 0.35), Math.min(0.14, len * 0.2))
  }

  const dashGeometry = new THREE.BufferGeometry().setFromPoints([origin, origin])
  const dashMaterial = new THREE.LineDashedMaterial({ color: color('muted'), dashSize: 0.12, gapSize: 0.08 })
  const dash = new THREE.Line(dashGeometry, dashMaterial)
  dash.frustumCulled = false // its bounding sphere is computed once, from the first (zero-length) points
  scene.add(dash)

  const labelA = tag('accent')
  labelA.el.textContent = 'a'
  const labelB = tag('warn')
  labelB.el.textContent = 'b'
  const labelP = tag('danger')
  const readout = document.createElement('div')
  readout.style.cssText = 'position: absolute; left: 1em; top: 0.8em; font: 1rem var(--pm-font-mono); color: var(--pm-color-ink)'
  labels.domElement.append(readout)

  const b = new THREE.Vector3()
  const p = new THREE.Vector3()
  const tip = new THREE.Vector3()
  return {
    render(ms) {
      const grow = phase(ms, 0)
      const turn = phase(ms, 1)
      const drop = phase(ms, 2)
      // b sweeps from the x axis around y; a stays.
      const angle = 1.35 - 1.85 * turn // from nearly perpendicular to a to close to it
      b.set(Math.cos(angle), 0, -Math.sin(angle)).multiplyScalar(3)
      length(arrowA, a.length() * grow)
      arrowB.setDirection(tip.copy(b).normalize())
      length(arrowB, b.length() * grow)
      labelA.object.position.copy(a).multiplyScalar(grow * 1.1)
      labelB.object.position.copy(b).multiplyScalar(grow * 1.08)
      labelA.el.style.opacity = labelB.el.style.opacity = String(grow)

      // The projection of a onto b: the dashed drop from a's tip to the line of b, then the red arrow.
      p.copy(a).projectOnVector(b)
      tip.lerpVectors(a, p, drop)
      dashGeometry.setFromPoints([a, tip])
      dash.computeLineDistances()
      dash.visible = drop > 0
      arrowP.setDirection(p.clone().normalize())
      length(arrowP, p.length() * clamp(drop * 1.5 - 0.5))
      labelP.object.position.copy(p).multiplyScalar(0.5).add(new THREE.Vector3(0, -0.3, 0))
      labelP.el.textContent = 'proj_b a'
      labelP.el.style.opacity = String(clamp(drop * 2 - 1))
      const dot = a.dot(b)
      readout.textContent = `a·b = ${dot.toFixed(2)}   |proj| = ${(dot / b.length()).toFixed(2)}`
      readout.style.opacity = String(clamp(turn * 4 + drop))
      renderer.render(scene, camera)
      labels.render(scene, camera)
    },
    resize(w, h) {
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      labels.setSize(w, h)
    },
    dispose() {
      for (const arrow of [arrowA, arrowB, arrowP]) arrow.dispose()
      grid.dispose()
      axes.dispose()
      dashGeometry.dispose()
      dashMaterial.dispose()
      labels.domElement.remove()
    },
  }
})
