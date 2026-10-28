// Three.js helpers for the fancy atoms in `fx/three/`: the theme's blending, token colours for uniforms, a studio
// environment made without files, a soft glow texture, the Presmium mark as sampled points, GLSL snippets, and a
// dispose that frees everything a scene made. The adapter exposes no RoomEnvironment, bloom or SVGLoader, so these
// are the core fallbacks; the scene is rebuilt when the theme changes, so every theme choice is made here at build.
import type * as ThreeModule from 'three'
import { markSvg } from './frame.ts'
import { mulberry32 } from './fx/random.ts'
import { sampleFill } from './fx/sample.ts'
import { isDark } from './fx/theme.ts'

type Three = typeof ThreeModule
type Color = (name: string) => string

/** The page's look at build: on a dark page light adds up (additive blending); on a light page it would wash out. */
export function look(THREE: Three, color: Color) {
  const dark = isDark(color('bg'))
  return { dark, blending: dark ? THREE.AdditiveBlending : THREE.NormalBlending }
}

/** A token colour in the renderer's working (linear) space, for uniforms; `mix` blends toward another token. */
export function tone(THREE: Three, color: Color, name: string, mix?: [string, number]): ThreeModule.Color {
  const c = new THREE.Color(color(name))
  return mix ? c.lerp(new THREE.Color(color(mix[0])), mix[1]) : c
}

/** The `#include` a ShaderMaterial ends with so its linear colours reach the canvas as sRGB, like the built-in materials. */
export const OUTPUT = /* glsl */ `#include <colorspace_fragment>`

export interface Panel {
  /** Where the panel hangs in the room (a 10-unit box around the origin; kept 0.4 inside the walls); it faces the centre. */
  at: [number, number, number]
  /** Width and height. */
  size: [number, number]
  /** Linear brightness; above 1 is a highlight that stays white in the reflection. */
  light: number
  /** A turn about the panel's own axis (rad): a tilted strip gives a diagonal glint. */
  roll?: number
}

/**
 * A studio environment for reflections (three K9): a dim box room with bright panels, prefiltered once with
 * PMREMGenerator. Animate highlights by turning `scene.environmentRotation`, never by baking again per frame.
 * Returns the render target; set `scene.environment = target.texture` and dispose the target with the scene.
 */
export function studio(THREE: Three, renderer: ThreeModule.WebGLRenderer, panels: Panel[], wall = 0.08, blur = 0.02) {
  const room = new THREE.Scene()
  const box = new THREE.BoxGeometry(10, 10, 10)
  const walls = new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(wall), side: THREE.BackSide })
  room.add(new THREE.Mesh(box, walls))
  const plane = new THREE.PlaneGeometry(1, 1)
  const made: { dispose(): void }[] = [box, walls, plane]
  for (const panel of panels) {
    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color().setScalar(panel.light), side: THREE.DoubleSide })
    const mesh = new THREE.Mesh(plane, material)
    mesh.scale.set(panel.size[0], panel.size[1], 1)
    // Kept inside the walls: a panel on a wall would fight it for depth and vanish from the reflection.
    mesh.position.set(...panel.at)
    const reach = Math.max(...panel.at.map(Math.abs))
    if (reach > 4.6) mesh.position.multiplyScalar(4.6 / reach)
    mesh.lookAt(0, 0, 0)
    mesh.rotateZ(panel.roll ?? 0)
    room.add(mesh)
    made.push(material)
  }
  const pmrem = new THREE.PMREMGenerator(renderer)
  const target = pmrem.fromScene(room, blur)
  for (const item of made) item.dispose()
  pmrem.dispose()
  return target
}

/** A white radial falloff on a small canvas: tint it with a material colour for halos (three K6, no post-processing). */
export function glowTexture(THREE: Three, size = 128) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const g = canvas.getContext('2d')!
  const r = size / 2
  const gradient = g.createRadialGradient(r, r, 0, r, r, r)
  // A Gaussian-like falloff in five stops: a bright core that fades with no visible edge.
  for (const [at, alpha] of [[0, 1], [0.2, 0.62], [0.45, 0.22], [0.7, 0.06], [1, 0]] as const) gradient.addColorStop(at, `rgba(255, 255, 255, ${alpha})`)
  g.fillStyle = gradient
  g.fillRect(0, 0, size, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.NoColorSpace
  return texture
}

