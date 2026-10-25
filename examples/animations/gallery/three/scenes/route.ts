import { threeScene } from '@lincyaw/addon-motion/scene'

// A request's route through a system: RoundedBoxGeometry nodes, a CatmullRomCurve3 swept by TubeGeometry and grown
// with setDrawRange (whole rings of the index), a packet moved by getPointAt, and a follow camera placed with getTangentAt.
// Seek safety: the draw range, packet and camera are all read off the curve at the time's parameter.
const clamp = (k: number) => Math.min(1, Math.max(0, k))
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2)
const NODES: { name: string, at: [number, number, number] }[] = [
  { name: '浏览器', at: [-4, 0, 1.5] },
  { name: '网关', at: [-1.8, 0.6, -0.8] },
  { name: '服务', at: [0.6, -0.2, 1] },
  { name: '缓存', at: [2.4, 1.1, -1.2] },
  { name: '数据库', at: [4, -0.4, 0.6] },
]
const TUBULAR = 240
const RADIAL = 12

export default threeScene(({ THREE, renderer, addons, root, at, width, height, color }) => {
  const phase = (ms: number, k: number) => ease(clamp((ms - at(k)) / (at(k + 1) - at(k))))
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, width / height, 0.05, 100)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 1.8))
  const sun = new THREE.DirectionalLight(0xffffff, 1.6)
  sun.position.set(2, 5, 4)
  scene.add(sun)

  const labels = new addons.CSS2DRenderer()
  labels.setSize(width, height)
  Object.assign(labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' })
  root.append(labels.domElement)

  const boxGeometry = new addons.RoundedBoxGeometry(0.9, 0.6, 0.6, 4, 0.12)
  const boxMaterial = new THREE.MeshStandardMaterial({ color: color('line-strong'), roughness: 0.5 })
  const edgeMaterial = new THREE.LineBasicMaterial({ color: color('line-strong') })
  const edges = new THREE.EdgesGeometry(boxGeometry, 30)
  const nodes = NODES.map(node => {
    const box = new THREE.Mesh(boxGeometry, boxMaterial)
    box.add(new THREE.LineSegments(edges, edgeMaterial))
    box.position.set(...node.at)
    const el = document.createElement('div')
    el.textContent = node.name
    el.style.cssText = 'font: 600 0.9rem var(--pm-font-sans); color: var(--pm-color-ink)'
    const tag = new addons.CSS2DObject(el)
    tag.position.set(0, 0.62, 0)
    box.add(tag)
    scene.add(box)
    return { box, el }
  })

  const curve = new THREE.CatmullRomCurve3(NODES.map(node => new THREE.Vector3(...node.at)), false, 'centripetal')
  const tubeGeometry = new THREE.TubeGeometry(curve, TUBULAR, 0.07, RADIAL, false)
  const tubeMaterial = new THREE.MeshStandardMaterial({ color: color('accent'), roughness: 0.35, transparent: true, opacity: 0.85 })
  const tube = new THREE.Mesh(tubeGeometry, tubeMaterial)
  scene.add(tube)
  const packetGeometry = new THREE.IcosahedronGeometry(0.16, 2)
  const packetMaterial = new THREE.MeshStandardMaterial({ color: color('warn'), emissive: color('warn'), emissiveIntensity: 0.6 })
  const packet = new THREE.Mesh(packetGeometry, packetMaterial)
  scene.add(packet)

  const wide = new THREE.Vector3(0, 4.2, 8.2)
  const chase = new THREE.Vector3()
  const look = new THREE.Vector3()
  const tangent = new THREE.Vector3()
  const offset = new THREE.Vector3(0, 2.2, 3.6)
  return {
    render(ms) {
      const pop = clamp((ms - at(0)) / (at(1) - at(0)))
      const grow = phase(ms, 1)
      const travel = phase(ms, 2)
      const back = phase(ms, 3)
      nodes.forEach(({ box, el }, i) => {
        const k = ease(clamp(pop * 1.6 - i * 0.15))
        box.scale.setScalar(Math.max(1e-3, k))
        el.style.opacity = String(k)
      })
      // TubeGeometry's index is ring after ring: RADIAL quads (6 indices each) per tubular segment.
      tubeGeometry.setDrawRange(0, Math.floor(grow * TUBULAR) * RADIAL * 6)
      tube.visible = grow > 0
      const u = clamp(travel)
      packet.visible = travel > 0
      curve.getPointAt(u, packet.position)
      // Follow camera: above and in front of the packet, a little behind it along the route; it pulls back at the end.
      curve.getTangentAt(u, tangent)
      chase.copy(packet.position).addScaledVector(tangent, -1.2).add(offset)
      const ride = ease(clamp(travel * 4)) * (1 - back)
      camera.position.lerpVectors(wide, chase, ride)
      look.set(0, 0, 0).lerp(packet.position, ride)
      camera.lookAt(look)
      renderer.render(scene, camera)
      labels.render(scene, camera)
    },
    resize(w, h) {
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      labels.setSize(w, h)
    },
    dispose() {
      for (const item of [boxGeometry, boxMaterial, edgeMaterial, edges, tubeGeometry, tubeMaterial, packetGeometry, packetMaterial]) item.dispose()
      labels.domElement.remove()
    },
  }
})
