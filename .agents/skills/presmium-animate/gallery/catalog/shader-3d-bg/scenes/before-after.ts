import { threeScene } from '@lincyaw/addon-motion/scene'
import { TYPE } from '../../../lengths/scenes/kit/frame.ts'
import { mulberry32 } from '../../../lengths/scenes/kit/fx/random.ts'
import { GLSL_SIMPLEX, OUTPUT, disposeAll, tone } from '../../../lengths/scenes/kit/three-fx.ts'
import { ease, phase } from '../../../lengths/scenes/kit/fx/time.ts'
import { drawFigure, type Figure } from './lib/figures.ts'
import { decodePictures } from './lib/images.ts'
import { overlay } from './lib/overlay.ts'

// One picture turns into another in place: a chart before and after a method, a photo before and after a filter,
// a design before and after a change. Because the frame, the axes and the position stay put, the eye compares
// the two directly; a cut or a slide would make it look for the picture again. `before` (1.4 s): the first
// picture rises in (0–0.4 s) with its name in a chip above it, and holds so it can be read. `change` (1.2 s): the
// chip's name leaves (0–0.2 s); the second picture replaces the first along a front that crosses the picture
// (0.1–1.1 s, both ends eased), its edge a thin line in the accent colour that exists only while it moves; the new
// name rises as the front leaves (0.85–1.2 s). `after` (2.4 s): hold on the result. Three fronts (`mode`):
// `dissolve` (a noise threshold: the change arrives everywhere at once, in patches, for "the same thing, cleaned
// up"), `portal` (a circle growing from `origin`: the change starts at a place, for "it starts here"), `wipe` (a
// slanted line from left to right: before on the right, after on the left, for "old → new"). The pictures are
// figure cards (a curve, bars, points, a number) or SVG/bitmaps decoded before the first frame; a WebGL fragment
// shader mixes them, so the front is exact at every seek.
// Adapted from HyperFrames vfx-portal (and the before/after idea of vfx-shatter; their HTML-in-canvas capture
// becomes figures drawn on a canvas).

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`
const fragmentShader = /* glsl */ `
  uniform sampler2D uA;
  uniform sampler2D uB;
  uniform float uP;
  uniform int uMode;
  uniform vec2 uOrigin;
  uniform float uAspect;
  uniform vec3 uEdge;
  uniform float uFade;
  varying vec2 vUv;
  ${GLSL_SIMPLEX}
  void main() {
    vec4 a = texture2D(uA, vUv);
    vec4 b = texture2D(uB, vUv);
    // s: where this pixel is along the front's travel (0 = changes first, 1 = last); w: the edge's soft width.
    float s;
    float w;
    if (uMode == 0) {
      vec2 q = vUv * vec2(uAspect, 1.0) * 1.5;
      // Spread wide, so the patches turn over through the whole move, not all at its middle; squashed into 0..1
      // without clamping, since a flat plateau would sit on the edge all at once and flash as a filled blob.
      float x = 0.8 * snoise(vec3(q, 0.0)) + 0.22 * snoise(vec3(q * 2.3, 4.0));
      s = 0.5 + 0.68 * x / (0.35 + abs(x));
      w = 0.018;
    } else if (uMode == 1) {
      vec2 d = (vUv - uOrigin) * vec2(uAspect, 1.0);
      float far = length(max(uOrigin, 1.0 - uOrigin) * vec2(uAspect, 1.0));
      s = length(d) / far;
      w = 0.02;
    } else {
      s = (vUv.x + 0.18 * (vUv.y - 0.5)) / 1.0;
      w = 0.012;
    }
    // The threshold runs a little past both ends, so the first and last frames are wholly one picture.
    float th = mix(-w * 2.0, 1.0 + w * 2.0, uP);
    float m = smoothstep(th + w, th - w, s);
    vec4 c = mix(a, b, m);
    float edge = (1.0 - smoothstep(0.0, w * 0.7, abs(s - th))) * step(0.001, uP) * step(uP, 0.999);
    c.rgb = mix(c.rgb, uEdge, edge * 0.7);
    c.a = max(c.a, edge * max(a.a, b.a));
    c.a *= uFade;
    gl_FragColor = c;
    ${OUTPUT}
  }
