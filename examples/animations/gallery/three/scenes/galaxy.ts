import { threeScene } from '@lincyaw/addon-motion/scene'

// 60,000 Points moved on the GPU by a ShaderMaterial: per-particle attributes (radius, arm, seed) and uniforms for
// the phases and uTime. Seek safety: the shader computes each position from the uniforms alone, so setting the
// uniforms from the time is the whole render; gl_PointSize is multiplied by the pixel ratio by hand.
const COUNT = 60000
const ARMS = 3
const clamp = (k: number) => Math.min(1, Math.max(0, k))
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2)

function random(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const vertexShader = /* glsl */ `
  attribute float radius;
  attribute float arm;
  attribute vec3 seed;
  uniform float uBurst;
  uniform float uTwist;
  uniform float uTime;
  uniform float uSize;
  uniform vec3 uInner;
  uniform vec3 uOuter;
  varying vec3 vColor;
  void main() {
    float r = radius * uBurst;
    // Arms: the angle grows with the radius (uTwist), and inner stars orbit faster (differential rotation).
    float angle = arm + uTwist * r * 1.4 + uTime * 0.6 / (0.3 + r);
    vec3 p = vec3(cos(angle) * r, 0.0, sin(angle) * r);
    p += seed * (0.15 + 0.35 * (1.0 - uTwist)) * (0.3 + r * 0.25);
    vec4 view = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * view;
    gl_PointSize = uSize * (1.0 / -view.z);
    vColor = mix(uInner, uOuter, clamp(radius / 4.0, 0.0, 1.0));
  }
`
const fragmentShader = /* glsl */ `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    if (d > 0.5) discard;
    gl_FragColor = vec4(vColor, (1.0 - d * 2.0) * 0.9);
  }
`

export default threeScene(({ THREE, renderer, at, width, height, color }) => {
  const phase = (ms: number, k: number) => ease(clamp((ms - at(k)) / (at(k + 1) - at(k))))
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100)

  const next = random(5)
  const radius = new Float32Array(COUNT)
  const arm = new Float32Array(COUNT)
  const seed = new Float32Array(COUNT * 3)
  for (let i = 0; i < COUNT; i++) {
    radius[i] = 4.2 * next() ** 1.6
    arm[i] = ((i % ARMS) / ARMS) * Math.PI * 2
    // Scatter that thins with height: a cube root pulls most stars to the disk.
    for (let j = 0; j < 3; j++) seed[i * 3 + j] = Math.cbrt(next() * 2 - 1) * (j === 1 ? 0.35 : 1)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3)) // the shader ignores it
  geometry.setAttribute('radius', new THREE.BufferAttribute(radius, 1))
  geometry.setAttribute('arm', new THREE.BufferAttribute(arm, 1))
  geometry.setAttribute('seed', new THREE.BufferAttribute(seed, 3))
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 6) // positions are made in the shader
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uBurst: { value: 0 },
      uTwist: { value: 0 },
      uTime: { value: 0 },
      uSize: { value: 14 * renderer.getPixelRatio() },
      uInner: { value: new THREE.Color(color('warn')) },
      uOuter: { value: new THREE.Color(color('accent')) },
    },
  })
  const points = new THREE.Points(geometry, material)
  scene.add(points)

  return {
    render(ms) {
      const u = material.uniforms
      u.uBurst!.value = 0.02 + 0.98 * phase(ms, 0)
      u.uTwist!.value = phase(ms, 1)
      // Rotation starts with step 2; before it the galaxy holds still.
      u.uTime!.value = Math.max(0, ms - at(2)) / 1000
      const tilt = phase(ms, 3)
      camera.position.set(0, 9 - 5 * tilt, 0.01 + 6 * tilt)
      camera.lookAt(0, 0, 0)
      renderer.render(scene, camera)
    },
    resize(w, h) {
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    },
    dispose() {
      geometry.dispose()
      material.dispose()
    },
  }
})
