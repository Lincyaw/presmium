import { threeScene } from '@lincyaw/addon-motion/scene'

// A product hero loop with Three.js: a tablet floats, swings 25° each way and bobs, while a phone and a sheet of
// paper orbit it, each a different form of the same lesson. Every pose is a periodic function of the phase
// (ms / total), so the last frame is the first and the loop has no seam. Its screen is drawn on a canvas (a chart
// slide, no words), so the frame does not wait for an image to load. Space and turning objects are what
// Three.js is for; a product shot needs no text.
export default threeScene(({ THREE, renderer, addons, total, width, height, color }) => {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(32, width / height, 0.1, 100)
  camera.position.set(0, 0.4, 9)
  camera.lookAt(0, 0, 0)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x888888, 1.6))
  const key = new THREE.DirectionalLight(0xffffff, 2.2)
  key.position.set(3, 5, 6)
  scene.add(key)

  // The screen: a slide with a title bar and a bar chart whose last bar is the accent color.
  const canvas = document.createElement('canvas')
  canvas.width = 1024
  canvas.height = 640
  const g = canvas.getContext('2d')!
  g.fillStyle = color('surface'); g.fillRect(0, 0, 1024, 640)
  g.fillStyle = color('ink'); g.fillRect(80, 70, 420, 46)
  g.fillStyle = color('line-strong'); g.fillRect(80, 140, 300, 22)
  ;[0.35, 0.55, 0.45, 0.7, 0.92].forEach((v, i) => {
    g.fillStyle = color(i === 4 ? 'accent' : 'accent-soft')
    g.fillRect(110 + i * 165, 560 - v * 340, 110, v * 340)
  })
  g.fillStyle = color('line'); g.fillRect(80, 562, 860, 6)
  const screen = new THREE.CanvasTexture(canvas)
  screen.colorSpace = THREE.SRGBColorSpace

  const body = new THREE.MeshStandardMaterial({ color: color('line-strong'), roughness: 0.45, metalness: 0.1 })
  const tablet = new THREE.Group()
  tablet.add(new THREE.Mesh(new addons.RoundedBoxGeometry(4.2, 2.8, 0.16, 6, 0.14), body))
  const face = new THREE.Mesh(new THREE.PlaneGeometry(3.9, 2.44), new THREE.MeshBasicMaterial({ map: screen }))
  face.position.z = 0.081
  tablet.add(face)
  scene.add(tablet)

  // Two satellites: a phone (accent) and a sheet of paper (surface), on one tilted orbit, half a turn apart.
  const phone = new THREE.Mesh(new addons.RoundedBoxGeometry(0.62, 1.2, 0.08, 4, 0.08), new THREE.MeshStandardMaterial({ color: color('accent'), roughness: 0.4 }))
  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.1, 0.02), new THREE.MeshStandardMaterial({ color: color('surface'), roughness: 0.9 }))
  scene.add(phone, paper)

  // The soft shadow: a disc under the tablet that shrinks as it rises.
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshBasicMaterial({ color: color('ink'), transparent: true, opacity: 0.12 }))
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = -2.1
  scene.add(shadow)

  const TAU = Math.PI * 2
  return {
    render(ms) {
      const p = (ms % total) / total
      tablet.rotation.y = Math.sin(p * TAU) * 0.44
      tablet.rotation.x = -0.08 + Math.sin(p * TAU * 2) * 0.03
      tablet.position.y = 0.1 + Math.sin(p * TAU) * 0.12
      shadow.scale.set(2.3 - Math.sin(p * TAU) * 0.15, 0.5, 1)
      ;[phone, paper].forEach((m, i) => {
        const a = p * TAU + i * Math.PI
        m.position.set(Math.cos(a) * 3.2, 0.25 + Math.sin(a) * 0.55, Math.sin(a) * 1.6)
        m.rotation.set(0.15, -a + Math.PI / 2, 0.1)
      })
      renderer.render(scene, camera)
    },
    resize(w, h) {
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    },
    dispose() {
      scene.traverse(o => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose()
          ;[o.material].flat().forEach(m => m.dispose())
        }
      })
      screen.dispose()
    },
  }
})