`

function noisySignal(seed: number) {
  const rng = mulberry32(seed)
  const clean = Array.from({ length: 64 }, (_, i) => 5 + 2.2 * Math.sin(i / 7) + 0.8 * Math.sin(i / 2.9 + 1))
  const noisy = clean.map(v => v + (rng() - 0.5) * 3.2)
  return { clean, noisy }
}

type Side = Figure & { picture?: string, name?: string }
const MODES = { dissolve: 0, portal: 1, wipe: 2 } as const

export default threeScene(async ({ THREE, renderer, root, at, width, height, color, parameters }) => {
  const signal = noisySignal(11)
  const before: Side = (parameters.before as Side | undefined) ?? { title: '传感器读数', kind: 'line', values: signal.noisy, max: 10, tag: '示意', name: '原始信号' }
  const after: Side = (parameters.after as Side | undefined) ?? { title: '传感器读数', kind: 'line', values: signal.clean, max: 10, tag: '示意', name: '低通滤波后' }
  const mode = MODES[(parameters.mode as keyof typeof MODES | undefined) ?? 'dissolve'] ?? 0
  const origin = (parameters.origin as [number, number] | undefined) ?? [0.5, 0.5]
  const pictures = await decodePictures([before.picture, after.picture], color)

  const CW = 1600, CH = 900
  const texture = (side: Side, picture: HTMLImageElement | null | undefined) => {
    const map = new THREE.CanvasTexture(drawFigure(side, { color, root, width: CW, height: CH }, picture))
    map.colorSpace = THREE.SRGBColorSpace
    map.anisotropy = 8
    return map
  }
  const scene = new THREE.Scene()
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
  camera.position.z = 2
  const uniforms = {
    uA: { value: texture(before, pictures[0]) },
    uB: { value: texture(after, pictures[1]) },
    uP: { value: 0 },
    uMode: { value: mode },
    uOrigin: { value: new THREE.Vector2(origin[0], 1 - origin[1]) },
    uAspect: { value: CW / CH },
    uEdge: { value: tone(THREE, color, 'accent') },
    uFade: { value: 0 },
  }
  const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, transparent: true })
  // The card is 72% of the frame's height, a little below the middle to leave room for the chip.
  const PH = 1.44
  const card = new THREE.Mesh(new THREE.PlaneGeometry(PH * (CW / CH), PH), material)
  card.position.y = -0.1
  scene.add(card)

  const layer = overlay(root, `
    .ba-chip { position: absolute; left: 50%; top: 5.5cqh; transform: translateX(-50%); }
    .ba-chip span { position: absolute; left: 50%; top: 0; transform: translateX(-50%); font-size: ${TYPE.lead}cqw; font-weight: 600; white-space: nowrap; }
    .ba-chip .ba-after { color: var(--pm-color-accent); }
  `, `<div class="ba-chip"><span class="ba-before">${before.name ?? '之前'}</span><span class="ba-after">${after.name ?? '之后'}</span></div>`)
  const nameA = layer.querySelector<HTMLElement>('.ba-before')!
  const nameB = layer.querySelector<HTMLElement>('.ba-after')!
  const show = (el: HTMLElement, v: number) => {
    el.style.opacity = v.toFixed(3)
    el.style.marginTop = `${(1 - v) * 2}cqh`
  }

  const resize = (w: number, h: number) => {
    const aspect = w / h
    camera.left = -aspect; camera.right = aspect; camera.top = 1; camera.bottom = -1
    camera.updateProjectionMatrix()
  }
  resize(width, height)
  return {
    render(ms) {
      const enter = ease.outExpo(phase(ms, 0, 400))
      card.position.y = -0.1 - 0.06 * (1 - enter)
      card.scale.setScalar(0.97 + 0.03 * enter)
      uniforms.uFade.value = enter
      const t = ms - at(1)
      uniforms.uP.value = ease.inOut3(phase(t, 100, 1000))
      show(nameA, Math.min(ease.outExpo(phase(ms, 150, 400)), 1 - ease.in2(phase(t, 0, 200))))
      show(nameB, ease.outExpo(phase(t, 850, 350)))
      // A hold that lives: the card breathes by 0.6% through the long rest.
      const rest = phase(ms, at(2), 2400)
      card.scale.multiplyScalar(1 + 0.006 * Math.sin(rest * Math.PI))
      renderer.render(scene, camera)
    },
    resize,
    dispose() {
      disposeAll(scene)
    },
  }
})
