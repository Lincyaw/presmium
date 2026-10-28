import { threeScene } from '@lincyaw/addon-motion/scene'
import { clamp01, phase } from '../../kit/fx/time.ts'
import { mulberry32 } from '../../kit/fx/random.ts'
import { GLSL_TIME, OUTPUT, disposeAll, look, markPoints, markTexture, pointScale, tone } from '../../kit/three-fx.ts'

// The Presmium mark written by 15,000 particles in one second (Three.js, one Points draw). `assemble`: a loose
// cloud fades in around the empty centre (0–100 ms); every particle flies a curved, swirling path to its own point
// of the mark, the left of the mark landing first and the right last, so the arrivals read as writing; each swells
// as it lands and one in twenty-five twinkles as a four-pointed star (100–850 ms); a crisp copy of the mark fades in
// under the settled points (760–1000 ms) and one glint crosses it (840–1000 ms). Why Three.js: thousands of independent flights cost one draw call when the GPU computes
// every position from one clock. Seek safety: starts, delays and sizes are seeded at build and the shader derives
// each position from the uniforms alone, so any time can be shown directly. The mark is sampled from its path data
// on a fixed-size canvas (no font, no layout); positions come from the shader, so the bounding sphere is set by
// hand; point sizes follow the drawing buffer, so the dots look the same at any size and pixel ratio.
const SPAN = 0.45 // the flight clock each particle takes, out of 0.9

const vertexShader = /* glsl */ `
  attribute vec3 aStart;
  attribute float aDelay;
  attribute float aSeed;
  attribute float aBand;
  uniform float uQ;
  uniform float uSpin;
  uniform float uSize;
  uniform float uIn;
  uniform float uRest;
  uniform float uSweep;
  uniform float uGain;
  varying float vK;
  varying float vFlare;
  varying float vTwinkle;
  varying float vBand;
  varying float vAlpha;
  ${GLSL_TIME}
  vec3 turnY(vec3 p, float a) {
    float c = cos(a), s = sin(a);
    return vec3(c * p.x + s * p.z, p.y, -s * p.x + c * p.z);
  }
  void main() {
    float local = (uQ - aDelay) / ${SPAN.toFixed(2)};
    float k = easeOutCubic(clamp01(local));
    // The start swirls about the vertical axis while the particle leaves it, and the path bulges sideways.
    vec3 start = turnY(aStart, (1.0 - k) * (2.0 + uSpin));
    vec3 side = cross(position - start, vec3(0.0, 0.0, 1.0));
    side /= max(length(side), 1e-4);
    vec3 p = mix(start, position, k) + side * (aSeed - 0.5) * 1.6 * sin(3.14159265 * k);
    // Every particle swells a little as it lands (about 60 ms); one in twenty-five twinkles, a four-pointed star in
    // the spark colour: sparse twinkles read as sparkle, all of them at once as fog. The band crosses the mark.
    float flare = exp(-pow((local - 0.62) / 0.12, 2.0));
    float twinkle = flare * step(0.96, fract(aSeed * 7.31));
    float band = exp(-pow((aBand - uSweep) / 0.02, 2.0)) + 0.3 * exp(-pow((aBand - uSweep) / 0.07, 2.0));
    vK = k;
    vFlare = flare;
    vTwinkle = twinkle;
    vBand = band;
    vAlpha = uGain * uIn * mix(1.0, 0.08, uRest) * (0.55 + 0.45 * k);
    vec4 view = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * view;
    // A twinkling point is drawn five times larger to hold the star's arms; its dot keeps the size it had.
    gl_PointSize = uSize * (0.55 + 0.9 * aSeed) * (1.0 + 0.35 * flare + 0.4 * band) * (1.0 + 4.0 * twinkle) * mix(1.0, 0.6, uRest) / -view.z;
  }
`
const fragmentShader = /* glsl */ `
  uniform vec3 uFrom;
  uniform vec3 uTo;
  uniform vec3 uSpark;
  uniform vec3 uGlint;
  varying float vK;
  varying float vFlare;
  varying float vTwinkle;
  varying float vBand;
  varying float vAlpha;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float d = length(p) * (1.0 + 4.0 * vTwinkle);
    float disc = d < 1.0 ? 1.0 - d * d : 0.0;
    float arms = max(pow(1.0 - abs(p.x), 1.5) * exp(-abs(p.y) * 7.0), pow(1.0 - abs(p.y), 1.5) * exp(-abs(p.x) * 7.0));
    float shape = max(disc, arms * vTwinkle);
    if (shape < 0.01) discard;
    vec3 c = mix(mix(mix(uFrom, uTo, vK), uSpark, vTwinkle), uGlint, vBand * 0.85);
    gl_FragColor = vec4(c, min(1.0, vAlpha + vFlare) * shape);
    ${OUTPUT}
  }
`
// The crisp mark: an alpha mask in the token colour, with the same band in the same coordinate as the points.
const markVertex = /* glsl */ `
  uniform vec2 uExtent;
  varying vec2 vUv;
  varying float vBand;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vec2 n = world.xy / uExtent + 0.5;
    vBand = 0.7 * n.x + 0.3 * n.y;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`
