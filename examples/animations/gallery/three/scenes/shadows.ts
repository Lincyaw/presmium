import { threeScene } from '@lincyaw/addon-motion/scene'

// A day over a small city: a DirectionalLight with a PCF shadow map softened by shadow.radius moving on an arc, a
// ShadowMaterial ground so only the shadows cover the page, the light's color lerped toward evening, and Fog whose
// color is the page background. Seek safety: the shadow map is redrawn every render, so it only depends on the light.
const clamp = (k: number) => Math.min(1, Math.max(0, k))
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2)

function random(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

export default threeScene(({ THREE, renderer, addons, at, width, height, color }) => {
  const phase = (ms: number, k: number) => ease(clamp((ms - at(k)) / (at(k + 1) - at(k))))
  // Shadows have to be on before the first render compiles the materials.
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap // PCFSoftShadowMap is gone in r18x; shadow.radius softens PCF
  const scene = new THREE.Scene()
  // Fog fades to its own color, not to transparent: the page background makes far blocks dissolve into the page.
  const fog = new THREE.Fog(color('bg'), 30, 40)
  scene.fog = fog
  const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100)
  camera.position.set(9, 7.5, 11)
  camera.lookAt(0, 0, -1)

  const sky = new THREE.HemisphereLight(0xffffff, 0x888888, 1.1)
  scene.add(sky)
  const sun = new THREE.DirectionalLight(0xffffff, 2.6)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.radius = 4
  Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10, near: 1, far: 40 })
  scene.add(sun, sun.target)

  const groundGeometry = new THREE.PlaneGeometry(40, 40)
  groundGeometry.rotateX(-Math.PI / 2)
  const groundMaterial = new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.35 }) // a shadow darkens in both themes; ink would light up in dark
  const ground = new THREE.Mesh(groundGeometry, groundMaterial)
  ground.receiveShadow = true
  scene.add(ground)

  const next = random(3)
  const blockGeometry = new addons.RoundedBoxGeometry(1, 1, 1, 2, 0.06)
  blockGeometry.translate(0, 0.5, 0) // grow from the ground when scaled in y
  const blockMaterial = new THREE.MeshStandardMaterial({ color: color('line-strong'), roughness: 0.8 }) // lit solids need a mid-tone in both themes
  const towerMaterial = new THREE.MeshStandardMaterial({ color: color('accent'), roughness: 0.6 })
  const blocks: { mesh: InstanceType<typeof THREE.Mesh>, h: number, delay: number }[] = []
  for (let gx = -5; gx <= 5; gx++) {
    for (let gz = -12; gz <= 3; gz++) {
      if (next() < 0.35) continue
      const tall = gx === 0 && gz === 0
      const mesh = new THREE.Mesh(blockGeometry, tall ? towerMaterial : blockMaterial)
      mesh.position.set(gx * 1.35, 0, gz * 1.35)
      mesh.scale.set(0.9, 1, 0.9)
      mesh.castShadow = mesh.receiveShadow = true
      scene.add(mesh)
      blocks.push({ mesh, h: tall ? 5 : 0.5 + 2.2 * next() ** 2, delay: next() * 0.4 })
    }
  }
  const noon = new THREE.Color(0xffffff)
  const dusk = new THREE.Color(color('warn'))

  return {
    render(ms) {
      const rise = clamp((ms - at(0)) / (at(1) - at(0)))
      const morning = phase(ms, 1)
      const evening = phase(ms, 2)
      const mist = phase(ms, 3)
      for (const { mesh, h, delay } of blocks) mesh.scale.y = Math.max(1e-3, h * ease(clamp((rise - delay) / 0.6)))
      // The sun's arc: from the east (low) to overhead, then to the west (low and orange).
      const angle = Math.PI * (0.12 + 0.38 * morning + 0.38 * evening)
      sun.position.set(14 * Math.cos(angle), 14 * Math.sin(angle), 4)
      sun.color.copy(noon).lerp(dusk, evening * 0.8)
      sun.intensity = 2.6 - 0.8 * evening
      fog.near = 30 - 24 * mist
      fog.far = 40 - 22 * mist
      renderer.render(scene, camera)
    },
    resize(w, h) {
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    },
    dispose() {
      for (const item of [groundGeometry, groundMaterial, blockGeometry, blockMaterial, towerMaterial]) item.dispose()
      sun.shadow.dispose()
    },
  }
})
