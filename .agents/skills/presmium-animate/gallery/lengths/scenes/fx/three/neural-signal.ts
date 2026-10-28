import { threeScene } from '@lincyaw/addon-motion/scene'
import { clamp01 } from '../../kit/fx/time.ts'
import { mulberry32 } from '../../kit/fx/random.ts'
import { OUTPUT, disposeAll, glowTexture, look, tone } from '../../kit/three-fx.ts'

// A forward pass through a small network in depth (Three.js: instanced nodes, every edge in one draw). `forward`:
// the input layer lights up (0–250 ms); a wave of light then crosses the network layer by layer, a bright pulse
// running along every edge and each node flashing as the pulses reach it, strong connections brighter than weak
// ones (250–1000 ms); the output node the network "chooses" ends brightest, and the camera turns slowly the whole
// time so the layers separate in depth. With `direction: 'backward'` the same wave runs from the output back to the
// input in the warm token (backpropagation). Why Three.js: hundreds of edges and their pulses come from one uniform,
// and the turning camera shows the layers as planes. Constraints: GL lines are one pixel, so the edges are quads
// widened in the vertex shader to a width that follows the drawing buffer; halos are instanced quads, not points
// (points are capped in size and vanish at the frame's edge); additive light only on the dark page. Seek safety:
// node positions, weights and activations are seeded at build; the wave front is a function of ms.
const PER_LAYER = 240 // ms for a pulse to cross from one layer to the next
const FIRST = 120 // ms at which the first layer fires

const edgeVertex = /* glsl */ `
  attribute vec3 aFrom;
  attribute vec3 aTo;
  attribute float aEnd;
  attribute float aSide;
  attribute float aLayer;
  attribute float aWeight;
  uniform vec2 uResolution;
  uniform float uWidth;
  uniform float uFront;
  varying float vT;
  varying float vSide;
  varying float vHead;
  varying float vWeight;
  void main() {
    vec4 a = projectionMatrix * modelViewMatrix * vec4(aFrom, 1.0);
    vec4 b = projectionMatrix * modelViewMatrix * vec4(aTo, 1.0);
    vec2 dir = normalize((b.xy / b.w - a.xy / a.w) * uResolution);
    vec4 here = aEnd < 0.5 ? a : b;
    here.xy += vec2(-dir.y, dir.x) * aSide * uWidth / uResolution * here.w;
    gl_Position = here;
    vT = aEnd;
    vSide = aSide;
    vHead = uFront - aLayer;
    vWeight = aWeight;
  }
`
const edgeFragment = /* glsl */ `
  uniform vec3 uIdle;
  uniform vec3 uLit;
  uniform vec3 uHot;
  uniform float uIdleAlpha;
  varying float vT;
  varying float vSide;
  varying float vHead;
  varying float vWeight;
  void main() {
    // x > 0 behind the pulse: a short bright head, a fading streak, and a trace left on the edge once it passed,
    // all in the lit colour; stronger connections carry brighter pulses.
    float x = vHead - vT;
    float head = exp(-pow(x / 0.03, 2.0)) * vWeight;
    float tail = x > 0.0 ? exp(-x / 0.18) : 0.0;
    float trace = smoothstep(0.0, 0.12, x);
    float lit = vWeight * clamp(0.6 * tail + 0.35 * trace, 0.0, 1.0);
    // The quad is three line widths wide: the line fills its middle third, and the pulse head swells to all of it.
    float core = mix(0.3, 1.0, head);
    float across = 1.0 - smoothstep(core - 0.2, core, abs(vSide));
    vec3 c = mix(mix(uIdle, uLit, clamp((tail + trace) * 2.0, 0.0, 1.0)), uHot, head);
    gl_FragColor = vec4(c, across * clamp(uIdleAlpha + lit + head, 0.0, 1.0));
    ${OUTPUT}
  }
`
const haloVertex = /* glsl */ `
  attribute float aGlow;
  uniform float uSize;
  varying vec2 vUv;
  varying float vGlow;
  void main() {
    vec4 centre = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    centre.xy += position.xy * uSize * (0.7 + 0.6 * aGlow);
    gl_Position = projectionMatrix * centre;
    vUv = uv;
    vGlow = aGlow;
  }
`
const haloFragment = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  uniform float uStrength;
  varying vec2 vUv;
  varying float vGlow;
  void main() {
    float a = texture2D(uMap, vUv).r * vGlow * uStrength;
    if (a < 0.002) discard;
    gl_FragColor = vec4(uColor, a);
    ${OUTPUT}
  }
