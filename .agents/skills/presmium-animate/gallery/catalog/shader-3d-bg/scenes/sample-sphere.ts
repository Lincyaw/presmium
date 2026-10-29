import { threeScene } from '@lincyaw/addon-motion/scene'
import { TYPE } from '../../../lengths/scenes/kit/frame.ts'
import { hash, mulberry32 } from '../../../lengths/scenes/kit/fx/random.ts'
import { disposeAll } from '../../../lengths/scenes/kit/three-fx.ts'
import { ease, phase } from '../../../lengths/scenes/kit/fx/time.ts'
import { fonts } from './lib/figures.ts'
import { overlay } from './lib/overlay.ts'

// Many samples, then one: a dataset's samples (handwritten-looking digits by default) sit on a turning sphere, and
// one of them is taken out, enlarged and labelled. For "a dataset of many items; here is one item and its label".
// `spin` (1.8 s): the samples grow in as a wave from the point nearest the camera (0–0.9 s) while the sphere turns
// most of a turn and slows down (0–1.8 s); the title line stays at the top. The sphere keeps a slow drift of its
// own through every state, so it never freezes. `pick` (1.4 s): the sphere makes room, moving left and dimming
// (0–0.45 s); then the sample nearest the camera at that moment flies out to the right and grows to about four
// times its size (0.35–1.25 s, both ends eased), landing with a small overshoot; the cause (room made) comes
// before the effect (the sample arrives). `label` (1.8 s): the sample's id and its label rise under it
// (0–0.4 s), then hold for 1.4 s; 5 s in all. The samples are drawn on canvases from the parameters at build,
// each with a seeded tilt, size and offset, so the same sample looks the same at every seek; samples always face
// the camera (sprites), and fog in the page colour fades the far side of the sphere.
// Adapted from HyperFrames carousel-orbit-1 … carousel-orbit-5.

