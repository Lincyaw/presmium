import { threeScene } from '@lincyaw/addon-motion/scene'
import { clamp01, phase } from '../../kit/fx/time.ts'
import { GLSL_SIMPLEX, disposeAll, glowTexture, look, studio, tone } from '../../kit/three-fx.ts'

// The "model is thinking" orb (Three.js, a lit physical material moved in its vertex shader). `think`: a glossy,
// iridescent sphere churns with large soft bulges whose peaks run warm while the body stays the accent, reflections
// flowing over them (0–700 ms); the bulges ease out with one small rebound (a brief dent), the warmth drains with
// them, and a perfect accent sphere with one highlight and a rim of light remains (700–1000 ms). Why Three.js: the bulges and their colour come from one noise field on the GPU, lit with
// clearcoat and iridescence by a studio environment; CSS cannot shade a moving surface. Constraints: the surface is
// displaced in `onBeforeCompile` (with `customProgramCacheKey`), and its normal is recomputed from two displaced
// neighbours, or the bulges would be lit as a plain sphere; the noise lives only in GLSL, which is fine because
// nothing on the CPU has to agree with it. The light page's accent is a dark teal: the emitted rim and the studio's
// reflections keep the sphere from reading as a dark ball. Seek safety: the noise clock and the amplitude are closed-form functions of ms (no accumulation).
const AMP = 0.24
const FAST = 1.5 // noise units per second while thinking

/** The noise clock: steady while thinking, then slowing to a stop at 1 s (velocity falls linearly to zero). */
function noiseTime(t: number) {
  const s = t / 1000
  if (s <= 0.7) return FAST * s
  const k = clamp01((s - 0.7) / 0.3)
  return FAST * (0.7 + 0.3 * (k - (k * k) / 2))
}

/** The amplitude: full while thinking, then a damped cosine that rebounds once (a dent) and ends at exactly 0. */
function amplitude(t: number) {
  const s = phase(t, 700, 300)
  return AMP * (1 - s) ** 2 * Math.cos(2.5 * Math.PI * s)
}

const vertexHead = /* glsl */ `
  uniform float uT;
  uniform float uA;
  varying float vBulge;
  varying float vShade;
  ${GLSL_SIMPLEX}
  float field(vec3 d) {
    return 0.9 * snoise(d * 0.72 + vec3(0.0, uT, 0.35 * uT)) + 0.1 * snoise(d * 1.5 - vec3(0.8 * uT, 0.0, 0.6 * uT));
  }
  vec3 surface(vec3 q) {
    vec3 d = normalize(q);
    return d * (1.0 + uA * field(d));
  }
`
const normalPart = /* glsl */ `
  vec3 dir = normalize(position);
  vec3 tA = normalize(cross(dir, abs(dir.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 tB = cross(dir, tA);
  vec3 p0 = surface(dir);
  vec3 objectNormal = normalize(cross(surface(dir + tA * 0.01) - p0, surface(dir + tB * 0.01) - p0));
  // Colour follows the bulges: their peaks run warm while the orb thinks and cool back as it calms.
  vBulge = uA * field(dir) / ${AMP.toFixed(2)};
  vShade = dot(dir, vec3(-0.55, 0.75, 0.37));
`

export default threeScene(({ THREE, renderer, at, width, height, color }) => {
  const { dark, blending } = look(THREE, color)
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 50)
  camera.position.set(0, 0.15, 7)
  camera.lookAt(0, 0, 0)

  // Reflections: a key panel above-left (the highlight that stays), a rim strip on the right, a dim floor bounce.
  const environment = studio(THREE, renderer, [
    { at: [-3, 3.5, 3], size: [3, 2.2], light: 4 },
    { at: [4.8, 0.5, -1], size: [0.6, 6], light: 2.2 },
    { at: [0, -4.8, 1], size: [6, 3], light: 0.5 },
  ], 0.12, 0.03)
  scene.environment = environment.texture
  const key = new THREE.DirectionalLight(new THREE.Color().setScalar(1), 1.4)
  key.position.set(-3, 4, 5)
  scene.add(key, new THREE.HemisphereLight(new THREE.Color().setScalar(1), new THREE.Color().setScalar(0.25), 0.8))

  const uniforms = {
    uT: { value: 0 },
    uA: { value: AMP },
    uColorA: { value: tone(THREE, color, 'accent') },
    uColorB: { value: dark ? tone(THREE, color, 'warn') : tone(THREE, color, 'warn', ['sheen', 0.08]) },
    uRim: { value: tone(THREE, color, 'accent', ['sheen', dark ? 0.2 : 0.55]).multiplyScalar(dark ? 0.9 : 0.6) },
  }
  const material = new THREE.MeshPhysicalMaterial({
    roughness: 0.2,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    iridescence: 0.7,
    iridescenceIOR: 1.3,
    iridescenceThicknessRange: [120, 420],
  })
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${vertexHead}`)
      .replace('#include <beginnormal_vertex>', normalPart)
      .replace('#include <begin_vertex>', 'vec3 transformed = p0;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uColorA;\nuniform vec3 uColorB;\nuniform vec3 uRim;\nvarying float vBulge;\nvarying float vShade;')
      .replace('#include <color_fragment>', 'diffuseColor.rgb = mix(uColorA * (0.85 + 0.3 * vShade), uColorB, 0.85 * smoothstep(-0.15, 0.95, vBulge));')
      // A rim of light (three K6): the orb glows at its edge whatever lights it.
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uRim * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.5);')
  }
  material.customProgramCacheKey = () => 'fx-three-ai-orb'
  const orb = new THREE.Mesh(new THREE.SphereGeometry(1, 192, 128), material)
  scene.add(orb)

  // A halo behind (light adds up on the dark page; a faint tint on the light one) and a soft shadow below.
  const glow = glowTexture(THREE)
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: tone(THREE, color, 'accent'), blending, depthWrite: false, transparent: true }))
  halo.position.set(0, 0, -1.2)
  halo.scale.setScalar(4.6)
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glow, color: tone(THREE, color, 'shadow'), transparent: true, opacity: dark ? 0.5 : 0.22, depthWrite: false }))
  shadow.rotation.x = -Math.PI / 2
  shadow.position.y = -1.42
  shadow.scale.set(2.6, 2.6, 1)
  scene.add(halo, shadow)

  return {
    render(ms) {
      const t = ms - at(0)
      const a = amplitude(t)
      uniforms.uT.value = noiseTime(t)
      uniforms.uA.value = a
      orb.rotation.set(0.15, 0.5 * uniforms.uT.value, 0)
      const busy = Math.abs(a) / AMP
      halo.material.opacity = (dark ? 0.55 : 0.22) * (0.75 + 0.25 * busy)
      renderer.render(scene, camera)
    },
    resize(w, h) {
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    },
    dispose() {
      disposeAll(scene)
      environment.dispose()
    },
  }
})
