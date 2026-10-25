import { threeScene } from '@lincyaw/addon-motion/scene'

// The convex hull of a point set: ConvexGeometry, its edges as EdgesGeometry LineSegments drawn with setDrawRange,
// translucent faces fading in, and the hull's vertices marked on an InstancedMesh. Seek safety: the hull is computed
// once; the draw range, opacity and colors are read from the time.
const COUNT = 48
const clamp = (k: number) => Math.min(1, Math.max(0, k))
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2)

function random(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

export default threeScene(({ THREE, renderer, addons, at, total, width, height, color }) => {
  const phase = (ms: number, k: number) => ease(clamp((ms - at(k)) / (at(k + 1) - at(k))))
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100)
  camera.position.set(0, 1.4, 6.5)
  camera.lookAt(0, 0, 0)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 1.6))
  const key = new THREE.DirectionalLight(0xffffff, 1.6)
  key.position.set(3, 4, 5)
  scene.add(key)

  const next = random(21)
  const points = Array.from({ length: COUNT }, () => {
    // Inside an ellipsoid, so a fair share of points stay inside the hull.
    const v = new THREE.Vector3(next() * 2 - 1, next() * 2 - 1, next() * 2 - 1)
    if (v.length() > 1) v.setLength(next())
    return v.multiply(new THREE.Vector3(2, 1.3, 1.5))
  })
  const hullGeometry = new addons.ConvexGeometry(points)
  const corners = new Set<string>()
  const hp = hullGeometry.attributes.position!
  for (let i = 0; i < hp.count; i++) corners.add(`${hp.getX(i).toFixed(5)},${hp.getY(i).toFixed(5)},${hp.getZ(i).toFixed(5)}`)
  const onHull = points.map(p => corners.has(`${p.x.toFixed(5)},${p.y.toFixed(5)},${p.z.toFixed(5)}`))

  const faceMaterial = new THREE.MeshStandardMaterial({ color: color('accent'), transparent: true, opacity: 0, roughness: 0.3, depthWrite: false, side: THREE.DoubleSide })
  const hull = new THREE.Mesh(hullGeometry, faceMaterial)
  const edgeGeometry = new THREE.EdgesGeometry(hullGeometry, 1)
  const edgeMaterial = new THREE.LineBasicMaterial({ color: color('accent') })
  const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial)
  const dotGeometry = new THREE.SphereGeometry(0.06, 14, 10)
  const dotMaterial = new THREE.MeshStandardMaterial({ roughness: 0.4 })
  const dots = new THREE.InstancedMesh(dotGeometry, dotMaterial, COUNT)
  const place = new THREE.Object3D()
  const group = new THREE.Group()
  group.add(dots, edges, hull)
  scene.add(group)
  const plain = new THREE.Color(color('muted'))
  const marked = new THREE.Color(color('danger'))
  const tint = new THREE.Color()
  const edgeCount = edgeGeometry.attributes.position!.count

  return {
    render(ms) {
      const appear = clamp((ms - at(0)) / (at(1) - at(0)))
      const draw = phase(ms, 1)
      const fill = phase(ms, 2)
      points.forEach((p, i) => {
        place.position.copy(p)
        place.scale.setScalar(ease(clamp(appear * 2 - i / COUNT)) * (onHull[i] ? 1 + 0.6 * fill : 1))
        place.updateMatrix()
        dots.setMatrixAt(i, place.matrix)
        dots.setColorAt(i, tint.copy(plain).lerp(marked, onHull[i] ? fill : 0))
      })
      dots.instanceMatrix.needsUpdate = true
      dots.instanceColor!.needsUpdate = true
      // Two vertices per segment: draw whole segments.
      edgeGeometry.setDrawRange(0, Math.floor(draw * edgeCount / 2) * 2)
      faceMaterial.opacity = 0.3 * fill
      group.rotation.y = 0.2 + 1.4 * (ms / total)
      renderer.render(scene, camera)
    },
    resize(w, h) {
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    },
    dispose() {
      for (const item of [hullGeometry, faceMaterial, edgeGeometry, edgeMaterial, dotGeometry, dotMaterial]) item.dispose()
    },
  }
})