/** Pixels per world unit at distance 1 from a perspective camera: `gl_PointSize = size * scale / -view.z`. */
export function pointScale(THREE: Three, renderer: ThreeModule.WebGLRenderer, camera: ThreeModule.PerspectiveCamera) {
  const h = renderer.getDrawingBufferSize(new THREE.Vector2()).y
  return h / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))
}

/** Draws the Presmium mark as `markSvg` does (page and fold stroked 7 wide, the play triangle filled) on a canvas `size` wide. */
export function drawMark(g: CanvasRenderingContext2D, size: number) {
  const paths = [...markSvg().matchAll(/<path [^>]*d="([^"]+)"[^>]*>/g)].map(m => ({ d: m[1]!, filled: /fill="currentColor"/.test(m[0]) }))
  g.save()
  g.scale(size / 120, size / 120)
  g.lineWidth = 7
  g.lineJoin = 'round'
  for (const { d, filled } of paths) {
    if (filled) g.fill(new Path2D(d))
    else g.stroke(new Path2D(d))
  }
  g.restore()
}

/**
 * `n` points filling the mark, centred on the origin with the mark `height` tall and y up, sampled on a fixed
 * 512-pixel canvas from the mark's own path data (three K4), so they do not depend on the screen or on a font.
 * `unit` is world units per unit of the mark's 120 viewBox and `centre` the viewBox point at the origin, to place
 * a crisp copy (`markTexture`) on the points; `width` is the mark's width.
 */
export function markPoints(n: number, height: number, seed = 7) {
  const size = 512
  const pixels = sampleFill(g => drawMark(g, size), size, 1)
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const [x, y] of pixels) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y)
  }
  const k = height / (y1 - y0 + 1), cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2
  const rng = mulberry32(seed)
  const points = Array.from({ length: n }, () => {
    const [px, py] = pixels[Math.floor(rng() * pixels.length)]!
    const x = px + rng(), y = py + rng()
    return { x: (x - cx) * k, y: (cy - y) * k }
  })
  return { points, width: (x1 - x0 + 1) * k, height, unit: (k * size) / 120, centre: [(cx * 120) / size, (cy * 120) / size] as const }
}

/** The mark as an alpha mask on a `size` canvas (the 120 viewBox): a crisp copy to cross-fade to. */
export function markTexture(THREE: Three, size = 1024) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  drawMark(canvas.getContext('2d')!, size)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.NoColorSpace
  texture.anisotropy = 4
  return texture
}

/** Everything a scene graph holds on the GPU: geometries, materials and their textures (maps and uniforms). */
export function disposeAll(root: ThreeModule.Object3D) {
  root.traverse(object => {
    const o = object as ThreeModule.Object3D & { geometry?: { dispose(): void }, material?: ThreeModule.Material | ThreeModule.Material[], dispose?: () => void }
    o.geometry?.dispose()
    for (const material of [o.material ?? []].flat()) {
      for (const value of Object.values(material)) if ((value as { isTexture?: boolean } | null)?.isTexture) (value as ThreeModule.Texture).dispose()
      const uniforms = (material as ThreeModule.ShaderMaterial).uniforms ?? {}
      for (const u of Object.values(uniforms)) if ((u.value as { isTexture?: boolean } | null)?.isTexture) (u.value as ThreeModule.Texture).dispose()
      material.dispose()
    }
    if (o !== root && (o as { isInstancedMesh?: boolean }).isInstancedMesh) o.dispose?.()
  })
}

/** GLSL clamp and eases, the same as the JS ones, so a shader and the CPU agree on when a thing moves. */
export const GLSL_TIME = /* glsl */ `
  float clamp01(float t) { return clamp(t, 0.0, 1.0); }
  float easeOutCubic(float t) { float u = 1.0 - t; return 1.0 - u * u * u; }
  float easeInOutCubic(float t) { return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) / 2.0; }
`

/** 3D simplex noise in [-1, 1] (Ashima Arts / Stefan Gustavson, MIT): smooth and seedless, for GPU-only patterns. */
export const GLSL_SIMPLEX = /* glsl */ `
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + C.yyy;
    vec3 x3 = x0 - D.yyy;
    i = mod289(i);
    vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 0.142857142857;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }
`
