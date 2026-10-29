import { threeScene } from '@lincyaw/addon-motion/scene'
import claude from '../../lengths/scenes/logos/claude-color.svg?raw'
import data from './data/flow-matching.json'

// Flow matching, told the way the 小红书 explainer "将生图路径，拉直！" tells it, with every number from a real
// training run (`data/flow-matching.py`: a 200k-parameter MLP that pushes Gaussian noise onto the Claude logo,
// then Reflow). One picture all the way through, in three dimensions: time is the third axis, the noise plane
// (t = 0) and the target plane (t = 1) face each other along it, and each particle's path is a curve through the
// space-time between them, with the time axis under them. The camera moves between the states. Colours keep one
// meaning: red is the truth (the exact path, the training target), the accent is the network's arrow, warn is what
// the sampler actually walks, ok is the straightened model.
//
// `intro`: the planes; 2000 particles flow from the noise into the logo, drawing their paths. `velocity`: one path;
// its tangent slides along it; the field of arrows on five time slices fills the volume. `euler`: the camera above
// the path, space magnified four times (its bends are 0.25 across a time axis 3.4 long); Euler with 4, 8, 16 and 32
// steps, each laid over the last, the time cut into slices for the first two, the end error read from the data.
// `straight`: the chord from start to end, walked in one step. `train`: random pairs joined by straight lines; one
// pair, a random t with its slice, the point on its line; the target arrow (red) and the network's arrow (accent) as
// it was at rounds 1 … 30,000, with the loss curve and the round counter. `result`: the noise coloured by position
// flows into the logo while the camera comes round to face it through the noise plane; the colours stay in patches.
// `cross`: the lines through one point at t = 0.5, their directions and the network's arrow, which is their
// average; then the curved paths the model really takes. `reflow`: those paths straighten into the chords of their
// own start and end, and the retrained model's paths lie on them. `onestep`: two views side by side, one Euler step
// each: the first model's particles bunch in the middle, the straightened model draws the logo.
// Text is drawn on a canvas over the WebGL one, in a 1280 × 720 stage scaled to fit; labels follow their 3D anchor.

interface Data {
  setup: { particles: number, frames: number, rounds1: number, parameters: number }
  m1: string, m2: string, m2frames: number
  euler: { exact: [number, number][], steps: Record<string, { path: [number, number][], error: number }> }
  field: { grid: [number, number][], v: Record<string, [number, number][]> }
  train: { x0: [number, number][], x1: [number, number][], highlight: number, t: number, checkpoints: [number, number, number][], loss: [number, number][] }
  cross: { t: number, point: [number, number], lines: [number, number, number, number][], model: [number, number], count: number }
  straightness: { m1: number, m2: number }
  onestep: Record<string, { points: string, error: number }>
}
type V = [number, number]

const D = data as unknown as Data
const unpack = (b64: string) => {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
  const ints = new Int16Array(bytes.buffer)
  return Float32Array.from(ints, v => v / 10000)
}
const clamp = (v: number) => Math.max(0, Math.min(1, v))
const ease = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2)
const out = (p: number) => 1 - (1 - p) ** 3

const strandVertex = /* glsl */ `
  attribute vec3 aChord;
  attribute vec3 aColor;
  attribute float aT;
  uniform float uStraight;
  uniform float uColored;
  uniform vec3 uNeutral;
  varying float vT;
  varying vec3 vColor;
  void main() {
    vT = aT;
    vColor = mix(uNeutral, aColor, uColored);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(mix(position, aChord, uStraight), 1.0);
  }
`
const strandFragment = /* glsl */ `
  uniform float uHead;
  uniform float uAlpha;
  varying float vT;
  varying vec3 vColor;
  void main() {
    if (vT > uHead) discard;
    gl_FragColor = vec4(vColor, uAlpha);
    #include <colorspace_fragment>
  }
`

