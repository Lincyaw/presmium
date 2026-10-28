import { threeScene } from '@lincyaw/addon-motion/scene'
import { clamp01, phase, spring01 } from '../../kit/fx/time.ts'
import { OUTPUT, disposeAll, look, studio, tone } from '../../kit/three-fx.ts'

// A thick frosted-glass card over a colour wallpaper, with one light streak gliding across it (Three.js
// MeshPhysicalMaterial transmission). `sweep`: the card lifts off the wallpaper with a tilt, its shadow spreading
// and softening (0–200 ms); a thin bright streak glides across its face from left to right, catching the rounded
// bevel, while the card slides and nods a little, so the blurred colour discs behind it shift with parallax
// (200–850 ms); the card settles flat with a small spring (850–1000 ms). Why Three.js: refraction, blur by roughness and a moving reflection are what a physical material
// does; no CSS filter refracts. Constraints: transmission refracts only the scene's own opaque objects, never the
// page behind the transparent canvas, so the wallpaper is an opaque mesh larger than the card's footprint, and the
// card's shadow is painted into it (a transparent shadow mesh would be missing from the refraction). The streak is a
// strip in a studio environment made once with PMREM and turned with `scene.environmentRotation`. The transmission
// pass renders the scene a second time, at half resolution here. Seek safety: every pose and uniform comes from ms.
const plateVertex = /* glsl */ `
  varying vec2 vXY;
  void main() {
    vXY = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const plateFragment = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uA;
  uniform vec3 uB;
  uniform vec3 uC;
  uniform vec3 uShade;
  uniform vec3 uDot;
  uniform vec2 uPa;
  uniform vec2 uPb;
  uniform vec2 uPc;
  uniform vec2 uShadow;
  uniform vec2 uHalf;
  uniform float uBlur;
  uniform float uShadowAlpha;
  varying vec2 vXY;
  // Crisp discs with a soft glow around them, and a fine dot grid: sharp detail is what shows the frost and the
  // refraction, since the glass blurs and bends it while the wallpaper beside the card stays sharp.
  vec3 disc(vec3 c, vec2 p, vec2 at, float r, vec3 tint) {
    float d = length(p - at), aa = fwidth(d) * 0.75;
    float glow = exp(-pow(max(0.0, d - r) / (0.55 * r), 2.0)) * 0.35;
    float inside = 1.0 - smoothstep(r - aa, r + aa, d);
    float light = smoothstep(1.2 * r, 0.0, length(p - at - r * vec2(-0.35, 0.4)));
    return mix(mix(c, tint, glow), mix(tint, uBase, 0.18 * light), inside);
  }
  float box(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
  void main() {
    vec2 g = fract(vXY / 0.24) - 0.5;
    float gd = length(g), gaa = fwidth(gd);
    vec3 c = mix(uBase, uDot, 0.55 * (1.0 - smoothstep(0.09 - gaa, 0.09 + gaa, gd)));
    c = disc(c, vXY, uPc, 0.62, uC);
    c = disc(c, vXY, uPa, 1.05, uA);
    c = disc(c, vXY, uPb, 0.85, uB);
    float shadow = 1.0 - smoothstep(-uBlur, uBlur, box(vXY - uShadow, uHalf, 0.2));
    c = mix(c, uShade, shadow * uShadowAlpha);
    gl_FragColor = vec4(c, 1.0);
    ${OUTPUT}
  }
`

function roundedRect(THREE: typeof import('three'), w: number, h: number, r: number) {
  const s = new THREE.Shape()
  const x = -w / 2, y = -h / 2
  s.moveTo(x + r, y)
  s.lineTo(x + w - r, y)
  s.quadraticCurveTo(x + w, y, x + w, y + r)
  s.lineTo(x + w, y + h - r)
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  s.lineTo(x + r, y + h)
  s.quadraticCurveTo(x, y + h, x, y + h - r)
  s.lineTo(x, y + r)
  s.quadraticCurveTo(x, y, x + r, y)
  return s
}

const easeOut = (k: number) => 1 - (1 - k) ** 3
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2)