`

/** How lit a node is `dt` layers after the wave reached it: a quick attack, a flash, and a steady activation after. */
function fire(dt: number) {
  if (dt <= -0.15) return { level: 0, flash: 0 }
  const attack = clamp01((dt + 0.15) / 0.15)
  const flash = dt < 0 ? attack : Math.exp(-dt / 0.45)
  return { level: attack * (0.45 + 0.55 * flash), flash }
}

export default threeScene(({ THREE, renderer, parameters, at, width, height, color }) => {
  const layers = (Array.isArray(parameters.layers) ? parameters.layers : [8, 16, 16, 8]).map(Number)
  const backward = parameters.direction === 'backward'
  const { dark, blending } = look(THREE, color)
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100)

  // Nodes: each layer a grid in the y–z plane, layers spaced along x, with a seeded jitter.
  const rng = mulberry32(23)
  const nodes: { p: InstanceType<typeof THREE.Vector3>, layer: number, act: number }[] = []
  const byLayer: number[][] = []
  const SPACING = 2.3, CELL = 0.72
  layers.forEach((n, l) => {
    const cols = n >= 16 ? 4 : 2, rows = Math.ceil(n / cols)
    byLayer.push([])
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols), c = i % cols
      const p = new THREE.Vector3((l - (layers.length - 1) / 2) * SPACING + (rng() - 0.5) * 0.18, (r - (rows - 1) / 2) * CELL + (rng() - 0.5) * 0.1, (c - (cols - 1) / 2) * CELL + (rng() - 0.5) * 0.1)
      byLayer[l]!.push(nodes.length)
      nodes.push({ p, layer: l, act: 0.35 + 0.65 * rng() })
    }
  })
  // A forward pass ends with one clear winner in the output layer (`winner`, its index there); a backward pass has
  // none, since the error flows back from every output.
  const output = byLayer[layers.length - 1]!
  const winner = backward ? -1 : output[Math.min(output.length - 1, Number(parameters.winner ?? 2))]!
  if (!backward) for (const i of output) nodes[i]!.act = i === winner ? 1 : 0.22 + 0.18 * rng()

  // Edges: adjacent layers fully connected, each a quad (4 vertices, 2 triangles) with both ends in its attributes.
  const pairs: [number, number, number][] = []
  for (let l = 0; l + 1 < layers.length; l++) for (const i of byLayer[l]!) for (const j of byLayer[l + 1]!) pairs.push([i, j, l])
  const E = pairs.length
  const attr = { from: new Float32Array(E * 12), to: new Float32Array(E * 12), end: new Float32Array(E * 4), side: new Float32Array(E * 4), layer: new Float32Array(E * 4), weight: new Float32Array(E * 4) }
  const index: number[] = []
  pairs.forEach(([i, j, l], e) => {
    // Backward: the pulse runs from the later layer to the earlier one, so the edge starts at j.
    const [s, d] = backward ? [j, i] : [i, j]
    const order = backward ? layers.length - 2 - l : l
    const w = (0.2 + 0.8 * rng() ** 1.6) * nodes[s]!.act
    for (let v = 0; v < 4; v++) {
      const k = e * 4 + v
      attr.from.set(nodes[s]!.p.toArray(), k * 3)
      attr.to.set(nodes[d]!.p.toArray(), k * 3)
      attr.end[k] = v >> 1
      attr.side[k] = v & 1 ? 1 : -1
      attr.layer[k] = order
      attr.weight[k] = w
    }
    index.push(e * 4, e * 4 + 1, e * 4 + 2, e * 4 + 2, e * 4 + 1, e * 4 + 3)
  })
  const edgeGeometry = new THREE.BufferGeometry()
  edgeGeometry.setAttribute('position', new THREE.BufferAttribute(attr.from, 3)) // for the bounding sphere only
  edgeGeometry.setAttribute('aFrom', new THREE.BufferAttribute(attr.from, 3))
  edgeGeometry.setAttribute('aTo', new THREE.BufferAttribute(attr.to, 3))
  edgeGeometry.setAttribute('aEnd', new THREE.BufferAttribute(attr.end, 1))
  edgeGeometry.setAttribute('aSide', new THREE.BufferAttribute(attr.side, 1))
  edgeGeometry.setAttribute('aLayer', new THREE.BufferAttribute(attr.layer, 1))
  edgeGeometry.setAttribute('aWeight', new THREE.BufferAttribute(attr.weight, 1))
  edgeGeometry.setIndex(index)
  edgeGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 8)
  const litName = backward ? 'warn' : 'accent'
  const edgeMaterial = new THREE.ShaderMaterial({
    vertexShader: edgeVertex,
    fragmentShader: edgeFragment,
    transparent: true,
    depthWrite: false,
    blending,
    side: THREE.DoubleSide,
    uniforms: {
      uResolution: { value: new THREE.Vector2(1, 1) },
      uWidth: { value: 1 },
      uFront: { value: -1 },
      uIdle: { value: tone(THREE, color, 'line-strong') },
      uLit: { value: tone(THREE, color, litName) },
      uHot: { value: dark ? tone(THREE, color, 'sheen') : tone(THREE, color, litName) },
      uIdleAlpha: { value: 0.12 },
    },
  })
  scene.add(new THREE.Mesh(edgeGeometry, edgeMaterial))

  // Nodes: lit spheres whose colour and size follow the wave; halos behind them flash.
  const N = nodes.length
  const nodeMaterial = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0 })
  // A lit node glows in its own colour (the instance colour also feeds the emission), so it reads as lit, not shaded.
  nodeMaterial.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vColor.rgb * 0.45;')
  }
  nodeMaterial.customProgramCacheKey = () => 'fx-three-neural-node'
  const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.105, 24, 16), nodeMaterial, N)
  const halos = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
    vertexShader: haloVertex,
    fragmentShader: haloFragment,
    transparent: true,
    depthWrite: false,
    blending,
    uniforms: {
      uMap: { value: glowTexture(THREE) },
      uColor: { value: tone(THREE, color, litName) },
      uSize: { value: 0.55 },
      uStrength: { value: dark ? 0.9 : 0.3 },
    },
  }), N)
  const glowAttribute = new THREE.InstancedBufferAttribute(new Float32Array(N), 1)
  halos.geometry.setAttribute('aGlow', glowAttribute)
  const matrix = new THREE.Matrix4()
  nodes.forEach(({ p }, i) => halos.setMatrixAt(i, matrix.makeTranslation(p.x, p.y, p.z)))
  halos.frustumCulled = dots.frustumCulled = false
  scene.add(dots, halos)
  scene.add(new THREE.HemisphereLight(new THREE.Color().setScalar(1), new THREE.Color().setScalar(0.7), 1.6))
  const key = new THREE.DirectionalLight(new THREE.Color().setScalar(1), 1.2)
  key.position.set(-2, 5, 6)
  scene.add(key)

  // Idle nodes are a light grey on the light page (a mid grey would read as heavy balls), lit ones the token.
  const idle = dark ? tone(THREE, color, 'line-strong') : tone(THREE, color, 'line-strong', ['surface', 0.35]), lit = tone(THREE, color, litName)
  const hot = tone(THREE, color, litName, ['sheen', dark ? 0.5 : 0.3])
  const c = new THREE.Color(), q = new THREE.Quaternion(), s = new THREE.Vector3()
  const setSize = () => {
    const buffer = renderer.getDrawingBufferSize(new THREE.Vector2())
    edgeMaterial.uniforms.uResolution!.value.copy(buffer)
    edgeMaterial.uniforms.uWidth!.value = Math.max(4, buffer.y * 0.0075)
  }
  setSize()

  return {
    render(ms) {
      const t = ms - at(0)
      // The wave front in layers: layer k (in the wave's order) fires when it reaches k.
      const front = (t - FIRST) / PER_LAYER
      edgeMaterial.uniforms.uFront!.value = front
      nodes.forEach(({ p, layer, act }, i) => {
        const order = backward ? layers.length - 1 - layer : layer
        const { level, flash } = fire(front - order)
        const k = level * act, chosen = i === winner ? level : 0
        c.copy(idle).lerp(lit, Math.min(1, k * 1.6)).lerp(hot, flash * act * 0.6)
        dots.setColorAt(i, c)
        dots.setMatrixAt(i, matrix.compose(p, q, s.setScalar(1 + 0.45 * flash * act + 0.25 * chosen)))
        glowAttribute.array[i] = clamp01(0.18 * k + 0.9 * flash * act + 0.5 * chosen)
      })
      dots.instanceMatrix.needsUpdate = true
      dots.instanceColor!.needsUpdate = true
      glowAttribute.needsUpdate = true
      // A slow orbit: about 15° over the second, looking a little from the side and above.
      const yaw = -0.6 + 0.26 * clamp01(t / 1000), pitch = 0.22, r = 9.2
      camera.position.set(r * Math.sin(yaw) * Math.cos(pitch), r * Math.sin(pitch), r * Math.cos(yaw) * Math.cos(pitch))
      camera.lookAt(-0.45, -0.15, 0)
      renderer.render(scene, camera)
    },
    resize(w, h) {
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      setSize()
    },
    dispose() {
      disposeAll(scene)
    },
  }
})