const markFragment = /* glsl */ `
  uniform sampler2D uMask;
  uniform vec3 uColor;
  uniform vec3 uGlint;
  uniform float uOpacity;
  uniform float uSweep;
  varying vec2 vUv;
  varying float vBand;
  void main() {
    float a = texture2D(uMask, vUv).a * uOpacity;
    if (a < 0.003) discard;
    // A sharp core with a soft wing: a glint, not a smudge.
    float band = exp(-pow((vBand - uSweep) / 0.02, 2.0)) + 0.3 * exp(-pow((vBand - uSweep) / 0.07, 2.0));
    gl_FragColor = vec4(mix(uColor, uGlint, band * 0.85), a);
    ${OUTPUT}
  }
`

export default threeScene(({ THREE, renderer, parameters, at, width, height, color }) => {
  const count = Math.round(Number(parameters.count ?? 15000))
  const { dark, blending } = look(THREE, color)
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 100)
  camera.position.set(0, 0, 11)
  camera.lookAt(0, 0, 0)

  const mark = markPoints(count, 3.3)
  const rng = mulberry32(11)
  const position = new Float32Array(count * 3)
  const start = new Float32Array(count * 3)
  const delay = new Float32Array(count)
  const seed = new Float32Array(count)
  const band = new Float32Array(count)
  mark.points.forEach(({ x, y }, i) => {
    position.set([x, y, 0], i * 3)
    // A loose ellipsoidal shell, radius 3–5, flattened so most of the cloud is in the frame.
    const z = rng() * 2 - 1, a = rng() * Math.PI * 2, r = 3 + 2 * rng() ** 0.7, s = Math.sqrt(1 - z * z)
    start.set([r * s * Math.cos(a), r * z * 0.55, r * s * Math.sin(a) * 0.8], i * 3)
    const u = x / mark.width + 0.5, v = y / mark.height + 0.5
    delay[i] = 0.35 * u + 0.1 * rng()
    seed[i] = rng()
    band[i] = 0.7 * u + 0.3 * v
  })
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(position, 3))
  geometry.setAttribute('aStart', new THREE.BufferAttribute(start, 3))
  geometry.setAttribute('aDelay', new THREE.BufferAttribute(delay, 1))
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
  geometry.setAttribute('aBand', new THREE.BufferAttribute(band, 1))
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6) // positions are made in the shader

  // On the dark page sparks and the glint are white light. On the light page white would vanish: the sparks are
  // gold (the warm token) and the glint a lighter accent on the dark mark.
  const spark = dark ? tone(THREE, color, 'sheen') : tone(THREE, color, 'warn', ['sheen', 0.1])
  const glint = dark ? tone(THREE, color, 'sheen') : tone(THREE, color, 'accent', ['sheen', 0.65])
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending,
    uniforms: {
      uQ: { value: 0 },
      uSpin: { value: 0 },
      uSize: { value: 0.04 * pointScale(THREE, renderer, camera) },
      uIn: { value: 0 },
      uRest: { value: 0 },
      uSweep: { value: -1 },
      // Additive light piles up where the points land: on the dark page each point gives a third of its light, so
      // the settled mark is the accent, not a white blur.
      uGain: { value: dark ? 0.32 : 1 },
      uFrom: { value: tone(THREE, color, 'muted') },
      uTo: { value: tone(THREE, color, 'accent') },
      uSpark: { value: spark },
      uGlint: { value: glint },
    },
  })
  const points = new THREE.Points(geometry, material)
  points.renderOrder = 1
  scene.add(points)

  const crisp = new THREE.ShaderMaterial({
    vertexShader: markVertex,
    fragmentShader: markFragment,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uMask: { value: markTexture(THREE) },
      uColor: { value: tone(THREE, color, 'accent') },
      uGlint: { value: glint },
      uOpacity: { value: 0 },
      uSweep: { value: -1 },
      uExtent: { value: new THREE.Vector2(mark.width, mark.height) },
    },
  })
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(120 * mark.unit, 120 * mark.unit), crisp)
  plate.position.set((60 - mark.centre[0]) * mark.unit, (mark.centre[1] - 60) * mark.unit, 0)
  scene.add(plate)

  return {
    render(ms) {
      const t = ms - at(0), u = material.uniforms
      u.uIn!.value = 1 - (1 - phase(t, 0, 100)) ** 2
      // The flight clock runs 0 → 0.9 over 100–850 ms: the last particle (delay 0.45) lands at 850 ms.
      u.uQ!.value = (0.9 * (t - 100)) / 750
      u.uSpin!.value = -0.6 * clamp01(t / 1000)
      const rest = phase(t, 760, 240)
      // On the light page the crisp copy is opaque before the points give way, so the mark never thins out; on the
      // dark page light adds up, so the points fade exactly as the copy comes in and the mark never flares white.
      const smooth = (k: number) => k * k * (3 - 2 * k)
      const copy = smooth(clamp01(rest / 0.6))
      u.uRest!.value = dark ? copy : smooth(clamp01((rest - 0.4) / 0.6))
      const sweep = -0.15 + 1.3 * phase(t, 840, 160)
      u.uSweep!.value = t < 840 ? -1 : sweep
      crisp.uniforms.uOpacity!.value = copy
      crisp.uniforms.uSweep!.value = u.uSweep!.value
      renderer.render(scene, camera)
    },
    resize(w, h) {
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      material.uniforms.uSize!.value = 0.04 * pointScale(THREE, renderer, camera)
    },
    dispose() {
      disposeAll(scene)
    },
  }
})
