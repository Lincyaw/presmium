import { threeScene } from '@lincyaw/addon-motion/scene'

// A loss surface from PlaneGeometry vertex displacement with height-mapped vertex colors, gradient descent precomputed
// at build time, and a fat Line2 trail grown by instanceCount. Seek safety: the descent path is computed once; render
// only picks the place on it for the time, so jumping backwards never replays the optimizer.
const clamp = (k: number) => Math.min(1, Math.max(0, k))
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2)
const loss = (x: number, z: number) => 0.45 * Math.sin(1.3 * x) * Math.cos(1.1 * z) + 0.07 * (x * x + z * z) + 0.15 * Math.sin(0.7 * x + 0.4 * z)

export default threeScene(({ THREE, renderer, addons, root, at, total, width, height, color }) => {
  const phase = (ms: number, k: number) => ease(clamp((ms - at(k)) / (at(k + 1) - at(k))))
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x999999, 2.2))
  const sun = new THREE.DirectionalLight(0xffffff, 1.8)
  sun.position.set(-3, 6, 4)
  scene.add(sun)

  const labels = new addons.CSS2DRenderer()
  labels.setSize(width, height)
  Object.assign(labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' })
  root.append(labels.domElement)

  // The surface: a plane laid flat, each vertex lifted to the loss, colored from low (accent) to high (warn).
  const surface = new THREE.PlaneGeometry(6, 6, 90, 90)
  surface.rotateX(-Math.PI / 2)
  const position = surface.attributes.position!
  const low = new THREE.Color(color('accent'))
  const high = new THREE.Color(color('warn'))
  const colors = new Float32Array(position.count * 3)
  const tint = new THREE.Color()
  const heights = Array.from({ length: position.count }, (_, i) => loss(position.getX(i), position.getZ(i)))
  const [min, max] = [Math.min(...heights), Math.max(...heights)]
  heights.forEach((y, i) => {
    position.setY(i, y)
    // HSL: an RGB lerp of teal and orange passes through mud.
    tint.copy(low).lerpHSL(high, (y - min) / (max - min)).toArray(colors, i * 3)
  })
  surface.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  surface.computeVertexNormals()
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide })
  const wire = new THREE.MeshBasicMaterial({ color: color('ink'), wireframe: true, transparent: true, opacity: 0.08 })
  const land = new THREE.Group()
  land.add(new THREE.Mesh(surface, material), new THREE.Mesh(surface, wire))
  scene.add(land)

  // Gradient descent with a numerical gradient, run once: the path is data, the animation only reads it.
  const path: InstanceType<typeof THREE.Vector3>[] = []
  let [x, z] = [-1, -2.7]
  for (let i = 0; i < 120; i++) {
    path.push(new THREE.Vector3(x, loss(x, z) + 0.12, z))
    const h = 1e-3
    const gx = (loss(x + h, z) - loss(x - h, z)) / (2 * h)
    const gz = (loss(x, z + h) - loss(x, z - h)) / (2 * h)
    x -= 0.08 * gx
    z -= 0.08 * gz
  }
  const ballGeometry = new THREE.SphereGeometry(0.12, 24, 16)
  const ballMaterial = new THREE.MeshStandardMaterial({ color: color('danger'), roughness: 0.3 })
  const ball = new THREE.Mesh(ballGeometry, ballMaterial)
  scene.add(ball)

  const trailGeometry = new addons.LineGeometry()
  trailGeometry.setPositions(path.flatMap(p => [p.x, p.y, p.z]))
  const trailMaterial = new addons.LineMaterial({ color: color('danger'), linewidth: 4 })
  const trail = new addons.Line2(trailGeometry, trailMaterial)
  scene.add(trail)

  const end = path.at(-1)!
  const el = document.createElement('div')
  el.style.cssText = 'font: 600 0.95rem var(--pm-font-sans); color: var(--pm-color-ink); background: var(--pm-color-surface); padding: 0.1em 0.5em; border-radius: 0.4em; border: 0.1em solid var(--pm-color-danger)'
  const tag = new addons.CSS2DObject(el)
  scene.add(tag)

  const place = new THREE.Vector3()
  const look = new THREE.Vector3()
  return {
    render(ms) {
      land.scale.y = Math.max(1e-3, phase(ms, 0))
      const drop = phase(ms, 1)
      const run = phase(ms, 2)
      const zoom = phase(ms, 3)
      // The ball falls onto the start, then walks the path; the trail shows the segments already walked.
      const s = run * (path.length - 1)
      const i = Math.min(path.length - 2, Math.floor(s))
      place.lerpVectors(path[i]!, path[i + 1]!, s - i)
      ball.position.copy(place).setY(place.y + (1 - drop) * 3)
      ball.scale.setScalar(drop > 0 ? 1 : 1e-3)
      trailGeometry.instanceCount = Math.floor(s)
      trail.visible = s >= 1
      el.textContent = `loss = ${loss(place.x, place.z).toFixed(3)}`
      tag.position.copy(place).setY(place.y + 0.5)
      el.style.opacity = String(clamp(run * 6))
      // A slow orbit over the whole timeline, then a push towards the minimum.
      const angle = -2.1 + 0.6 * (ms / total)
      camera.position.set(9 * Math.cos(angle), 6, 9 * Math.sin(angle)).lerp(look.copy(end).add(new THREE.Vector3(-1.8, 3.6, -4.6)), zoom)
      camera.lookAt(look.set(0, -0.2, 0).lerp(end, zoom))
      renderer.render(scene, camera)
      labels.render(scene, camera)
    },
    resize(w, h) {
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      labels.setSize(w, h)
    },
    dispose() {
      for (const item of [surface, material, wire, ballGeometry, ballMaterial, trailGeometry, trailMaterial]) item.dispose()
      labels.domElement.remove()
    },
  }
})
