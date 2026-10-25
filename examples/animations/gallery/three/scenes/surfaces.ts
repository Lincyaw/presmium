import { threeScene } from '@lincyaw/addon-motion/scene'

// Morph targets between surfaces built with ParametricGeometry (saddle → bowl → monkey saddle): every surface has the
// same grid, so their positions and normals become morphAttributes; a wireframe overlay shares the geometry.
// Seek safety: morphTargetInfluences are set from the time on both meshes; the formula label cross-fades by step.
const clamp = (k: number) => Math.min(1, Math.max(0, k))
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2)
const SURFACES: [string, (x: number, y: number) => number][] = [
  ['z = x² − y²', (x, y) => x * x - y * y],
  ['z = x² + y²', (x, y) => x * x + y * y],
  ['z = x³ − 3xy²', (x, y) => (x * x * x - 3 * x * y * y) / 2.5], // flattened to fit the frame
]

export default threeScene(({ THREE, renderer, addons, root, at, total, width, height, color }) => {
  const phase = (ms: number, k: number) => ease(clamp((ms - at(k)) / (at(k + 1) - at(k))))
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 1.4))
  const key = new THREE.DirectionalLight(0xffffff, 2)
  key.position.set(3, 5, 2)
  scene.add(key)

  const labels = new addons.CSS2DRenderer()
  labels.setSize(width, height)
  Object.assign(labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' })
  root.append(labels.domElement)

  // ParametricGeometry calls f(u, v, target) with u, v in [0, 1]; z is up in the formulas, y is up in three.js.
  const surface = (f: (x: number, y: number) => number) => new addons.ParametricGeometry((u, v, target) => {
    const x = (u - 0.5) * 2.4
    const y = (v - 0.5) * 2.4
    target.set(x, f(x, y) * 0.55, y)
  }, 64, 64)
  const [base, ...targets] = SURFACES.map(([, f]) => surface(f))
  const geometry = base!
  geometry.morphAttributes.position = targets.map(t => t.attributes.position!)
  geometry.morphAttributes.normal = targets.map(t => t.attributes.normal!)
  const material = new THREE.MeshStandardMaterial({ color: color('accent'), roughness: 0.45, metalness: 0.1, side: THREE.DoubleSide })
  const wire = new THREE.MeshBasicMaterial({ color: color('ink'), wireframe: true, transparent: true, opacity: 0 })
  const solid = new THREE.Mesh(geometry, material)
  const mesh = new THREE.Mesh(geometry, wire)
  const group = new THREE.Group()
  group.add(solid, mesh)
  scene.add(group)

  const formulas = SURFACES.map(([text]) => {
    const el = document.createElement('div')
    el.textContent = text
    el.style.cssText = 'font: italic 1.25rem var(--pm-font-serif); color: var(--pm-color-ink)'
    const tag = new addons.CSS2DObject(el)
    tag.position.set(0, 1.9, 0)
    scene.add(tag)
    return el
  })

  return {
    render(ms) {
      const show = phase(ms, 0)
      const toBowl = phase(ms, 1)
      const toMonkey = phase(ms, 2)
      const lines = phase(ms, 3)
      group.scale.set(show, Math.max(1e-3, show), show)
      // Influences are weights of (target − base): bowl rises then gives way to the monkey saddle.
      const influences = [toBowl * (1 - toMonkey), toMonkey]
      solid.morphTargetInfluences!.splice(0, 2, ...influences)
      mesh.morphTargetInfluences!.splice(0, 2, ...influences)
      wire.opacity = 0.35 * lines
      material.roughness = 0.45 + 0.4 * lines
      const weights = [show * (1 - toBowl), toBowl * (1 - toMonkey), toMonkey]
      formulas.forEach((el, i) => { el.style.opacity = String(weights[i]) })
      group.rotation.y = -0.5 + 1.2 * (ms / total)
      camera.position.set(0, 2.6 + 1.2 * lines, 5.2)
      camera.lookAt(0, 0.1, 0)
      renderer.render(scene, camera)
      labels.render(scene, camera)
    },
    resize(w, h) {
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      labels.setSize(w, h)
    },
    dispose() {
      for (const item of [geometry, ...targets, material, wire]) item.dispose()
      labels.domElement.remove()
    },
  }
})
