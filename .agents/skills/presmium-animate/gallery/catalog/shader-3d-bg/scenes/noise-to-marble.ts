import { threeScene } from '@lincyaw/addon-motion/scene'
import { TYPE } from '../../../lengths/scenes/kit/frame.ts'
import { GLSL_SIMPLEX, OUTPUT, disposeAll, tone } from '../../../lengths/scenes/kit/three-fx.ts'
import { ease, phase } from '../../../lengths/scenes/kit/fx/time.ts'
import { overlay } from './lib/overlay.ts'

// How a procedural texture is built, for a graphics or generative-art lesson: one layer of smooth noise, then
// octaves of finer noise added one at a time (fractal noise, fBm), then the noise used to bend stripes into
// marble. Under the band of texture, a plot shows the values along its middle line (marked in the band), so the
// lesson reads in the curve as well as in the picture: one octave is a gentle hill, six octaves are rough at every
// scale, marble is a wave pushed around by the noise. `noise` (2.4 s): the band and the plot rise in (0–0.5 s);
// hold on one octave. `octaves` (3.2 s): octaves 2 to 6 come in one after another, 0.45 s apart, each fading in
// over 0.25 s so a new finer layer is seen arriving on the curve; the counter in the chip follows (cause: the
// layer arrives, effect: the number). `marble` (3.4 s): the chip changes (0–0.35 s), then the stripes are bent by
// the noise, from straight to fully warped (0.3–1.9 s, both ends eased), and the result holds. The noise drifts
// slowly through all states, so the holds are alive. `basis: 'cellular'` uses Worley (cell) noise instead of
// simplex noise. Everything is one fragment shader of the time; the plot evaluates the same function as the band.
// Adapted from HyperFrames fractal-noise and marble (with worley-noise, voronoi and gabor-noise as variants of the
// basis; their WebGPU shaders become one WebGL shader).

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const fragmentShader = /* glsl */ `
  uniform float uAspect;
  uniform float uOctaves;
  uniform float uWarp;
  uniform float uDrift;
  uniform float uShow;
  uniform int uBasis;
  uniform vec3 uSurface;
  uniform vec3 uInk;
  uniform vec3 uLine;
  uniform vec3 uAccent;
  varying vec2 vUv;
  ${GLSL_SIMPLEX}
  vec2 hash2(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return fract(sin(p) * 43758.5453);
  }
  // Worley noise: the distance to the nearest of one jittered point per cell, mapped to [-1, 1].
  float worley(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    float d = 8.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      d = min(d, length(g + hash2(i + g) - f));
    }
    return clamp(d, 0.0, 1.0) * 2.0 - 1.0;
  }
  float basis(vec2 p, float z) { return uBasis == 0 ? snoise(vec3(p, z)) : worley(p + z * 7.0); }
  // Fractal noise with a fractional octave count: the last octave's weight grows from 0 to 1 as it arrives.
  float fbm(vec2 p) {
    float sum = 0.0, norm = 0.0, amp = 1.0, freq = 1.0;
    for (int i = 0; i < 6; i++) {
      float w = clamp(uOctaves - float(i), 0.0, 1.0);
      sum += w * amp * basis(p * freq, float(i) * 3.1);
      norm += w * amp;
      amp *= 0.5; freq *= 2.03;
    }
    return sum / max(norm, 1e-4);
  }
  // The texture's value in [0, 1] at a point of the band: the noise, bending into marble as uWarp grows.
  float field(vec2 p) {
    p += vec2(uDrift, 0.0);
    float n = fbm(p);
    // Summed octaves cancel each other a little; widen the range as they arrive so the contrast stays.
    float gray = clamp(0.5 + 0.5 * n * (1.0 + 0.14 * (uOctaves - 1.0)), 0.0, 1.0);
    // Marble: stripes whose phase the noise pushes; dark only near the stripes' zero crossings, so veins are thin.
    float vein = pow(abs(sin(p.x * 2.4 + uWarp * 6.0 * n)), 0.4);
    return mix(gray, mix(gray, vein, 0.85), uWarp);
  }
  float box(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
  void main() {
    vec2 q = vec2(vUv.x * uAspect, vUv.y);
    // The band: x 6%–94% of the width, y 40%–80%; the plot: y 9%–33%, the same x.
    float x0 = 0.06 * uAspect, x1 = 0.94 * uAspect;
    vec2 bc = vec2((x0 + x1) * 0.5, 0.6), bh = vec2((x1 - x0) * 0.5, 0.2);
    float px = fwidth(q.y);
    vec4 c = vec4(0.0);
    float inBand = 1.0 - smoothstep(-px, px, box(q - bc, bh, 0.02));
    // Texture coordinates: 4 units across the band.
    vec2 tp = (q - vec2(x0, 0.4)) / (x1 - x0) * 4.0;
    float mid = 0.2 / (x1 - x0) * 4.0;
    if (inBand > 0.0) {
      float v = field(tp);
      vec3 col = mix(uInk, uSurface, v);
      // The middle line, dashed, in the accent colour: where the plot below samples the texture.
      float dash = step(0.5, fract(q.x * 14.0));
      float line = (1.0 - smoothstep(0.6 * px, 2.0 * px, abs(q.y - 0.6))) * dash;
      col = mix(col, uAccent, line);
      c = vec4(col, inBand);
    }
    // The band's outline.
    float edge = 1.0 - smoothstep(0.0, 1.5 * px, abs(box(q - bc, bh, 0.02)));
    c = mix(c, vec4(uLine, 1.0), edge);
    // The plot: a baseline, and the curve of field() along the middle line.
    if (q.x > x0 && q.x < x1 && q.y > 0.07 && q.y < 0.35) {
      float y0 = 0.09, y1 = 0.33;
      float base = 1.0 - smoothstep(0.0, 1.5 * px, abs(q.y - y0));
      c = mix(c, vec4(uLine, 1.0), base);
      float t = (q.x - x0) / (x1 - x0) * 4.0;
      float h = 0.004;
      float v = field(vec2(t, mid));
      float slope = (field(vec2(t + h, mid)) - field(vec2(t - h, mid))) / (2.0 * h) * (y1 - y0) / ((x1 - x0) / 4.0);
      float d = abs(q.y - (y0 + v * (y1 - y0))) / sqrt(1.0 + slope * slope);
      float curve = 1.0 - smoothstep(1.2 * px, 2.6 * px, d);
      c = mix(c, vec4(uAccent, 1.0), curve);
    }
    c.a *= uShow;
    gl_FragColor = c;
    ${OUTPUT}
  }
`

