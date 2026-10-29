import { gsapScene } from '@lincyaw/addon-motion/scene'
import { atoms, device, DEVICE_CSS, DUR, esc, frame, list, num, pick, POINTER, POINTER_CSS, screen, shadow, str, type Variant } from './lib/ui.ts'

// Cursor zoom: the auto-zoom of a screen recording, on your own screenshot. States `overview`, one per click
// (`click-1`…), `out`. `overview` (1.2 s): the browser is shown whole, the pointer enters. Each click state:
// 0–0.6 s the camera pushes in toward the next click (both ends eased) while the pointer travels there, arriving
// 0.1 s after the camera settles, so the eye is led and then the hand follows; 0.75 s the press: the pointer
// dips and a ring spreads from its tip; 0.9 s the step's label replaces the previous one under the picture (the
// effect after the cause); the rest is a hold to read it. `out` (1.5 s): the camera eases back to the whole
// screen and the pointer steps aside, the last label stays. The pointer lives inside the camera, part of the
// recording, so it grows with the zoom. The camera never shows past the browser's edges. Click points are % of
// the screen (below the address bar). Adapted from HyperFrames cursor-zoom-follow (with ui-focus-zoom).
const L = 10, T = 5, W = 80, H = 80, BAR = 4.6   // the browser in % of the frame

interface Click { x: number, y: number, label?: string }

export default gsapScene(({ root, gsap, at, durations, parameters }) => {
  const image = parameters.image as string | undefined
  const variant = str(parameters, 'variant', 'dashboard') as Variant
  const zoom = num(parameters, 'zoom', 1.8)
  const clicks = list<Click>(parameters, 'clicks', [
    { x: 10, y: 7, label: '① 打开“本周数据”' },
    { x: 30, y: 30, label: '② 选中一项指标' },
    { x: 79, y: 70, label: '③ 看到它的走势' },
  ]).slice(0, Math.max(0, durations.length - 2))
  const f = frame(root, `
    ${DEVICE_CSS}
    ${POINTER_CSS}
    .cz__cam { position: absolute; inset: 0; transform-origin: 0 0; }
    .cz__win { position: absolute; left: ${L}cqw; top: ${T}cqh; width: ${W}cqw; height: ${H}cqh; border-radius: 1.2cqw; box-shadow: ${shadow(1.6)}; }
    .cz__cap { position: absolute; left: 0; right: 0; top: 89cqh; height: 8cqh; }
    .cz__cap > span { position: absolute; left: 0; right: 0; margin: 0 auto; width: fit-content; }
  `, `
    <div class="cz__cam">
      <div class="cz__win">${device('browser', screen(image, variant), str(parameters, 'title', 'app.example.com/report'))}</div>
      <div class="lf-pointer-layer">${POINTER}</div>
    </div>
    <div class="cz__cap">${clicks.map((c, i) => `<span class="lf-chip cz__label" data-i="${i}">${esc(c.label ?? '')}</span>`).join('')}</div>`)
  const s = (k: number) => at(k) / 1000
  const tl = gsap.timeline()
  const a = atoms(gsap, tl)
  const cam = pick(f, '.cz__cam'), layer = pick(f, '.lf-pointer-layer')
  const labels = [...f.querySelectorAll<HTMLElement>('.cz__label')]
  const fx = (x: number) => L + (x * W) / 100
  const fy = (y: number) => T + BAR + (y * (H - BAR)) / 100
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
  // The camera that centres (px, py) of the frame at scale z, kept inside the browser.
  const view = (px: number, py: number, z: number) => ({
    scale: z,
    xPercent: clamp(50 - z * px, 100 - z * (L + W), -z * L),
    yPercent: clamp(50 - z * py, 100 - z * (T + H), -z * T),
  })
  gsap.set(cam, { scale: 1, xPercent: 0, yPercent: 0 })
  // overview: the window settles, the pointer enters from the lower right
  a.enter('.cz__win', 0, { from: 'fade', duration: 0.4 })
  gsap.set(layer, { xPercent: 92, yPercent: 96, autoAlpha: 0 })
  tl.to(layer, { autoAlpha: 1, duration: 0.2 }, 0.4)
  a.point(layer, 0.4, 70, 60)
  labels.forEach(l => gsap.set(l, { autoAlpha: 0 }))
  clicks.forEach((c, i) => {
    const t = s(i + 1), px = fx(c.x), py = fy(c.y)
    tl.to(cam, { ...view(px, py, zoom), duration: DUR.move, ease: 'power3.inOut' }, t)
    a.point(layer, t + 0.1, px, py, { duration: DUR.move })
    a.click('.lf-pointer', '.lf-pointer__ring', undefined, t + 0.75)
    if (i > 0) a.exit(labels[i - 1]!, t + 0.9)
    a.enter(labels[i]!, t + 0.9 + (i > 0 ? 0.15 : 0))
  })
  // out: back to the whole screen, the pointer steps aside
  const out = s(clicks.length + 1)
  tl.to(cam, { scale: 1, xPercent: 0, yPercent: 0, duration: 0.8, ease: 'power3.inOut' }, out)
  a.point(layer, out + 0.1, L + W - 6, T + H - 8, { duration: 0.8 })
  return tl
})
