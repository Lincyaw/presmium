import { gsapScene } from '@lincyaw/addon-motion/scene'
import { atoms, device, DEVICE_CSS, esc, frame, screen, shadow, str, type Variant } from './lib/ui.ts'

// Device splay: the same product on a desktop, a tablet and a phone, which start as one stack and fan out.
// States `stack`, `splay`, `hold`. `stack` (1 s): the three rise together as one stack at the centre, the desktop
// behind; one object first. `splay` (1 s): 0–0.65 s the tablet slides left and the phone right from behind the
// desktop's edges, each turning 3° outward and overshooting 2% before it settles (both are interface objects:
// small overshoot), the phone 60 ms after the tablet so the two moves overlap rather than mirror; then the
// caption rises. `hold` (2.5 s): each device bobs 0.8% on its own phase, a hold that lives. Each screen is the
// author's image (`desktop`, `tablet`, `phone`) or a drawn app. Adapted from HyperFrames multi-device-splay
// (with app-showcase, minus its 3D brand phones).

export default gsapScene(({ root, gsap, at, durations, parameters }) => {
  const img = (k: string) => parameters[k] as string | undefined
  const caption = str(parameters, 'caption', '一份文稿，处处可读')
  const f = frame(root, `
    ${DEVICE_CSS}
    .dv { position: absolute; border-radius: 1.4cqw; box-shadow: ${shadow(2)}; }
    .dv--desk { left: 22cqw; top: 8cqh; width: 56cqw; height: 66cqh; }
    .dv--tab { left: 36cqw; top: 24cqh; width: 26cqw; height: 58cqh; border-radius: 2.2cqw; }
    .dv--ph { left: 44cqw; top: 30cqh; width: 12cqw; height: 54cqh; border-radius: 3.6cqw; }
    .dv__cap { position: absolute; left: 0; right: 0; top: 88cqh; text-align: center; }
  `, `
    <div class="dv dv--desk">${device('browser', screen(img('desktop'), str(parameters, 'desktopVariant', 'doc') as Variant), str(parameters, 'title', 'course.example.edu'))}</div>
    <div class="dv dv--tab">${device('tablet', screen(img('tablet'), str(parameters, 'tabletVariant', 'slides') as Variant))}</div>
    <div class="dv dv--ph">${device('phone', screen(img('phone'), str(parameters, 'phoneVariant', 'list') as Variant))}</div>
    <div class="lf-lead dv__cap">${esc(caption)}</div>`)
  const s = (k: number) => at(k) / 1000
  const W = f.clientWidth || 640
  const tl = gsap.timeline()
  const a = atoms(gsap, tl)
  // stack: one object rising
  gsap.set('.dv', { autoAlpha: 0, yPercent: 6 })
  tl.to('.dv', { autoAlpha: 1, duration: 0.25, ease: 'power1.out' }, 0)
  tl.to('.dv', { yPercent: 0, duration: 0.6, ease: 'expo.out' }, 0)
  // splay: tablet left, phone right, turned outward, small overshoot
  const t = s(1)
  tl.to('.dv--tab', { x: -0.27 * W, rotation: -3, duration: 0.65, ease: 'back.out(1.3)' }, t)
  tl.to('.dv--ph', { x: 0.3 * W, rotation: 3, duration: 0.65, ease: 'back.out(1.3)' }, t + 0.06)
  a.enter('.dv__cap', t + 0.55)
  // hold: each bobs on its own phase
  const h = s(2), len = Math.max(0.6, (durations[2] ?? 2500) / 1000)
  ;['.dv--desk', '.dv--tab', '.dv--ph'].forEach((sel, i) => {
    const amp = -0.008 * (f.clientHeight || 360)
    tl.to(sel, { keyframes: [{ y: amp, duration: len * (0.4 + 0.1 * i), ease: 'sine.inOut' }, { y: 0, duration: len * (0.6 - 0.1 * i), ease: 'sine.inOut' }] }, h)
  })
  return tl
})
