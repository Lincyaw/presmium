import { threeScene } from '@lincyaw/addon-motion/scene'

// InstancedMesh with per-instance color (setColorAt), a seeded scatter, CSS2D labels and a camera push-in.
// Seek safety: every instance matrix and color is recomputed from the time in each render; nothing accumulates.
const PER_CLUSTER = 120
const CENTERS: [number, number, number][] = [[-1.7, 0.7, 0], [1.6, 0.9, -0.6], [0.1, -1.3, 0.8]]
const NAMES = ['动物', '动词', '数字']
const TOKENS = ['accent', 'warn', 'danger']

function random(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}
const clamp = (k: number) => Math.min(1, Math.max(0, k))
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2)

export default threeScene(({ THREE, renderer, addons, root, at, width, height, color }) => {
  const phase = (ms: number, k: number) => ease(clamp((ms - at(k)) / (at(k + 1) - at(k))))
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
  scene.add(new THREE.AmbientLight(0xffffff, 1.3))
  const sun = new THREE.DirectionalLight(0xffffff, 2.2)
  sun.position.set(3, 4, 5)
  scene.add(sun)

  const labels = new addons.CSS2DRenderer()
  labels.setSize(width, height)
  Object.assign(labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' })
  root.append(labels.domElement)

  const muted = new THREE.Color(color('muted'))
  const tints = TOKENS.map(name => new THREE.Color(color(name)))
  const next = random(11)
  const points = CENTERS.flatMap((center, cluster) => Array.from({ length: PER_CLUSTER }, () => {
    const scatter = new THREE.Vector3((next() - 0.5) * 7, (next() - 0.5) * 4.4, (next() - 0.5) * 4)
    // A Gaussian-ish blob around the center: the mean of three uniforms.
    const blob = () => (next() + next() + next() - 1.5) * 0.7
    const near = new THREE.Vector3(...center).add(new THREE.Vector3(blob(), blob(), blob()))
    return { scatter, near, cluster, delay: next() * 0.3, pop: next() * 0.5 }
  }))
  const geometry = new THREE.SphereGeometry(0.07, 14, 10)
  const material = new THREE.MeshStandardMaterial({ roughness: 0.4 })
  const mesh = new THREE.InstancedMesh(geometry, material, points.length)
  mesh.setColorAt(0, muted) // creates instanceColor before the first render
  scene.add(mesh)

  const tags = CENTERS.map((center, i) => {
    const el = document.createElement('div')
    el.textContent = NAMES[i]!
    // Labels are HTML, so they follow the theme through the tokens without asking color().
    el.style.cssText = `font: 600 1rem var(--pm-font-sans); color: var(--pm-color-ink); padding: 0.1em 0.5em; border-radius: 0.4em; background: var(--pm-color-surface); border: 0.1em solid var(--pm-color-${TOKENS[i]})`
    const tag = new addons.CSS2DObject(el)
    tag.position.set(center[0], center[1] + 1.15, center[2])
    scene.add(tag)
    return { tag, el }
  })

  const place = new THREE.Object3D()
  const tint = new THREE.Color()
  const far = new THREE.Vector3(0, 0.3, 7)
  const close = new THREE.Vector3(CENTERS[0]![0] + 0.5, CENTERS[0]![1] + 0.3, 3.2)
  const look = new THREE.Vector3()
  const focus = new THREE.Vector3(...CENTERS[0]!)

  return {
    render(ms) {
      const appear = clamp((ms - at(0)) / (at(1) - at(0)))
      const gather = clamp((ms - at(1)) / (at(2) - at(1)))
      const named = phase(ms, 2)
      const zoom = phase(ms, 3)
      points.forEach((point, i) => {
        const k = ease(clamp((gather - point.delay) / (1 - point.delay)))
        place.position.lerpVectors(point.scatter, point.near, k)
        const grow = ease(clamp((appear - point.pop) / 0.5))
        place.scale.setScalar(grow * (point.cluster === 0 ? 1 : 1 - 0.45 * zoom))
        place.updateMatrix()
        mesh.setMatrixAt(i, place.matrix)
        mesh.setColorAt(i, tint.copy(muted).lerp(tints[point.cluster]!, k))
      })
      mesh.instanceMatrix.needsUpdate = true
      mesh.instanceColor!.needsUpdate = true
      tags.forEach(({ el }, i) => { el.style.opacity = String(named * (i === 0 ? 1 : 1 - 0.7 * zoom)) })
      mesh.rotation.y = 0.3 * Math.sin(ms / 2600)
      tags.forEach(({ tag }, i) => tag.position.set(CENTERS[i]![0], CENTERS[i]![1] + 1.15, CENTERS[i]![2]).applyAxisAngle(THREE.Object3D.DEFAULT_UP, mesh.rotation.y))
      camera.position.lerpVectors(far, close, zoom)
      camera.lookAt(look.set(0, 0, 0).lerp(focus.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, mesh.rotation.y), zoom))
      renderer.render(scene, camera)
      labels.render(scene, camera)
    },
    resize(w, h) {
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      labels.setSize(w, h)
    },
    dispose() {
      geometry.dispose()
      material.dispose()
      labels.domElement.remove()
    },
  }
})
