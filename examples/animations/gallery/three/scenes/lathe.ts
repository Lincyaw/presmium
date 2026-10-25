import { threeScene } from '@lincyaw/addon-motion/scene'

// A solid of revolution and its cross-section: a profile drawn as a fat Line2, a LatheGeometry rebuilt with the
// sweep angle of the time, then a clipping plane (material.clippingPlanes, renderer.localClippingEnabled) cutting it.
// Seek safety: the lathe is rebuilt only when the quantized sweep changes, and is the same for the same time.
const clamp = (k: number) => Math.min(1, Math.max(0, k))
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2)
const SEGMENTS = 96

export default threeScene(({ THREE, renderer, addons, root, at, width, height, color }) => {
  const phase = (ms: number, k: number) => ease(clamp((ms - at(k)) / (at(k + 1) - at(k))))
  renderer.localClippingEnabled = true
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 1.5))
  const key = new THREE.DirectionalLight(0xffffff, 2)
  key.position.set(4, 5, 6)
  scene.add(key)

  const labels = new addons.CSS2DRenderer()
  labels.setSize(width, height)
  Object.assign(labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' })
  root.append(labels.domElement)

  // The profile: a vase, r(y) for y in [0, 3].
  const profile = Array.from({ length: 60 }, (_, i) => {
    const y = (i / 59) * 3
    return new THREE.Vector2(0.55 + 0.45 * Math.sin(y * 1.9 + 0.4) + 0.12 * y, y - 1.5)
  })
  const profileGeometry = new addons.LineGeometry()
  profileGeometry.setPositions(profile.flatMap(p => [p.x, p.y, 0]))
  const profileMaterial = new addons.LineMaterial({ color: color('danger'), linewidth: 4 })
  const outline = new addons.Line2(profileGeometry, profileMaterial)
  scene.add(outline)
  const axisGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -1.9, 0), new THREE.Vector3(0, 1.9, 0)])
  const axisMaterial = new THREE.LineDashedMaterial({ color: color('muted'), dashSize: 0.1, gapSize: 0.07 })
  const axis = new THREE.Line(axisGeometry, axisMaterial)
  axis.computeLineDistances()
  scene.add(axis)

  const plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)
  const material = new THREE.MeshStandardMaterial({ color: color('accent'), roughness: 0.4, clippingPlanes: [plane] })
  // The inside gets its own color (BackSide), so the cut shows the wall from within.
  const inner = new THREE.MeshStandardMaterial({ color: color('warn'), roughness: 0.7, side: THREE.BackSide, clippingPlanes: [plane] })
  const solid = new THREE.Mesh(new THREE.BufferGeometry(), material)
  const lining = new THREE.Mesh(solid.geometry, inner)
  scene.add(solid, lining)
  let built = -1
  const sweep = (fraction: number) => {
    const steps = Math.round(fraction * SEGMENTS)
    if (steps === built) return
    solid.geometry.dispose()
    // LatheGeometry puts phi = 0 on +z; phiStart π/2 starts the sweep at the drawn profile (z = 0, x > 0).
    solid.geometry = steps === 0 ? new THREE.BufferGeometry() : new THREE.LatheGeometry(profile, steps, Math.PI / 2, (2 * Math.PI * steps) / SEGMENTS)
    lining.geometry = solid.geometry
    built = steps
  }
  // The cutting plane, drawn as a faint sheet.
  const sheetGeometry = new THREE.PlaneGeometry(4, 4)
  const sheetMaterial = new THREE.MeshBasicMaterial({ color: color('warn'), transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false })
  const sheet = new THREE.Mesh(sheetGeometry, sheetMaterial)
  scene.add(sheet)

  const el = document.createElement('div')
  el.style.cssText = 'font: italic 1.1rem var(--pm-font-serif); color: var(--pm-color-ink)'
  el.textContent = 'V = π ∫ r(y)² dy'
  const formula = new addons.CSS2DObject(el)
  formula.position.set(0, 2.2, 0)
  scene.add(formula)

  return {
    render(ms) {
      const draw = phase(ms, 0)
      const turn = phase(ms, 1)
      const cut = phase(ms, 2)
      const view = phase(ms, 3)
      profileGeometry.instanceCount = Math.floor(draw * (profile.length - 1))
      outline.visible = draw > 0
      sweep(turn)
      // The plane z = c moves from in front of the solid to its middle: the near half is cut away.
      plane.constant = 2 - 2 * cut
      sheet.position.z = 2 - 2 * cut
      sheetMaterial.opacity = 0.15 * Math.sin(Math.PI * cut)
      el.style.opacity = String(turn)
      const angle = 0.5 - 0.9 * view
      camera.position.set(8 * Math.sin(angle), 2.2 + 1.5 * view, 8 * Math.cos(angle))
      camera.lookAt(0, 0, 0)
      renderer.render(scene, camera)
      labels.render(scene, camera)
    },
    resize(w, h) {
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      labels.setSize(w, h)
    },
    dispose() {
      for (const item of [solid.geometry, material, inner, profileGeometry, profileMaterial, axisGeometry, axisMaterial, sheetGeometry, sheetMaterial]) item.dispose()
      labels.domElement.remove()
    },
  }
})