export default threeScene(({ THREE, renderer, addons, at, width, height, color }) => {
  const { dark } = look(THREE, color)
  renderer.transmissionResolutionScale = 0.5
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(28, width / height, 0.1, 100)
  camera.position.set(0, 0, 12)
  camera.lookAt(0, 0, 0)

  // The room: grey walls (the bevels' sheen), a thin tilted strip behind the camera with a faint broad one beside it
  // (the streak and its glow), a soft panel above (the top bevel) and a dim one on the left.
  const environment = studio(THREE, renderer, [
    { at: [0.6, 0.8, 5], size: [0.12, 12], light: 24, roll: 0.55 },
    { at: [0.75, 0.8, 5], size: [1.4, 12], light: 0.6, roll: 0.55 },
    { at: [0, 5, 1.5], size: [7, 3], light: 2 },
    { at: [-5, -1, 2], size: [2, 6], light: 0.8 },
  ], dark ? 0.18 : 0.4)
  scene.environment = environment.texture
  // Frosted glass scatters a little light of its own: a sky light for the small diffuse part.
  scene.add(new THREE.HemisphereLight(new THREE.Color().setScalar(1), new THREE.Color().setScalar(0.6), 1.2))

  // The wallpaper: discs of three tokens over a dot grid, opaque so the glass can refract it.
  const PLATE = { w: 7.6, h: 4.3, z: -1.1 }
  const plateMaterial = new THREE.ShaderMaterial({
    vertexShader: plateVertex,
    fragmentShader: plateFragment,
    uniforms: {
      uBase: { value: tone(THREE, color, 'surface', ['sunk', 0.6]) },
      uA: { value: tone(THREE, color, 'accent') },
      uB: { value: tone(THREE, color, 'warn') },
      uC: { value: dark ? tone(THREE, color, 'accent', ['sheen', 0.35]) : tone(THREE, color, 'accent-soft', ['accent', 0.25]) },
      uShade: { value: tone(THREE, color, 'shadow') },
      uDot: { value: tone(THREE, color, 'line-strong') },
      uPa: { value: new THREE.Vector2() },
      uPb: { value: new THREE.Vector2() },
      uPc: { value: new THREE.Vector2() },
      uShadow: { value: new THREE.Vector2() },
      uHalf: { value: new THREE.Vector2() },
      uBlur: { value: 0.2 },
      uShadowAlpha: { value: 0 },
    },
  })
  const plate = new THREE.Mesh(new THREE.ShapeGeometry(roundedRect(THREE, PLATE.w, PLATE.h, 0.32), 16), plateMaterial)
  plate.position.z = PLATE.z
  scene.add(plate)

  const CARD = { w: 3.6, h: 2.25, d: 0.24 }
  const glass = new THREE.MeshPhysicalMaterial({
    color: tone(THREE, color, 'sheen'),
    transmission: 0.94,
    thickness: 0.6,
    roughness: 0.3,
    ior: 1.45,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    // The base layer's reflection is as rough as the frost and would smear the strip into a wash; the clearcoat
    // on top keeps it a thin streak.
    specularIntensity: 0.25,
  })
  const card = new THREE.Mesh(new addons.RoundedBoxGeometry(CARD.w, CARD.h, CARD.d, 8, 0.12), glass)
  scene.add(card)

  const u = plateMaterial.uniforms
  return {
    render(ms) {
      const t = ms - at(0)
      const rise = easeOut(phase(t, 0, 200))
      const drift = easeInOut(phase(t, 200, 650))
      const settle = spring01(Math.max(0, t - 850) / 1000, { duration: 0.15, bounce: 0.25 })
      // Lift: from lying flat on the wallpaper to floating, tilting as it rises (the tilt never dips a corner into the
      // wallpaper); then a slow drift; then flat.
      const lift = 0.04 + 1.06 * rise
      // The drift is a slide and a nod (the parallax); the card's yaw holds still while the streak crosses.
      const tiltX = (0.1 * rise + 0.12 * Math.sin(Math.PI * rise) - 0.05 * drift) * (1 - settle)
      const tiltY = 0.12 * rise * (1 - settle)
      card.position.set(-0.25 * (1 - rise) + 0.16 * drift * (1 - settle), -0.5 * (1 - rise) + 0.06 * drift * (1 - settle), PLATE.z + CARD.d / 2 + lift)
      card.rotation.set(tiltX, tiltY, -0.04 * Math.sin(Math.PI * rise))
      card.scale.setScalar(0.94 + 0.06 * rise)
      // The light streak: the room's strip turns at a steady speed; its reflection moves by the room's turn minus twice
      // the card's yaw, so with the yaw held at 0.12 the face (about 0.28 rad of the turn) is crossed once in 200–850 ms.
      const sweep = phase(t, 200, 650)
      scene.environmentRotation.set(0, THREE.MathUtils.lerp(0.17, 0.47, sweep), 0)
      // The discs drift slowly; the card's shadow is offset down-right by its height and blurs with it.
      const s = clamp01(t / 1000)
      u.uPa!.value.set(-1.9 + 0.35 * s, 0.75 - 0.15 * s)
      u.uPb!.value.set(1.85 - 0.3 * s, -0.95 + 0.2 * s)
      u.uPc!.value.set(0.4 + 0.2 * Math.sin(s * 3), 1.2 - 0.25 * s)
      u.uShadow!.value.set(card.position.x + 0.28 * lift, card.position.y - 0.38 * lift)
      u.uHalf!.value.set((CARD.w / 2) * Math.cos(tiltY) * card.scale.x, (CARD.h / 2) * Math.cos(tiltX) * card.scale.y)
      // The shadow is a flat rounded rectangle, not the tilted card's outline; the tilt stays small enough for that.
      u.uBlur!.value = 0.08 + 0.32 * lift
      u.uShadowAlpha!.value = (dark ? 0.6 : 0.42) * (1 - 0.3 * lift)
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
