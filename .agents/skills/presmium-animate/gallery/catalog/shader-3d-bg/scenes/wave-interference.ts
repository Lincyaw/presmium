import { threeScene } from '@lincyaw/addon-motion/scene'
import { TYPE } from '../../../lengths/scenes/kit/frame.ts'
import { OUTPUT, disposeAll, tone } from '../../../lengths/scenes/kit/three-fx.ts'
import { ease, phase } from '../../../lengths/scenes/kit/fx/time.ts'
import { overlay } from './lib/overlay.ts'

// Two-source interference, for a physics or signal-processing lesson: ripples from one source, then a second
// source whose ripples cross the first, then the still pattern of where they add up and where they cancel. Crests
// are in the accent colour, troughs in a muted ink, still water in the surface colour. `one` (2.6 s): the tank
// fades in (0–0.4 s); the left source lights and its rings spread (from 0.3 s); the chip names it. `two` (3 s): the
// chip changes (0–0.35 s); the right source lights (0.2 s) and its rings spread into the first; where they meet,
// lines of still water appear between the crests (the cause, the second wave, arrives before the effect).
// `pattern` (3.4 s): the chip changes; over 1 s the picture turns from the moving surface to the time-averaged
// intensity (bright where the waves add, dark lines where they cancel), and holds; a faint moving wave stays on
// top, so the hold is alive. Every pixel is a closed-form sum of two damped sine waves of the time, so any frame
// can be shown on its own. Parameters: the wavelength and the source spacing (in wavelengths), the chip texts.
// Adapted from HyperFrames ripples (and sine-wave): one source of rings becomes two, and the picture explains why
// the rings form lines.

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const fragmentShader = /* glsl */ `
  uniform float uAspect;
  uniform float uOn1;
  uniform float uOn2;
  uniform float uPattern;
  uniform float uShow;
  uniform float uLambda;
  uniform float uGap;
  uniform vec3 uSurface;
  uniform vec3 uCrest;
  uniform vec3 uTrough;
  uniform vec3 uLine;
  uniform vec3 uInk;
  varying vec2 vUv;
  const float C = 0.25;
  float box(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
  // One source: a damped sine wave whose front has travelled C * age; nothing before the source starts.
  float wave(float r, float age) {
    if (age <= 0.0) return 0.0;
    float k = 6.2831853 / uLambda;
    float front = smoothstep(C * age, C * age - uLambda * 0.6, r);
    return sin(k * (r - C * age)) * front / sqrt(1.0 + 5.0 * r);
  }
  void main() {
    vec2 q = vec2(vUv.x * uAspect, vUv.y);
    vec2 centre = vec2(uAspect * 0.5, 0.42);
    vec2 half_ = vec2(uAspect * 0.45, 0.36);
    float px = fwidth(q.y);
    float inside = 1.0 - smoothstep(-px, px, box(q - centre, half_, 0.025));
    vec2 s1 = centre - vec2(uGap * 0.5, 0.0), s2 = centre + vec2(uGap * 0.5, 0.0);
    float r1 = length(q - s1), r2 = length(q - s2);
    float a = wave(r1, uOn1) + wave(r2, uOn2);
    // The time-averaged intensity of the two (full) waves, normalised to [0, 1].
    float g1 = 1.0 / sqrt(1.0 + 5.0 * r1), g2 = 1.0 / sqrt(1.0 + 5.0 * r2);
    float k = 6.2831853 / uLambda;
    float I = (g1 * g1 + g2 * g2 + 2.0 * g1 * g2 * cos(k * (r1 - r2))) / ((g1 + g2) * (g1 + g2));
    float amp = clamp(a * 0.9, -1.0, 1.0);
    vec3 moving = mix(mix(uSurface, uTrough, max(-amp, 0.0)), uCrest, max(amp, 0.0));
    vec3 still = mix(uSurface, uCrest, pow(I, 1.3));
    vec3 col = mix(moving, mix(still, moving, 0.08), uPattern);
    // The sources: ink dots that grow when they start.
    float d1 = 1.0 - smoothstep(0.011 * min(uOn1 * 6.0, 1.0) - px, 0.011 * min(uOn1 * 6.0, 1.0) + px, r1);
    float d2 = 1.0 - smoothstep(0.011 * min(uOn2 * 6.0, 1.0) - px, 0.011 * min(uOn2 * 6.0, 1.0) + px, r2);
    col = mix(col, uInk, max(d1 * step(0.0001, uOn1), d2 * step(0.0001, uOn2)));
    vec4 c = vec4(col, inside);
    float edge = 1.0 - smoothstep(0.0, 1.5 * px, abs(box(q - centre, half_, 0.025)));
    c = mix(c, vec4(uLine, 1.0), edge);
    c.a *= uShow;
    gl_FragColor = c;
    ${OUTPUT}
  }
`

export default threeScene(({ THREE, renderer, root, at, width, height, color, parameters }) => {
  const lambda = (parameters.wavelength as number | undefined) ?? 0.075
  const gap = ((parameters.spacing as number | undefined) ?? 3) * lambda
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(0, 1, 1, 0, 0.1, 10)
  camera.position.z = 1
  const uniforms = {
    uAspect: { value: width / height },
    uOn1: { value: 0 },
    uOn2: { value: 0 },
    uPattern: { value: 0 },
    uShow: { value: 0 },
    uLambda: { value: lambda },
    uGap: { value: gap },
    uSurface: { value: tone(THREE, color, 'surface') },
    uCrest: { value: tone(THREE, color, 'accent') },
    uTrough: { value: tone(THREE, color, 'line-strong') },
    uLine: { value: tone(THREE, color, 'line-strong') },
    uInk: { value: tone(THREE, color, 'ink') },
  }
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, transparent: true }))
  plane.position.set(0.5, 0.5, 0)
  scene.add(plane)

  const names = (parameters.labels as string[] | undefined) ?? ['一个波源', '第二个波源：波相叠加', '加强与抵消：干涉条纹']
  const layer = overlay(root, `
    .wi-chip { position: absolute; left: 5cqw; top: 5.5cqh; }
    .wi-chip span { position: absolute; left: 0; top: 0; font-size: ${TYPE.lead}cqw; font-weight: 600; white-space: nowrap; }
  `, `<div class="wi-chip">${names.map(n => `<span>${n}</span>`).join('')}</div>`)
  const chips = [...layer.querySelectorAll<HTMLElement>('.wi-chip > span')]
  const show = (el: HTMLElement, v: number) => {
    el.style.opacity = v.toFixed(3)
    el.style.marginTop = `${(1 - v) * 2}cqh`
  }

  return {
    render(ms) {
      uniforms.uShow.value = ease.outExpo(phase(ms, 0, 400))
      uniforms.uOn1.value = Math.max(0, ms - 300) / 1000
      const t1 = ms - at(1), t2 = ms - at(2)
      uniforms.uOn2.value = Math.max(0, t1 - 200) / 1000
      uniforms.uPattern.value = ease.inOut3(phase(t2, 300, 1000))
      show(chips[0]!, Math.min(ease.outExpo(phase(ms, 300, 400)), 1 - ease.in2(phase(t1, 0, 200))))
      show(chips[1]!, Math.min(ease.outExpo(phase(t1, 150, 350)), 1 - ease.in2(phase(t2, 0, 200))))
      show(chips[2]!, ease.outExpo(phase(t2, 150, 350)))
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