export default threeScene(({ THREE, renderer, addons, root, at, width, height, color }) => {
  type Vec = InstanceType<typeof THREE.Vector3>
  type Parent = InstanceType<typeof THREE.Object3D>
  const N = D.setup.particles, F = D.setup.frames
  const m1 = unpack(D.m1), m2 = unpack(D.m2), F2 = D.m2frames
  const one1 = unpack(D.onestep['m1-1']!.points), one2 = unpack(D.onestep['m2-1']!.points)
  const logo = new Path2D(claude.match(/\sd="([^"]+)"/)![1]!)
  const css = getComputedStyle(root)
  const sans = css.getPropertyValue('--pm-font-sans').trim() || 'sans-serif'
  const mono = css.getPropertyValue('--pm-font-mono').trim() || 'monospace'
  const C = Object.fromEntries(['ink', 'muted', 'line', 'line-strong', 'sunk', 'accent', 'warn', 'ok', 'danger'].map(n => [n, color(n)])) as Record<string, string>
  const rgba = (c: string, a: number) => c.replace(/rgba?\(([^,]+),([^,]+),([^,)]+)(,[^)]*)?\)/, `rgba($1,$2,$3,${a})`)
  const nums = (c: string) => (c.match(/[\d.]+/g) ?? ['0', '0', '0']).slice(0, 3).map(Number)
  const col = (token: string) => new THREE.Color(C[token] ?? color(token))

  const S = { intro: 0, velocity: 1, euler: 2, straight: 3, train: 4, result: 5, cross: 6, reflow: 7, onestep: 8 }
  const ph = (ms: number, k: number, a = 0, b = 1) => clamp(((ms - at(k)) / (at(k + 1) - at(k)) - a) / (b - a))
  const stateAt = (ms: number) => { let k = 0; while (k < S.onestep && ms >= at(k + 1)) k++; return k }

  // Space-time: a sample (x, y) at time t sits at world (time, −y, x); t = 0 is at x = −1.7, t = 1 at x = +1.7.
  const TL = 1.7
  const tx = (t: number) => (t - 0.5) * 2 * TL
  const W = (x: number, y: number, t: number) => new THREE.Vector3(tx(t), -y, x)
  const at01 = (traj: Float32Array, frames: number, i: number, t: number): V => {
    const f = Math.min(frames - 1.0001, Math.max(0, t * (frames - 1))), k = Math.floor(f), u = f - k, o = i * frames * 2 + k * 2
    return [traj[o]! + (traj[o + 2]! - traj[o]!) * u, traj[o + 1]! + (traj[o + 3]! - traj[o + 1]!) * u]
  }

  // Each particle's colour from the angle of its starting point: four token colours around the circle.
  const ring = [C.accent!, C.ok!, C.warn!, C.danger!]
  const BUCKETS = 24
  const palette = Array.from({ length: BUCKETS }, (_, b) => {
    const a = (b / BUCKETS) * 4, i = Math.floor(a), p = nums(ring[i % 4]!), q = nums(ring[(i + 1) % 4]!)
    return new THREE.Color(`rgb(${p.map((v, j) => Math.round(v + (q[j]! - v) * (a - i))).join(',')})`)
  })
  const bucket = Uint8Array.from({ length: N }, (_, i) => {
    const x = m1[i * F * 2]!, y = m1[i * F * 2 + 1]!
    return Math.floor(((Math.atan2(y, x) / (2 * Math.PI) + 1) % 1) * BUCKETS) % BUCKETS
  })

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(38, width / height, 0.05, 60)
  const owned: { dispose(): void }[] = []
  const keep = <T extends { dispose(): void }>(item: T): T => { owned.push(item); return item }
  let lineScale = 1, pointSize = 3

  // Building blocks: fat lines (Line2), thin lines, dots, arrows, dashed slices, planes.
  const fat = (parent: Parent, pts: number[], token: string, width: number, dashed = false) => {
    const geometry = keep(new addons.LineGeometry())
    geometry.setPositions(pts)
    const material = keep(new addons.LineMaterial({ color: col(token), linewidth: width, transparent: true, depthWrite: false, dashed, dashSize: 0.08, gapSize: 0.07 }))
    const line = new addons.Line2(geometry, material)
    if (dashed) line.computeLineDistances()
    parent.add(line)
    return { line, geometry, material, width, segments: pts.length / 3 - 1 }
  }
  type Fat = ReturnType<typeof fat>
  const showFat = (f: Fat, alpha: number, upTo = 1) => {
    f.line.visible = alpha > 0.002 && upTo > 0
    f.material.opacity = Math.min(1, alpha)
    f.material.linewidth = f.width * lineScale
    f.geometry.instanceCount = Math.max(1, Math.ceil(f.segments * Math.min(1, upTo) - 1e-6))
  }
  const thin = (parent: Parent, pts: number[], token: string, dashed = false) => {
    const geometry = keep(new THREE.BufferGeometry())
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))
    const material = keep(dashed ? new THREE.LineDashedMaterial({ color: col(token), dashSize: 0.06, gapSize: 0.05, transparent: true, depthWrite: false }) : new THREE.LineBasicMaterial({ color: col(token), transparent: true, depthWrite: false }))
    const line = new THREE.LineSegments(geometry, material)
    if (dashed) line.computeLineDistances()
    parent.add(line)
    return { line, material, geometry }
  }
  const showThin = (l: ReturnType<typeof thin>, alpha: number) => { l.line.visible = alpha > 0.002; l.material.opacity = Math.min(1, alpha) }
  const rect = (x: number, cy: number, cz: number, hy: number, hz: number) => {
    const c = [[cy + hy, cz + hz], [cy + hy, cz - hz], [cy - hy, cz - hz], [cy - hy, cz + hz]]
    return c.flatMap((p, i) => [x, p[0]!, p[1]!, x, c[(i + 1) % 4]![0]!, c[(i + 1) % 4]![1]!])
  }
  // Rect outlines are built as segment pairs; Line2 wants a polyline, so join them.
  const loop = (pts: number[]) => [...pts.filter((_, i) => i % 6 < 3), pts[0]!, pts[1]!, pts[2]!]
  const sphere = keep(new THREE.SphereGeometry(1, 16, 12))
  const dot = (parent: Parent, token: string, r: number) => {
    const material = keep(new THREE.MeshBasicMaterial({ color: col(token), transparent: true }))
    const mesh = new THREE.Mesh(sphere, material)
    mesh.scale.setScalar(r)
    parent.add(mesh)
    return { mesh, material, r }
  }
  const showDot = (d: ReturnType<typeof dot>, p: Vec, alpha: number, grow = 1) => {
    d.mesh.visible = alpha > 0.002 && grow > 0
    d.mesh.position.copy(p); d.mesh.scale.setScalar(d.r * Math.max(1e-3, grow)); d.material.opacity = Math.min(1, alpha)
  }
  const shaftGeometry = keep(new THREE.CylinderGeometry(1, 1, 1, 10)), headGeometry = keep(new THREE.ConeGeometry(1, 1, 14))
  const UP = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3(), turn = new THREE.Quaternion()
  // An arrow from a to b as shaft and head transforms (for meshes and for instances alike).
  const place = (a: Vec, b: Vec, r: number, shaft: InstanceType<typeof THREE.Object3D>, head: InstanceType<typeof THREE.Object3D>) => {
    tmp.subVectors(b, a)
    const len = tmp.length()
    if (len < 1e-5) return false
    tmp.divideScalar(len)
    turn.setFromUnitVectors(UP, tmp)
    const hl = Math.min(len * 0.45, r * 8), sl = len - hl
    shaft.position.copy(a).addScaledVector(tmp, sl / 2); shaft.quaternion.copy(turn); shaft.scale.set(r, Math.max(1e-4, sl), r)
    head.position.copy(a).addScaledVector(tmp, sl + hl / 2); head.quaternion.copy(turn); head.scale.set(r * 2.7, hl, r * 2.7)
    return true
  }
  const arrow = (parent: Parent, token: string, r: number, material = keep(new THREE.MeshBasicMaterial({ color: col(token), transparent: true, depthWrite: false }))) => {
    const shaft = new THREE.Mesh(shaftGeometry, material), head = new THREE.Mesh(headGeometry, material), group = new THREE.Group()
    group.add(shaft, head)
    parent.add(group)
    return { group, shaft, head, material, r }
  }
  const showArrow = (a: ReturnType<typeof arrow>, from: Vec, to: Vec, alpha: number) => {
    a.group.visible = alpha > 0.002 && place(from, to, a.r, a.shaft, a.head)
    a.material.opacity = Math.min(1, alpha)
  }

  const planeGeometry = keep(new THREE.PlaneGeometry(2.36, 2.36)), logoGeometry = keep(new THREE.PlaneGeometry(2, 2))
  const logoTexture = (() => {
    const c = document.createElement('canvas')
    c.width = c.height = 1024
    const g = c.getContext('2d')!
    g.setTransform(1024 / 24, 0, 0, 1024 / 24, 0, 0)
    g.fillStyle = rgba(C.danger!, 0.16); g.fill(logo)
    g.strokeStyle = rgba(C.muted!, 0.9); g.lineWidth = 0.07; g.setLineDash([0.35, 0.3]); g.stroke(logo)
    const texture = new THREE.CanvasTexture(c)
    texture.colorSpace = THREE.SRGBColorSpace
    texture.anisotropy = 4
    return keep(texture)
  })()
  const disc = (() => {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')!
    const fill = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    fill.addColorStop(0, 'rgba(255,255,255,1)'); fill.addColorStop(0.6, 'rgba(255,255,255,1)'); fill.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = fill; g.fillRect(0, 0, 64, 64)
    return keep(new THREE.CanvasTexture(c))
  })()
  // The two planes, the logo on the target, their outlines: built once for the main view and once per panel.
  const planes = (parent: Parent) => {
    const fill = (t: number) => {
      const material = keep(new THREE.MeshBasicMaterial({ color: col('sunk'), transparent: true, depthWrite: false, side: THREE.DoubleSide }))
      const mesh = new THREE.Mesh(planeGeometry, material)
      mesh.rotation.y = -Math.PI / 2
      mesh.position.x = tx(t)
      parent.add(mesh)
      return material
    }
    const noise = fill(0), target = fill(1)
    const logoMaterial = keep(new THREE.MeshBasicMaterial({ map: logoTexture, transparent: true, depthWrite: false, side: THREE.DoubleSide }))
    const logoMesh = new THREE.Mesh(logoGeometry, logoMaterial)
    logoMesh.rotation.y = -Math.PI / 2
    logoMesh.position.x = tx(1) - 0.004
    parent.add(logoMesh)
    const edges = [fat(parent, loop(rect(tx(0), 0, 0, 1.18, 1.18)), 'line-strong', 1.4), fat(parent, loop(rect(tx(1), 0, 0, 1.18, 1.18)), 'line-strong', 1.4)]
    return (alpha: number, noiseFill = 1) => {
      noise.opacity = 0.5 * alpha * noiseFill; target.opacity = 0.5 * alpha; logoMaterial.opacity = alpha
      for (const e of edges) showFat(e, alpha)
    }
  }
  const showPlanes = planes(scene)

  // The particles: 2000 points, positions and colours assigned from the time.
  const points = (parent: Parent) => {
    const geometry = keep(new THREE.BufferGeometry())
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 3), 3))
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4)
    const material = keep(new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, map: disc, vertexColors: true, transparent: true, depthWrite: false, alphaTest: 0.05 }))
    const cloud = new THREE.Points(geometry, material)
    parent.add(cloud)
    return { cloud, geometry, material }
  }
  const crowd = points(scene)
  const neutral = col('ink')
  const setPoints = (p: ReturnType<typeof points>, alpha: number, colored: number, pos: (i: number, out: Float32Array, o: number) => void) => {
    p.cloud.visible = alpha > 0.002
    if (!p.cloud.visible) return
    const position = p.geometry.getAttribute('position') as InstanceType<typeof THREE.BufferAttribute>, colors = p.geometry.getAttribute('color') as InstanceType<typeof THREE.BufferAttribute>
    const P = position.array as Float32Array, K = colors.array as Float32Array
    for (let i = 0; i < N; i++) {
      pos(i, P, i * 3)
      const c = palette[bucket[i]!]!
      K[i * 3] = neutral.r + (c.r - neutral.r) * colored; K[i * 3 + 1] = neutral.g + (c.g - neutral.g) * colored; K[i * 3 + 2] = neutral.b + (c.b - neutral.b) * colored
    }
    position.needsUpdate = true; colors.needsUpdate = true
    p.material.opacity = Math.min(1, alpha); p.material.size = pointSize
  }
  const onFlow = (traj: Float32Array, frames: number, t: number) => (i: number, P: Float32Array, o: number) => {
    const [x, y] = at01(traj, frames, i, t)
    P[o] = tx(t); P[o + 1] = -y; P[o + 2] = x
  }

  // Strands: each path as line segments revealed up to a head time on the GPU, bendable into its chord.
  const strands = (indices: number[], traj: Float32Array, frames: number, token: string) => {
    const count = indices.length * (frames - 1) * 2
    const position = new Float32Array(count * 3), chord = new Float32Array(count * 3), tint = new Float32Array(count * 3), time = new Float32Array(count)
    let v = 0
    for (const i of indices) {
      const a = at01(traj, frames, i, 0), b = at01(traj, frames, i, 1), c = palette[bucket[i]!]!
      for (let k = 0; k < frames - 1; k++) for (const kk of [k, k + 1]) {
        const t = kk / (frames - 1), o = i * frames * 2 + kk * 2
        position.set([tx(t), -traj[o + 1]!, traj[o]!], v * 3)
        chord.set([tx(t), -(a[1] + (b[1] - a[1]) * t), a[0] + (b[0] - a[0]) * t], v * 3)
        tint.set([c.r, c.g, c.b], v * 3)
        time[v++] = t
      }
    }
    const geometry = keep(new THREE.BufferGeometry())
    geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
    geometry.setAttribute('aChord', new THREE.BufferAttribute(chord, 3))
    geometry.setAttribute('aColor', new THREE.BufferAttribute(tint, 3))
    geometry.setAttribute('aT', new THREE.BufferAttribute(time, 1))
    const material = keep(new THREE.ShaderMaterial({
      vertexShader: strandVertex, fragmentShader: strandFragment, transparent: true, depthWrite: false,
      uniforms: { uHead: { value: 0 }, uAlpha: { value: 0 }, uStraight: { value: 0 }, uColored: { value: 0 }, uNeutral: { value: col(token) } },
    }))
    const lines = new THREE.LineSegments(geometry, material)
    lines.frustumCulled = false
    scene.add(lines)
    return (head: number, alpha: number, colored = 0, straight = 0) => {
      lines.visible = alpha > 0.002 && head > 0
      const u = material.uniforms
      u.uHead!.value = head; u.uAlpha!.value = Math.min(1, alpha); u.uColored!.value = colored; u.uStraight!.value = straight
    }
  }
  const every = (n: number, offset = 0) => Array.from({ length: n }, (_, k) => Math.floor((k * N) / n) + offset)
  const SHOWN = every(60, 3)
  const showCrowd = strands(every(360), m1, F, 'muted')
  const showCurved = strands(SHOWN, m1, F, 'accent')
  const showSecond = strands(SHOWN, m2, F2, 'ok')

  // The time axis under the planes, its ticks and a marker.
  const AY = -1.42
  const axis = fat(scene, [tx(0), AY, 0, tx(1), AY, 0], 'muted', 1.6)
  const tickGeometry = keep(new THREE.BufferGeometry())
  tickGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(34 * 2 * 3), 3))
  const tickMaterial = keep(new THREE.LineBasicMaterial({ color: col('muted'), transparent: true }))
  const ticks = new THREE.LineSegments(tickGeometry, tickMaterial)
  ticks.frustumCulled = false
  scene.add(ticks)
  const setTicks = (n: number, alpha: number) => {
    const P = (tickGeometry.getAttribute('position') as InstanceType<typeof THREE.BufferAttribute>)
    const A = P.array as Float32Array
    const marks = n > 0 ? n : 1
    for (let i = 0; i <= marks; i++) A.set([tx(i / marks), AY - 0.05, 0, tx(i / marks), AY + 0.05, 0], i * 6)
    P.needsUpdate = true
    tickGeometry.setDrawRange(0, (marks + 1) * 2)
    ticks.visible = alpha > 0.002; tickMaterial.opacity = alpha
  }
  const marker = dot(scene, 'danger', 0.04), stepMarker = dot(scene, 'warn', 0.035)

  // The highlighted path and everything drawn on it live in a group that magnifies space (y, z) about the path
  // for `euler` and `straight`; dots and arrows stay outside it so they keep their shape, placed through it.
  const ex = D.euler.exact
  const pathPts = [...ex.map((p, k) => W(p[0], p[1], k / 64)), ...Object.values(D.euler.steps).flatMap(e => e.path.map((p, k) => W(p[0], p[1], k / (e.path.length - 1))))]
  const pivot = new THREE.Box3().setFromPoints(pathPts).getCenter(new THREE.Vector3())
  pivot.x = 0
  const pathGroup = new THREE.Group()
  pathGroup.position.copy(pivot)
  scene.add(pathGroup)
  const local = (x: number, y: number, t: number) => W(x, y, t).sub(pivot)
  const flat = (vs: Vec[]) => vs.flatMap(v => [v.x, v.y, v.z])
  const through = (v: Vec) => pathGroup.localToWorld(v.clone())
  const exact = fat(pathGroup, flat(ex.map((p, k) => local(p[0], p[1], k / 64))), 'danger', 3.6)
  const COUNTS = [4, 8, 16, 32]
  const eulers = COUNTS.map(n => {
    const path = D.euler.steps[String(n)]!.path
    const at = path.map((p, k) => local(p[0], p[1], k / n))
    return { n, path, at, line: fat(pathGroup, flat(at), 'warn', n < 16 ? 2.8 : 2), dots: n <= 8 ? at.map(() => dot(scene, 'warn', 0.022)) : [] }
  })
  const bounds = new THREE.Box3().setFromPoints(pathPts.map(v => v.clone().sub(pivot)))
  const sliceY = (bounds.max.y - bounds.min.y) / 2 + 0.04, sliceZ = (bounds.max.z - bounds.min.z) / 2 + 0.06
  const slices = [4, 8].map(n => thin(pathGroup, Array.from({ length: n - 1 }, (_, j) => rect(tx((j + 1) / n), (bounds.max.y + bounds.min.y) / 2, (bounds.max.z + bounds.min.z) / 2, sliceY, sliceZ)).flat(), 'muted', true))
  const start = W(ex[0]![0], ex[0]![1], 0), end = W(ex[64]![0], ex[64]![1], 1)
  const startDot = dot(scene, 'ink', 0.04), endDot = dot(scene, 'danger', 0.04), pathDot = dot(scene, 'accent', 0.035)
  const chord = fat(pathGroup, flat(Array.from({ length: 33 }, (_, k) => start.clone().lerp(end, k / 32).sub(pivot))), 'ok', 3, true)
  const tangent = arrow(scene, 'accent', 0.016), oneStep = arrow(scene, 'ok', 0.018)

  // The field on five time slices, as instanced arrows.
  const FIELD_T = ['0.0', '0.25', '0.5', '0.75', '1.0']
  const fieldAt = D.field.grid.map((q, i) => ({ q, i })).filter(({ i }) => !((i % 13) % 2 || Math.floor(i / 13) % 2))
  const holder = { shaft: new THREE.Object3D(), head: new THREE.Object3D() }
  const fields = FIELD_T.map((key) => {
    const t = Number(key), material = keep(new THREE.MeshBasicMaterial({ color: col('accent'), transparent: true, depthWrite: false }))
    const shafts = new THREE.InstancedMesh(shaftGeometry, material, fieldAt.length), heads = new THREE.InstancedMesh(headGeometry, material, fieldAt.length)
    fieldAt.forEach(({ q, i }, j) => {
      const v = D.field.v[key]![i]!, dt = 0.045
      place(W(q[0], q[1], t), W(q[0] + v[0] * dt, q[1] + v[1] * dt, t + dt), 0.0065, holder.shaft, holder.head)
      holder.shaft.updateMatrix(); holder.head.updateMatrix()
      shafts.setMatrixAt(j, holder.shaft.matrix); heads.setMatrixAt(j, holder.head.matrix)
    })
    scene.add(shafts, heads)
    const outline = t > 0 && t < 1 ? thin(scene, rect(tx(t), 0, 0, 1.18, 1.18), 'line-strong', true) : undefined
    return (alpha: number) => {
      shafts.visible = heads.visible = alpha > 0.002; material.opacity = 0.6 * alpha
      if (outline) showThin(outline, alpha * 0.8)
    }
  })

  // Training: random pairs, one pair, its slice at t, the point and the two arrows.
  const tr = D.train, hi = tr.highlight
  const pairs = thin(scene, tr.x0.flatMap((p, i) => [...W(p[0], p[1], 0).toArray(), ...W(tr.x1[i]![0], tr.x1[i]![1], 1).toArray()]), 'muted')
  const pairA = W(tr.x0[hi]![0], tr.x0[hi]![1], 0), pairB = W(tr.x1[hi]![0], tr.x1[hi]![1], 1)
  const pair = fat(scene, flat([pairA, pairB]), 'danger', 2.6)
  const pairDots = [dot(scene, 'danger', 0.035), dot(scene, 'danger', 0.035)]
  const target: V = [tr.x1[hi]![0] - tr.x0[hi]![0], tr.x1[hi]![1] - tr.x0[hi]![1]]
  const xt: V = [tr.x0[hi]![0] * (1 - tr.t) + tr.x1[hi]![0] * tr.t, tr.x0[hi]![1] * (1 - tr.t) + tr.x1[hi]![1] * tr.t]
  const xtW = W(xt[0], xt[1], tr.t)
  const sliceMaterial = keep(new THREE.MeshBasicMaterial({ color: col('danger'), transparent: true, depthWrite: false, side: THREE.DoubleSide }))
  const trainSlice = new THREE.Mesh(planeGeometry, sliceMaterial)
  trainSlice.rotation.y = -Math.PI / 2; trainSlice.position.x = tx(tr.t)
  scene.add(trainSlice)
  const trainOutline = thin(scene, rect(tx(tr.t), 0, 0, 1.18, 1.18), 'danger', true)
  const xtDot = dot(scene, 'ink', 0.04), truth = arrow(scene, 'danger', 0.016), guess = arrow(scene, 'accent', 0.016)
  const lossMax = Math.max(...tr.loss.map(l => l[1])), lossMin = Math.min(...tr.loss.map(l => l[1]))

  // The crossing: lines through one point, their directions, the network's average.
  const cr = D.cross
  const crW = W(cr.point[0], cr.point[1], cr.t)
  const crossLines = thin(scene, cr.lines.flatMap(([a, b, c, d]) => [...W(a, b, 0).toArray(), ...W(c, d, 1).toArray()]), 'danger')
  const crossOutline = thin(scene, rect(tx(cr.t), 0, 0, 1.18, 1.18), 'line-strong', true)
  const fanMaterial = keep(new THREE.MeshBasicMaterial({ color: col('danger'), transparent: true, depthWrite: false }))
  const fan = cr.lines.map(() => arrow(scene, 'danger', 0.008, fanMaterial))
  const crDot = dot(scene, 'ink', 0.04), average = arrow(scene, 'accent', 0.02)

  // One step each, in two panels side by side with their own scene and camera.
  const panel = (traj: Float32Array) => {
    const s = new THREE.Scene(), show = planes(s), p = points(s)
    const jumps = every(400)
    const geometry = keep(new THREE.BufferGeometry())
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(jumps.length * 6), 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(Float32Array.from(jumps.flatMap(i => { const c = palette[bucket[i]!]!; return [c.r, c.g, c.b, c.r, c.g, c.b] })), 3))
    const material = keep(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }))
    const lines = new THREE.LineSegments(geometry, material)
    lines.frustumCulled = false
    s.add(lines)
    return {
      scene: s,
      set(alpha: number, jump: number) {
        show(alpha)
        const step = out(jump)
        setPoints(p, alpha * (0.35 + 0.65 * Math.min(1, jump * 4)), 1, (i, P, o) => {
          const x0 = m1[i * F * 2]!, y0 = m1[i * F * 2 + 1]!
          const x = x0 + (traj[i * 2]! - x0) * step, y = y0 + (traj[i * 2 + 1]! - y0) * step
          P[o] = tx(step); P[o + 1] = -y; P[o + 2] = x
        })
        const A = (geometry.getAttribute('position') as InstanceType<typeof THREE.BufferAttribute>)
        const L = A.array as Float32Array
        jumps.forEach((i, j) => {
          const x0 = m1[i * F * 2]!, y0 = m1[i * F * 2 + 1]!
          L.set([tx(0), -y0, x0, tx(step), -(y0 + (traj[i * 2 + 1]! - y0) * step), x0 + (traj[i * 2]! - x0) * step], j * 6)
        })
        A.needsUpdate = true
        lines.visible = alpha > 0.002 && jump > 0; material.opacity = 0.2 * alpha * (1 - 0.6 * clamp((jump - 0.7) / 0.3))
      },
    }
  }
  const panels = [panel(one1), panel(one2)]
  const panelCamera = new THREE.PerspectiveCamera(36, width / 2 / height, 0.05, 60)

  // The camera: one pose per state, a slow yaw within it, eased from the last pose at its start.
  type Pose = { pos: Vec, look: Vec }
  const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)
  const around = (look: Vec, dir: Vec, dist: number): Pose => ({ look: look.clone(), pos: look.clone().add(dir.normalize().multiplyScalar(dist)) })
  const centre = v3(0, -0.1, 0)
  const PRE = around(centre, v3(-0.35, 0.25, 1), 7)
  const POSES: Pose[] = [
    around(centre, v3(-0.62, 0.3, 0.73), 6.1),
    around(centre.clone().lerp(pivot, 0.5), v3(-0.5, 0.42, 0.76), 5.2),
    around(pivot, v3(-0.22, 1, 0.62), 4.1),
    around(pivot, v3(-0.22, 1, 0.62), 4.1),
    around(centre.clone().lerp(xtW, 0.35), v3(-0.6, 0.38, 0.7), 5.6),
    { pos: v3(-5, 0.5, 1.05), look: v3(1.55, -0.05, 0.02) },
    around(crW.clone().lerp(centre, 0.15), v3(-0.55, 0.42, 0.72), 3.9),
    around(centre, v3(-0.62, 0.34, 0.71), 6),
    around(centre, v3(-0.62, 0.34, 0.71), 6),
  ]
  const DRIFT = [0.22, 0.1, 0.06, 0.05, 0.1, 0, 0.1, 0.14, 0]
  const TRANS = [0.55, 0.2, 0.15, 0.12, 0.2, 0.72, 0.2, 0.2, 0.1]
  const drifted = (k: number, p: number): Pose => {
    const base = POSES[k]!, offset = base.pos.clone().sub(base.look).applyAxisAngle(UP, DRIFT[k]! * p)
    return { look: base.look.clone(), pos: base.look.clone().add(offset) }
  }
  const poseAt = (ms: number): Pose => {
    const k = stateAt(ms), p = ph(ms, k), cur = drifted(k, p)
    if (p >= TRANS[k]!) return cur
    const prev = k === 0 ? { pos: PRE.pos.clone(), look: PRE.look.clone() } : drifted(k - 1, 1), u = ease(p / TRANS[k]!)
    return { pos: prev.pos.lerp(cur.pos, u), look: prev.look.lerp(cur.look, u) }
  }

  // Text over the WebGL canvas, in a 1280 × 720 stage.
  const hud = document.createElement('canvas')
  hud.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none'
  root.append(hud)
  const g = hud.getContext('2d')!
  let Wc = width, Hc = height
  const stage = () => { const s = Math.min(Wc / 1280, Hc / 720); return { s, ox: (Wc - 1280 * s) / 2, oy: (Hc - 720 * s) / 2 } }
  const text = (s: string, x: number, y: number, o: { size?: number, fill?: string, font?: string, align?: CanvasTextAlign, weight?: number, alpha?: number } = {}) => {
    if ((o.alpha ?? 1) <= 0) return
    g.globalAlpha = Math.min(1, o.alpha ?? 1)
    g.font = `${o.weight ?? 500} ${o.size ?? 24}px ${o.font ?? sans}`; g.fillStyle = o.fill ?? C.ink!; g.textAlign = o.align ?? 'center'; g.textBaseline = 'middle'; g.fillText(s, x, y)
    g.globalAlpha = 1
  }
  const readout = (s: string, alpha: number, fill = C.ink!, y = 56) => text(s, 640, y, { size: 30, font: mono, fill, alpha })
  // Where a 3D point lands on the stage, through a camera and a viewport given in CSS pixels.
  const onStage = (v: Vec, cam: InstanceType<typeof THREE.PerspectiveCamera>, vp = [0, 0, Wc, Hc]): V | undefined => {
    const p = v.clone().project(cam)
    if (p.z > 1) return undefined
    const { s, ox, oy } = stage()
    return [(vp[0]! + ((p.x + 1) / 2) * vp[2]! - ox) / s, (vp[1]! + ((1 - p.y) / 2) * vp[3]! - oy) / s]
  }
  const label = (s: string, v: Vec, o: Parameters<typeof text>[3] & { dy?: number } = {}, cam = camera, vp?: number[]) => {
    const p = onStage(v, cam, vp)
    if (p) text(s, p[0], p[1] + (o.dy ?? 0), { size: 20, fill: C.muted, ...o })
  }
  const pct = (e: number) => `${(e * 100).toFixed(e < 0.1 ? 1 : 0)}%`

  const resize = (w: number, h: number) => {
    Wc = w; Hc = h
    camera.aspect = w / h; camera.updateProjectionMatrix()
    panelCamera.aspect = w / 2 / h; panelCamera.updateProjectionMatrix()
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    hud.width = Math.max(1, Math.round(w * dpr)); hud.height = Math.max(1, Math.round(h * dpr))
  }
  resize(width, height)

  const render = (ms: number) => {
    const { s: s0, ox, oy } = stage()
    lineScale = Math.max(0.55, s0); pointSize = Math.max(1.6, 3.2 * s0) * renderer.getPixelRatio()
    const k = stateAt(ms)
    const level = (values: number[]) => (k === 0 ? values[0]! : values[k - 1]! + (values[k]! - values[k - 1]!) * ph(ms, k, 0, 0.15))
    const view = ph(ms, S.intro, 0, 0.12) * (1 - ph(ms, S.onestep, 0, 0.1))
    const split = ms >= at(S.onestep) && ph(ms, S.onestep) >= 0.1
    const close = ease(ph(ms, S.euler, 0, 0.15)) * (1 - ease(ph(ms, S.train, 0, 0.15)))
    const pose = poseAt(ms)
    camera.position.copy(pose.pos); camera.lookAt(pose.look)
    pathGroup.scale.set(1, 1 + 3.2 * close, 1 + 3.2 * close)
    pathGroup.updateMatrixWorld(true)

    // Planes; the noise plane thins while the camera looks through it at the logo.
    const facing = ph(ms, S.result, 0.2, 0.7) * (1 - ph(ms, S.cross, 0, 0.2))
    showPlanes(view * (1 - 0.8 * close), 1 - 0.75 * facing)

    // The crowd: neutral in the intro, coloured by its start from `result` on, dimmed while one thing is the subject.
    const tIntro = ease(ph(ms, S.intro, 0.16, 0.8)), tResult = ease(ph(ms, S.result, 0.18, 0.8))
    const pr = ph(ms, S.result)
    if (ms < at(S.result)) {
      setPoints(crowd, view * ph(ms, S.intro, 0.06, 0.16) * level([1, 0.22, 0.05, 0.05, 0.2, 1, 0.3, 0.3, 0]), 0, onFlow(m1, F, tIntro))
      showCrowd(tIntro, view * level([0.22, 0.07, 0, 0, 0.05, 0.3, 0.06, 0.06, 0]))
    } else if (ms < at(S.cross) && pr < 0.06) {
      setPoints(crowd, view * 0.2 * (1 - pr / 0.06), 0, onFlow(m1, F, 1))
      showCrowd(1, view * 0.05 * (1 - pr / 0.06))
    } else {
      const t = ms < at(S.cross) ? tResult : 1, colored = 1
      const alpha = ms < at(S.cross) ? ph(ms, S.result, 0.06, 0.14) : level([1, 0.22, 0.05, 0.05, 0.2, 1, 0.3, 0.3, 0])
      setPoints(crowd, view * alpha, colored, onFlow(m1, F, t))
      // In `result` the paths thin once the particles have landed, so the logo reads through them.
      const landed = 1 - 0.65 * ph(ms, S.result, 0.78, 0.95)
      showCrowd(t, view * (ms < at(S.cross) ? 0.16 * landed : level([0.22, 0.07, 0, 0, 0.05, 0.16, 0.06, 0.06, 0])), colored, ease(ph(ms, S.reflow, 0.1, 0.4)))
    }

    // One path and its tangent; the field on five slices: `velocity`.
    const pathOn = ph(ms, S.velocity, 0.05, 0.3) * (1 - ph(ms, S.train, 0, 0.1)) * view
    showFat(exact, pathOn, ms < at(S.euler) ? ph(ms, S.velocity, 0.05, 0.3) : 1)
    const slide = ph(ms, S.velocity, 0.3, 0.6) * (1 - ph(ms, S.euler, 0, 0.08)) * view
    {
      const kf = 8 + 48 * ease(ph(ms, S.velocity, 0.3, 0.6)), kk = Math.floor(kf), u = kf - kk
      const p: V = [ex[kk]![0] + (ex[kk + 1]![0] - ex[kk]![0]) * u, ex[kk]![1] + (ex[kk + 1]![1] - ex[kk]![1]) * u]
      const v: V = [(ex[kk + 1]![0] - ex[kk]![0]) * 64, (ex[kk + 1]![1] - ex[kk]![1]) * 64], dt = 0.16
      const from = through(local(p[0], p[1], kf / 64))
      showDot(pathDot, from, slide)
      showArrow(tangent, from, through(local(p[0] + v[0] * dt, p[1] + v[1] * dt, kf / 64 + dt)), slide * Math.min(1, ph(ms, S.velocity, 0.3, 0.6) * 6))
    }
    const fieldOff = 1 - ph(ms, S.euler, 0, 0.1)
    fields.forEach((set, j) => set(ph(ms, S.velocity, 0.6 + j * 0.04, 0.68 + j * 0.04) * fieldOff * view))
    const fieldText = ph(ms, S.velocity, 0.6, 0.85) * fieldOff

    // Euler with 4, 8, 16, 32 steps over the exact path, space magnified: `euler`.
    let shownN = 0, head = 0
    eulers.forEach(({ n, at: pts, line, dots }, j) => {
      const a = 0.16 + j * 0.18, on = ph(ms, S.euler, a, a + 0.12)
      if (on > 0) { shownN = n; head = on }
      const later = j < 3 ? ph(ms, S.euler, a + 0.18, a + 0.24) : 0
      const fade = (1 - 0.65 * later) * (1 - ph(ms, S.train, 0, 0.1)) * (ms > at(S.straight) ? 0.35 + 0.65 * (1 - ph(ms, S.straight, 0, 0.2)) : 1) * view
      showFat(line, on > 0 ? fade : 0, on)
      dots.forEach((d, i) => showDot(d, through(pts[i]!), on > 0 && i <= on * n + 1e-6 ? fade : 0))
      if (j < 2) showThin(slices[j]!, 0.55 * on * (1 - later) * (1 - ph(ms, S.straight, 0, 0.2)) * view)
    })
    const ends = ph(ms, S.euler, 0, 0.12) * (1 - ph(ms, S.train, 0, 0.1)) * view
    showDot(startDot, through(local(ex[0]![0], ex[0]![1], 0)), ends); showDot(endDot, through(local(ex[64]![0], ex[64]![1], 1)), ends)

    // The chord, walked in one step: `straight`.
    const chordOn = ph(ms, S.straight, 0.05, 0.4) * (1 - ph(ms, S.train, 0, 0.1)) * view
    showFat(chord, chordOn > 0 ? Math.min(1, chordOn * 3) * (1 - ph(ms, S.train, 0, 0.1)) : 0, ph(ms, S.straight, 0.05, 0.4))
    const step = out(ph(ms, S.straight, 0.45, 0.7))
    showArrow(oneStep, through(start.clone().sub(pivot)), through(start.clone().lerp(end, step).sub(pivot)), step > 0 ? (1 - ph(ms, S.train, 0, 0.1)) * view : 0)

    // The time axis: ticks for the Euler steps, a marker for the sampler's time and for the training's t.
    const axisOn = view * (1 - 0.4 * close)
    showFat(axis, axisOn)
    setTicks(ms > at(S.euler) && ms <= at(S.straight) ? Math.max(1, shownN) : 1, axisOn * 0.9)
    showDot(stepMarker, v3(tx(head), AY, 0), ms > at(S.euler) && ms <= at(S.straight) && head > 0 && head < 1 ? axisOn : 0)

    // Training: random pairs, one point on one line, the two arrows, the loss: `train`.
    const lines = ph(ms, S.train, 0.08, 0.22) * (1 - ph(ms, S.result, 0, 0.08)) + ph(ms, S.cross, 0, 0.1) * (1 - 0.6 * ph(ms, S.cross, 0.58, 0.7)) * (1 - ph(ms, S.reflow, 0, 0.15))
    showThin(pairs, 0.38 * Math.min(1, lines) * view)
    const trainOn = ms > at(S.train) ? (1 - ph(ms, S.result, 0, 0.08)) * view : 0
    const pick = ph(ms, S.train, 0.22, 0.3) * trainOn
    showFat(pair, pick); showDot(pairDots[0]!, pairA, pick); showDot(pairDots[1]!, pairB, pick)
    const mark = ph(ms, S.train, 0.3, 0.38) * trainOn
    trainSlice.visible = mark > 0.002; sliceMaterial.opacity = 0.07 * mark
    showThin(trainOutline, 0.8 * mark)
    showDot(xtDot, xtW, mark, out(mark)); showDot(marker, v3(tx(tr.t), AY, 0), mark)
    const red = ph(ms, S.train, 0.38, 0.45) * trainOn
    showArrow(truth, xtW, W(xt[0] + target[0] * 0.22 * out(red), xt[1] + target[1] * 0.22 * out(red), tr.t + 0.22 * out(red)), red > 0 ? trainOn : 0)
    const learn = ph(ms, S.train, 0.45, 0.9)
    let round = 0
    if (learn > 0 && trainOn > 0) {
      // The round on a log scale; the network's arrow interpolates between the saved checkpoints.
      const cps = tr.checkpoints, logR = Math.log10(D.setup.rounds1) * ease(learn)
      round = Math.round(10 ** logR)
      let j = 0
      while (j < cps.length - 2 && cps[j + 1]![0] <= round) j++
      const a = cps[j]!, b = cps[j + 1]!, u = clamp((Math.log10(round) - Math.log10(a[0])) / Math.max(1e-6, Math.log10(b[0]) - Math.log10(a[0])))
      const v: V = [a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u]
      showArrow(guess, xtW, W(xt[0] + v[0] * 0.22, xt[1] + v[1] * 0.22, tr.t + 0.22), trainOn)
    } else showArrow(guess, xtW, xtW, 0)

    // The crossing: lines through one point, their directions, the average; then the real, curved paths: `cross`.
    const crossOn = ms > at(S.cross) ? (1 - ph(ms, S.reflow, 0, 0.12)) * view : 0
    showThin(crossOutline, 0.8 * ph(ms, S.cross, 0.05, 0.15) * crossOn)
    const back = 1 - 0.7 * ph(ms, S.cross, 0.58, 0.7)
    showThin(crossLines, 0.55 * ph(ms, S.cross, 0.12, 0.32) * back * crossOn)
    const spread = out(ph(ms, S.cross, 0.32, 0.45))
    fan.forEach((a, i) => { const [x0, y0, x1, y1] = cr.lines[i]!; showArrow(a, crW, W(cr.point[0] + (x1 - x0) * 0.22 * spread, cr.point[1] + (y1 - y0) * 0.22 * spread, cr.t + 0.22 * spread), spread > 0 ? crossOn : 0) })
    fanMaterial.opacity = 0.6 * back * crossOn
    const avg = out(ph(ms, S.cross, 0.45, 0.55))
    showDot(crDot, crW, avg > 0 ? crossOn : 0)
    showArrow(average, crW, W(cr.point[0] + cr.model[0] * 0.22 * avg, cr.point[1] + cr.model[1] * 0.22 * avg, cr.t + 0.22 * avg), avg > 0 ? crossOn : 0)
    const straighten = ease(ph(ms, S.reflow, 0.1, 0.4))
    const curved = ph(ms, S.cross, 0.6, 0.85) * (1 - ph(ms, S.onestep, 0, 0.1)) * view
    showCurved(ph(ms, S.cross, 0.6, 0.85), 0.7 * curved * (1 - 0.6 * ph(ms, S.reflow, 0.45, 0.6)), 0, straighten)

    // Reflow: the paths straighten into their chords, the retrained model's paths lie on them: `reflow`.
    const second = ph(ms, S.reflow, 0.45, 0.75)
    showSecond(second, 0.9 * (1 - ph(ms, S.onestep, 0, 0.1)) * view)

    // One step each, two panels: `onestep`.
    const panelsOn = ph(ms, S.onestep, 0.1, 0.25)
    panels[0]!.set(panelsOn, ph(ms, S.onestep, 0.25, 0.4))
    panels[1]!.set(panelsOn, ph(ms, S.onestep, 0.4, 0.55))

    if (!split) renderer.render(scene, camera)
    else {
      const look = v3(1.05, -0.05, 0), yaw = 0.08 * ph(ms, S.onestep)
      panelCamera.position.copy(v3(-0.8, 0.24, 0.52).normalize().multiplyScalar(6.2).applyAxisAngle(UP, yaw).add(look))
      panelCamera.lookAt(look)
      renderer.setScissorTest(true)
      panels.forEach((p, i) => {
        renderer.setViewport(i * Wc / 2, 0, Wc / 2, Hc); renderer.setScissor(i * Wc / 2, 0, Wc / 2, Hc)
        renderer.render(p.scene, panelCamera)
      })
      renderer.setScissorTest(false)
      renderer.setViewport(0, 0, Wc, Hc)
    }

    // Text.
    const dpr = hud.width / Math.max(1, Wc)
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, Wc, Hc)
    g.setTransform(dpr * s0, 0, 0, dpr * s0, dpr * ox, dpr * oy)
    // The plane names step aside for the loss chart; by then the planes are known.
    const planeText = view * (1 - 0.6 * close) * (1 - ph(ms, S.train, 0.42, 0.47) * (1 - ph(ms, S.result, 0, 0.08)))
    label('噪声  t = 0', v3(tx(0), 1.32, 0), { alpha: planeText * (1 - facing) }); label('目标  t = 1', v3(tx(1), 1.32, 0), { alpha: planeText })
    label('t = 0', v3(tx(0) - 0.32, AY, 0), { font: mono, size: 18, alpha: axisOn }); label('1', v3(tx(1) + 0.16, AY, 0), { font: mono, size: 18, alpha: axisOn })
    readout(`${N} 个粒子`, ph(ms, S.intro, 0.1, 0.2) * (1 - ph(ms, S.velocity, 0, 0.1)), C.muted)
    readout('速度 = 路径的切线', fieldText, C.accent)
    text('dx/dt = v(x, t)', 640, 96, { size: 22, font: mono, fill: C.accent, alpha: fieldText })
    if (shownN && ms <= at(S.straight)) readout(`欧拉法 ${shownN} 步 · 终点偏差 ${pct(D.euler.steps[String(shownN)]!.error)}`, 1, C.warn)
    label('起点（噪声）', through(local(ex[0]![0], ex[0]![1], 0)), { alpha: ends, dy: 26 })
    label('真正的终点', through(local(ex[64]![0], ex[64]![1], 1)), { alpha: ends, dy: -24, fill: C.danger })
    readout('路是直的：一步就到', ph(ms, S.straight, 0.45, 0.6) * (1 - ph(ms, S.train, 0, 0.1)), C.ok)
    label(`t = ${tr.t.toFixed(2)}`, v3(tx(tr.t), AY - 0.16, 0), { font: mono, size: 18, fill: C.danger, alpha: mark })
    if (round > 0) {
      // The loss chart, top centre, and the round counter beside it.
      const cx = 500, cy = 30, cw = 280, chh = 64
      g.globalAlpha = trainOn
      g.strokeStyle = C.muted!; g.lineWidth = 1.5
      g.beginPath(); g.moveTo(cx, cy + chh); g.lineTo(cx + cw, cy + chh); g.stroke()
      const seen = tr.loss.filter(l => l[0] <= round)
      g.beginPath()
      seen.forEach((l, i) => { const x = cx + (Math.log10(l[0]) / Math.log10(D.setup.rounds1)) * cw, y = cy + chh - ((l[1] - lossMin) / (lossMax - lossMin)) * chh; if (i) g.lineTo(x, y); else g.moveTo(x, y) })
      g.strokeStyle = C.accent!; g.lineWidth = 2.2; g.lineJoin = 'round'; g.stroke()
      g.globalAlpha = 1
      text(`第 ${round.toLocaleString('en-US')} 轮`, cx + cw + 20, cy + 22, { size: 20, font: mono, align: 'left', fill: C.ink, alpha: trainOn })
      if (seen.length) text(`loss ${seen.at(-1)![1].toFixed(2)}`, cx + cw + 20, cy + 50, { size: 20, font: mono, align: 'left', fill: C.muted, alpha: trainOn })
    }
    const formula = ph(ms, S.train, 0.4, 0.48) * trainOn
    if (formula > 0) {
      const parts: [string, string][] = [['L = ‖ ', C.ink!], ['v', C.accent!], [' − ', C.ink!], ['(x₁ − x₀)', C.danger!], [' ‖²', C.ink!]]
      g.font = `500 26px ${mono}`
      let x = 640 - parts.reduce((w, [s]) => w + g.measureText(s).width, 0) / 2
      for (const [s, f] of parts) { text(s, x, 676, { size: 26, font: mono, align: 'left', fill: f, alpha: formula }); g.font = `500 26px ${mono}`; x += g.measureText(s).width }
    }
    readout(`训练 ${D.setup.rounds1.toLocaleString('en-US')} 轮 · ${N} 个粒子`, ph(ms, S.result, 0.1, 0.2) * (1 - ph(ms, S.cross, 0, 0.1)), C.muted)
    readout(`路程 ÷ 直线距离：${D.straightness.m1.toFixed(1)} → ${D.straightness.m2.toFixed(2)}`, ph(ms, S.reflow, 0.75, 0.85) * (1 - ph(ms, S.onestep, 0, 0.1)), C.ok)
    if (split) {
      const errOn = ph(ms, S.onestep, 0.55, 0.65)
      g.globalAlpha = panelsOn; g.strokeStyle = C.line!; g.lineWidth = 1.5
      g.beginPath(); g.moveTo(640, 40); g.lineTo(640, 680); g.stroke(); g.globalAlpha = 1
      text('第一个模型 · 走 1 步', 320, 56, { size: 24, alpha: panelsOn })
      text('Reflow 之后 · 走 1 步', 960, 56, { size: 24, alpha: panelsOn })
      text(`终点偏差 ${pct(D.onestep['m1-1']!.error)}`, 320, 670, { size: 28, font: mono, fill: C.warn, alpha: errOn })
      text(`终点偏差 ${pct(D.onestep['m2-1']!.error)}`, 960, 670, { size: 28, font: mono, fill: C.ok, alpha: errOn })
    }
  }

  let last = 0
  return {
    render(ms) { last = ms; render(ms) },
    resize(w, h) { resize(w, h); render(last) },
    dispose() {
      for (const item of owned) item.dispose()
      hud.remove()
    },
  }
})
