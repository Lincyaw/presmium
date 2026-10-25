import { threeScene } from '@lincyaw/addon-motion/scene'

// Tower of Hanoi as data: an AnimationClip of VectorKeyframeTracks (disk positions), ColorKeyframeTracks (the moving
// disk lights up) and a QuaternionKeyframeTrack (the stand turns), played by AnimationMixer.setTime; peg letters are
// CanvasTexture sprites. Seek safety: LoopOnce actions stop or pause themselves at the end and then ignore setTime,
// so the action keeps the default LoopRepeat and the time is clamped just below the clip's duration.
const PEGS = [-2.6, 0, 2.6]
const DISK_H = 0.32
const DISKS = 3

function moves(n: number, from: number, to: number, via: number, out: [number, number][] = []): [number, number][] {
  if (n === 0) return out
  moves(n - 1, from, via, to, out)
  out.push([from, to])
  moves(n - 1, via, to, from, out)
  return out
}

export default threeScene(({ THREE, renderer, root, at, total, width, height, color }) => {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100)
  camera.position.set(0, 1.7, 9.5)
  camera.lookAt(0, 0.8, 0) // little pitch, so the pegs stay upright in perspective
  scene.add(new THREE.HemisphereLight(0xffffff, 0x666666, 1.6))
  const sun = new THREE.DirectionalLight(0xffffff, 1.8)
  sun.position.set(3, 6, 5)
  scene.add(sun)

  const rig = new THREE.Group()
  rig.name = 'rig'
  scene.add(rig)
  const woodMaterial = new THREE.MeshStandardMaterial({ color: color('line-strong'), roughness: 0.7 })
  const baseGeometry = new THREE.BoxGeometry(8.2, 0.2, 2.4)
  const pegGeometry = new THREE.CylinderGeometry(0.06, 0.06, 1.6, 16)
  const base = new THREE.Mesh(baseGeometry, woodMaterial)
  base.position.y = -0.1
  rig.add(base)

  // Peg letters as sprites with a canvas texture: the core-only way to put text in the 3D scene.
  const textures: InstanceType<typeof THREE.CanvasTexture>[] = []
  const sprites: InstanceType<typeof THREE.SpriteMaterial>[] = []
  PEGS.forEach((x, i) => {
    const peg = new THREE.Mesh(pegGeometry, woodMaterial)
    peg.position.set(x, 0.8, 0)
    rig.add(peg)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 128
    const pen = canvas.getContext('2d')!
    pen.fillStyle = color('ink')
    pen.font = '600 88px serif'
    pen.textAlign = 'center'
    pen.textBaseline = 'middle'
    pen.fillText('ABC'[i]!, 64, 70)
    const texture = new THREE.CanvasTexture(canvas)
    texture.colorSpace = THREE.SRGBColorSpace
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true })
    const sprite = new THREE.Sprite(material)
    sprite.position.set(x, -0.5, 1.4)
    sprite.scale.setScalar(0.55)
    rig.add(sprite)
    textures.push(texture)
    sprites.push(material)
  })

  const tints = ['accent', 'ok', 'danger'].map(name => new THREE.Color(color(name)))
  const lit = new THREE.Color(color('warn'))
  const diskGeometries = Array.from({ length: DISKS }, (_, i) => new THREE.CylinderGeometry(0.45 + 0.28 * i, 0.45 + 0.28 * i, DISK_H, 48))
  const diskMaterials = tints.map(tint => new THREE.MeshStandardMaterial({ color: tint, roughness: 0.4 }))
  const stacks: number[][] = [[2, 1, 0], [], []]
  diskGeometries.forEach((geometry, i) => {
    const disk = new THREE.Mesh(geometry, diskMaterials[i])
    disk.name = `disk${i}`
    rig.add(disk)
  })

  // The schedule: step 1 makes moves 1-3, step 2 move 4, step 3 moves 5-7, each move inside its step.
  const plan = moves(DISKS, 0, 2, 1)
  const windows: [number, number][] = []
  const spread = (step: number, first: number, count: number) => {
    const span = (at(step + 1) - at(step)) / count
    for (let i = 0; i < count; i++) windows[first + i] = [(at(step) + span * i + span * 0.05) / 1000, (at(step) + span * (i + 0.95)) / 1000]
  }
  spread(1, 0, 3)
  spread(2, 3, 1)
  spread(3, 4, 3)
  const where = (peg: number, level: number) => [PEGS[peg]!, DISK_H / 2 + level * DISK_H, 0]
  const keys = Array.from({ length: DISKS }, (_, i) => ({ times: [0], values: where(0, 2 - i), colorTimes: [0], colors: tints[i]!.toArray() }))
  plan.forEach(([from, to], m) => {
    const disk = stacks[from]!.pop()!
    const [start, end] = windows[m]!
    const level0 = stacks[from]!.length
    const level1 = stacks[to]!.length
    stacks[to]!.push(disk)
    const k = keys[disk]!
    const lift = 2.1
    const d = end - start
    k.times.push(start, start + d * 0.3, start + d * 0.7, end)
    k.values.push(...where(from, level0), PEGS[from]!, lift, 0, PEGS[to]!, lift, 0, ...where(to, level1))
    k.colorTimes.push(start, start + 0.08, end - 0.08, end)
    k.colors.push(...tints[disk]!.toArray(), ...lit.toArray(), ...lit.toArray(), ...tints[disk]!.toArray())
  })
  const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -0.7)
  const front = new THREE.Quaternion()
  const tracks = [
    ...keys.flatMap((k, i) => [
      new THREE.VectorKeyframeTrack(`disk${i}.position`, k.times, k.values),
      new THREE.ColorKeyframeTrack(`disk${i}.material.color`, k.colorTimes, k.colors),
    ]),
    new THREE.QuaternionKeyframeTrack('rig.quaternion', [0, at(1) / 1000], [...turn.toArray(), ...front.toArray()]),
  ]
  const clip = new THREE.AnimationClip('hanoi', total / 1000, tracks)
  const mixer = new THREE.AnimationMixer(rig)
  mixer.clipAction(clip).play() // LoopRepeat: see the note at the top

  const counter = document.createElement('div')
  counter.style.cssText = 'position: absolute; left: 1em; top: 0.8em; font: 1rem var(--pm-font-mono); color: var(--pm-color-ink); pointer-events: none'
  root.append(counter)

  return {
    render(ms) {
      mixer.setTime(Math.min(ms / 1000, clip.duration - 1e-4))
      const done = windows.filter(([, end]) => ms / 1000 >= end).length
      counter.textContent = `移动 ${done} / ${plan.length}`
      renderer.render(scene, camera)
    },
    resize(w, h) {
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    },
    dispose() {
      mixer.stopAllAction()
      for (const item of [woodMaterial, baseGeometry, pegGeometry, ...textures, ...sprites, ...diskGeometries, ...diskMaterials]) item.dispose()
      counter.remove()
    },
  }
})