export default threeScene(({ THREE, renderer, root, at, width, height, color, parameters }) => {
  const basis = parameters.basis === 'cellular' ? 1 : 0
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 10)
  camera.position.z = 1
  const uniforms = {
    uAspect: { value: width / height },
    uOctaves: { value: 1 },
    uWarp: { value: 0 },
    uDrift: { value: 0 },
    uShow: { value: 0 },
    uBasis: { value: basis },
    uSurface: { value: tone(THREE, color, 'surface') },
    uInk: { value: tone(THREE, color, 'ink') },
    uLine: { value: tone(THREE, color, 'line-strong') },
    uAccent: { value: tone(THREE, color, 'accent') },
  }
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, transparent: true }))
  plane.position.set(0.5, 0.5, 0)
  scene.add(plane)

  const names = (parameters.labels as string[] | undefined) ?? ['一层噪声', '叠加 {n} 层：分形噪声', '用噪声扭曲条纹：大理石']
  const layer = overlay(root, `
    .nm-chip { position: absolute; left: 6cqw; top: 6cqh; }
    .nm-chip span { position: absolute; left: 0; top: 0; font-size: ${TYPE.lead}cqw; font-weight: 600; white-space: nowrap; }
    .nm-axis { position: absolute; left: 6cqw; top: 62.5cqh; font-size: ${TYPE.caption}cqw; color: var(--pm-color-muted); white-space: nowrap; }
  `, `<div class="nm-chip">${names.map(n => `<span>${n.replace('{n}', '<b class="nm-n">1</b>')}</span>`).join('')}</div>
    <div class="nm-axis">${(parameters.axis as string | undefined) ?? '虚线上的取值'}</div>`)
  const chips = [...layer.querySelectorAll<HTMLElement>('.nm-chip > span')]
  const counter = layer.querySelector<HTMLElement>('.nm-n')
  const axis = layer.querySelector<HTMLElement>('.nm-axis')!
  const show = (el: HTMLElement, v: number) => {
    el.style.opacity = v.toFixed(3)
    el.style.marginTop = `${(1 - v) * 2}cqh`
  }

  return {
    render(ms) {
      const enter = ease.outExpo(phase(ms, 0, 500))
      uniforms.uShow.value = enter
      plane.position.y = 0.5 - 0.02 * (1 - enter)
      // Octaves 2..6 arrive at 0.45 s intervals from the start of `octaves`, each over 0.25 s.
      const t1 = ms - at(1)
      let octaves = 1
      for (let i = 0; i < 5; i++) octaves += ease.inOut3(phase(t1, 150 + i * 450, 250))
      uniforms.uOctaves.value = octaves
      const t2 = ms - at(2)
      uniforms.uWarp.value = ease.inOut3(phase(t2, 300, 1600))
      uniforms.uDrift.value = (ms / 1000) * 0.05
      show(chips[0]!, Math.min(ease.outExpo(phase(ms, 200, 400)), 1 - ease.in2(phase(t1, 0, 200))))
      show(chips[1]!, Math.min(ease.outExpo(phase(t1, 100, 350)), 1 - ease.in2(phase(t2, 0, 200))))
      show(chips[2]!, ease.outExpo(phase(t2, 100, 350)))
      if (counter) counter.textContent = String(Math.max(1, Math.min(6, Math.floor(octaves + 0.5))))
      show(axis, ease.outExpo(phase(ms, 300, 400)))
      renderer.render(scene, camera)
    },
    resize(w, h) {
      uniforms.uAspect.value = w / h
    },
    dispose() {
      disposeAll(scene)
    },
  }
})
