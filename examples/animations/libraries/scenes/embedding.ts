import { threeScene } from '@lincyaw/slidev-addon-motion/scene'

// Word vectors with Three.js: scattered points gather into three clusters, then the camera moves in on
// one of them. The look is computed from the time only (a seeded scatter, eased paths), never from frames.
const PER_CLUSTER = 90
const CENTERS: [number, number, number][] = [[-1.6, 0.6, 0], [1.5, 0.9, -0.6], [0.1, -1.3, 0.8]]
const COLORS = [0xe4572e, 0x17a3a0, 0xf2b705]

function random(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2)
const clamp = (k: number) => Math.min(1, Math.max(0, k))

export default threeScene(({ THREE, renderer, at, width, height }) => {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
  scene.add(new THREE.AmbientLight(0xffffff, 1.4))
  const sun = new THREE.DirectionalLight(0xffffff, 2)
  sun.position.set(3, 4, 5)
  scene.add(sun)
  const next = random(7)
  const points = CENTERS.flatMap((center, cluster) => Array.from({ length: PER_CLUSTER }, () => {
    const scatter = new THREE.Vector3((next() - 0.5) * 7, (next() - 0.5) * 4.5, (next() - 0.5) * 4)
    const near = new THREE.Vector3(...center).add(new THREE.Vector3((next() - 0.5) * 0.9, (next() - 0.5) * 0.9, (next() - 0.5) * 0.9))
    return { scatter, near, cluster, delay: next() * 0.25 }
  }))
  const geometry = new THREE.SphereGeometry(0.075, 14, 10)
  const material = new THREE.MeshStandardMaterial({ roughness: 0.45 })
  const mesh = new THREE.InstancedMesh(geometry, material, points.length)
  points.forEach((point, i) => mesh.setColorAt(i, new THREE.Color(COLORS[point.cluster])))
  const group = new THREE.Group()
  group.add(mesh)
  scene.add(group)
  const place = new THREE.Object3D()
  const position = new THREE.Vector3()
  const far = new THREE.Vector3(0, 0.3, 6.5)
  const close = new THREE.Vector3(...CENTERS[0]!).add(new THREE.Vector3(0.4, 0.2, 3))
  const look = new THREE.Vector3()

  return {
    render(ms) {
      const appear = ease(clamp((ms - at(0)) / (at(1) - at(0))))
      const gather = clamp((ms - at(1)) / (at(2) - at(1)))
      const zoom = ease(clamp((ms - at(2)) / (at(3) - at(2))))
      points.forEach((point, i) => {
        const k = ease(clamp((gather - point.delay) / (1 - point.delay)))
        position.lerpVectors(point.scatter, point.near, k)
        place.position.copy(position)
        place.scale.setScalar(appear * (zoom > 0 && point.cluster !== 0 ? 1 - 0.5 * zoom : 1))
        place.updateMatrix()
        mesh.setMatrixAt(i, place.matrix)
      })
      mesh.instanceMatrix.needsUpdate = true
      group.rotation.y = 0.35 * Math.sin(ms / 2400)
      camera.position.lerpVectors(far, close, zoom)
      look.set(0, 0, 0).lerp(new THREE.Vector3(...CENTERS[0]!), zoom)
      camera.lookAt(look)
      renderer.render(scene, camera)
    },
    resize(w, h) {
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    },
    dispose() {
      geometry.dispose()
      material.dispose()
    },
  }
})