export default threeScene(({ THREE, renderer, root, at, width, height, color, parameters }) => {
  const glyphs = [...((parameters.samples as string | undefined) ?? '0123456789')]
  const count = Math.max(12, Math.min(160, (parameters.count as number | undefined) ?? 72))
  const title = (parameters.title as string | undefined) ?? '训练集：6 万张手写数字'
  const sampleId = (parameters.sampleId as string | undefined) ?? '样本 #04821'
  const labelText = (parameters.label as string | undefined) ?? '标签：{glyph}'
  const R = 2.35, SIZE = 0.54, PX = 256, GROW = 4
  const f = fonts(root)

  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(new THREE.Color(color('bg')), 9.2, 13.6)
  const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 100)
  camera.position.set(0, 0, 11)
  camera.lookAt(0, 0, 0)

  // One canvas per sample: a rounded tile with a glyph in ink, tilted, sized and offset by a seeded generator.
  const tile = (i: number) => {
    const rng = mulberry32(1000 + i)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = PX
    const g = canvas.getContext('2d')!
    g.beginPath()
    g.roundRect(4, 4, PX - 8, PX - 8, PX * 0.12)
    g.fillStyle = color('surface')
    g.fill()
    g.lineWidth = 6
    g.strokeStyle = color('line-strong')
    g.stroke()
    g.translate(PX / 2 + (rng() - 0.5) * PX * 0.1, PX / 2 + (rng() - 0.5) * PX * 0.08)
    g.rotate((rng() - 0.5) * 0.45)
    const s = 0.82 + rng() * 0.25
    g.font = `${rng() < 0.5 ? 400 : 600} ${Math.round(PX * 0.62 * s)}px ${rng() < 0.6 ? f.serif : f.sans}`
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillStyle = color('ink')
    const glyph = glyphs[Math.floor(hash(i, 17) * glyphs.length)]!
    g.fillText(glyph, 0, PX * 0.03)
    const map = new THREE.CanvasTexture(canvas)
    map.colorSpace = THREE.SRGBColorSpace
    map.anisotropy = 4
    return { map, glyph }
  }

  const sphere = new THREE.Group()
  scene.add(sphere)
  const golden = Math.PI * (3 - Math.sqrt(5))
  const items = Array.from({ length: count }, (_, i) => {
    const y = 1 - (2 * (i + 0.5)) / count
    const r = Math.sqrt(1 - y * y)
    const home = new THREE.Vector3(Math.cos(golden * i) * r * R, y * R, Math.sin(golden * i) * r * R)
    const { map, glyph } = tile(i)
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true }))
    sprite.position.copy(home)
    sphere.add(sprite)
    return { home, sprite, glyph }
  })

  const pose = (ms: number) => {
    const room = ease.inOut3(phase(ms, at(1), 450))
    sphere.rotation.set(0.32, 4.4 * ease.out3(phase(ms, 0, at(1))) + 0.06 * (ms / 1000), 0)
    sphere.position.set(-1.9 * room, -0.3, -0.4 * room)
    sphere.updateMatrixWorld(true)
    return room
  }

  // The sample to take out: the one nearest the camera when `pick` starts.
  pose(at(1))
  let chosen = 0, nearest = -Infinity
  items.forEach((item, i) => {
    const p = item.sprite.getWorldPosition(new THREE.Vector3())
    const score = p.z - 0.6 * Math.abs(p.y)
    if (score > nearest) { nearest = score; chosen = i }
  })
  const picked = items[chosen]!
  // It leaves the sphere: its own sprite in the scene, out of the fog.
  sphere.remove(picked.sprite)
  picked.sprite.material.fog = false
  picked.sprite.renderOrder = 1
  scene.add(picked.sprite)
  const target = new THREE.Vector3(2.5, 0, 2.2)

  const layer = overlay(root, `
    .ss-title { position: absolute; left: 5cqw; top: 6cqh; font-size: ${TYPE.lead}cqw; font-weight: 600; white-space: nowrap; }
    .ss-label { position: absolute; transform: translate(-50%, 0); text-align: center; }
    .ss-id { font: 500 ${TYPE.label}cqw var(--pm-font-mono); color: var(--pm-color-muted); white-space: nowrap; }
    .ss-name { margin-top: 0.8cqh; font-size: ${TYPE.lead}cqw; font-weight: 600; color: var(--pm-color-accent); white-space: nowrap; }
  `, `<div class="ss-title">${title}</div>
    <div class="ss-label"><div class="ss-id">${sampleId}</div><div class="ss-name">${labelText.replace('{glyph}', picked.glyph)}</div></div>`)
  const label = layer.querySelector<HTMLElement>('.ss-label')!

  const live = new THREE.Vector3()
  const below = new THREE.Vector3()
  return {
    render(ms) {
      const room = pose(ms)
      // The wave in: samples nearest the camera first, 0–0.9 s in all.
      items.forEach(item => {
        if (item === picked) return
        const p = item.sprite.getWorldPosition(new THREE.Vector3())
        const delay = ((R - p.z) / (2 * R)) * 500
        const k = ease.outExpo(phase(ms, delay, 400))
        item.sprite.scale.setScalar(SIZE * k)
        item.sprite.material.opacity = 1 - 0.62 * room
      })
      // The chosen sample rides the sphere until it flies out.
      live.copy(picked.home).applyMatrix4(sphere.matrixWorld)
      const grow = ease.outExpo(phase(ms, ((R - live.z) / (2 * R)) * 500, 400))
      const fly = phase(ms, at(1) + 350, 900)
      const move = ease.inOut3(fly)
      picked.sprite.position.lerpVectors(live, target, move)
      picked.sprite.scale.setScalar(SIZE * grow * (1 + (GROW - 1) * ease.backOut(0.5)(fly)))
      // The label rises under the sample once it has landed.
      const show = ease.outExpo(phase(ms, at(2), 400))
      below.set(target.x, target.y - (SIZE * GROW) / 2 - 0.12, target.z).project(camera)
      label.style.left = `${((below.x + 1) / 2) * 100}cqw`
      label.style.top = `${((1 - below.y) / 2) * 100}cqh`
      label.style.opacity = show.toFixed(3)
      label.style.marginTop = `${(1 - show) * 2.4}cqh`
      renderer.render(scene, camera)
    },
    resize(w, h) {
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    },
    dispose() {
      disposeAll(scene)
      for (const item of items) { item.sprite.material.map?.dispose(); item.sprite.material.dispose() }
    },
  }
})
