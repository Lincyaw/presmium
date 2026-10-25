import { threeScene } from '@lincyaw/addon-motion/scene'

// Five materials on one torus knot: Standard (metal), Physical (clearcoat, iridescence), Toon, Normal and a
// wireframe Lambert, lit by an environment made with PMREMGenerator.fromScene from a few core meshes, plus a light
// that orbits. Seek safety: the light angle, roughness and turntable come from the time; the environment is made once.
const clamp = (k: number) => Math.min(1, Math.max(0, k))
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2)

export default threeScene(({ THREE, renderer, addons, root, at, total, width, height, color }) => {
  const phase = (ms: number, k: number) => ease(clamp((ms - at(k)) / (at(k + 1) - at(k))))
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 100)
  camera.position.set(0, 0.6, 11)
  camera.lookAt(0, 0, 0)

  // An environment for reflections without a file: a box room with two bright panels, prefiltered once.
  const room = new THREE.Scene()
  const roomGeometry = new THREE.BoxGeometry(10, 10, 10)
  const roomMaterial = new THREE.MeshBasicMaterial({ color: 0x777777, side: THREE.BackSide })
  room.add(new THREE.Mesh(roomGeometry, roomMaterial))
  const panelGeometry = new THREE.PlaneGeometry(4, 2)
  const panelMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })
  for (const [x, y, z] of [[0, 4.9, 0], [-4.9, 1, 1]] as const) {
    const panel = new THREE.Mesh(panelGeometry, panelMaterial)
    panel.position.set(x, y, z)
    panel.lookAt(0, 0, 0)
    room.add(panel)
  }
  const pmrem = new THREE.PMREMGenerator(renderer)
  const environment = pmrem.fromScene(room, 0.04)
  scene.environment = environment.texture
  scene.environmentIntensity = 1.2

  const lamp = new THREE.PointLight(0xffffff, 30, 0, 2)
  const bulbGeometry = new THREE.SphereGeometry(0.08, 12, 8)
  const bulbMaterial = new THREE.MeshBasicMaterial({ color: color('warn') })
  lamp.add(new THREE.Mesh(bulbGeometry, bulbMaterial))
  scene.add(lamp)
  scene.add(new THREE.AmbientLight(0xffffff, 0.3))

  const labels = new addons.CSS2DRenderer()
  labels.setSize(width, height)
  Object.assign(labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' })
  root.append(labels.domElement)

  const accent = color('accent')
  // A metal's color is its reflectance: a dark token would make a black mirror, so the metal is the light grey.
  const standard = new THREE.MeshStandardMaterial({ color: color('line-strong'), metalness: 1, roughness: 0.2 })
  const materials: [string, InstanceType<typeof THREE.Material>][] = [
    ['Standard', standard],
    ['Physical', new THREE.MeshPhysicalMaterial({ color: accent, roughness: 0.5, clearcoat: 1, clearcoatRoughness: 0.05, iridescence: 0.8 })],
    ['Toon', new THREE.MeshToonMaterial({ color: accent })],
    ['Normal', new THREE.MeshNormalMaterial()],
    ['Wireframe', new THREE.MeshLambertMaterial({ color: accent, wireframe: true })],
  ]
  const geometry = new THREE.TorusKnotGeometry(0.55, 0.2, 160, 24)
  const items = materials.map(([name, material], i) => {
    const mesh = new THREE.Mesh(geometry, material)
    mesh.position.x = (i - 2) * 2.1
    scene.add(mesh)
    const el = document.createElement('div')
    el.style.cssText = 'font: 0.85rem var(--pm-font-mono); color: var(--pm-color-ink); text-align: center; white-space: pre'
    el.textContent = name
    const tag = new addons.CSS2DObject(el)
    tag.position.set(mesh.position.x, -1.25, 0)
    scene.add(tag)
    return { mesh, el, name }
  })

  return {
    render(ms) {
      const enter = clamp((ms - at(0)) / (at(1) - at(0)))
      const orbit = phase(ms, 1)
      const rough = phase(ms, 2)
      items.forEach(({ mesh, el }, i) => {
        const k = ease(clamp(enter * 1.8 - i * 0.2))
        mesh.scale.setScalar(Math.max(1e-3, k))
        mesh.rotation.set(0.4, -0.6 + 1.6 * (ms / total) + i * 0.3, 0)
        el.style.opacity = String(k)
      })
      // The lamp swings from the left, over the top, to the right.
      const angle = Math.PI * (1 - orbit)
      lamp.position.set(5 * Math.cos(angle), 1.5 + 1.5 * Math.sin(angle), 3)
      standard.roughness = 0.2 + 0.7 * rough
      items[0]!.el.textContent = rough > 0 ? `Standard\nroughness ${standard.roughness.toFixed(2)}` : 'Standard'
      renderer.render(scene, camera)
      labels.render(scene, camera)
    },
    resize(w, h) {
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      labels.setSize(w, h)
    },
    dispose() {
      for (const [, material] of materials) material.dispose()
      for (const item of [geometry, roomGeometry, roomMaterial, panelGeometry, panelMaterial, bulbGeometry, bulbMaterial, environment, pmrem]) item.dispose()
      labels.domElement.remove()
    },
  }
})
