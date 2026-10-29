import { gsapScene } from '@lincyaw/addon-motion/scene'
import { atoms, device, DEVICE_CSS, esc, frame, list, screen, shadow, str, type Chrome, type Variant } from './lib/ui.ts'

// Device frame: your own screenshot in neutral device chrome (browser, window, phone or tablet). Three states.
// `rise` (1.2 s): 0–0.6 s the device rises 6% of the frame and grows from 96% on expo.out, opacity first, so it
// lands rather than fades; 0.15–0.65 s the screen wakes from dim to lit; 0.6–1.1 s one band of light sweeps the
// glass once, the moment it becomes a material, then never again. `look` (1.8 s): the hold lives, a 1% breath
// of scale and a slow rise, so the frame does not look frozen while the caption is read. `swap` (2 s): 0–0.6 s
// the second screen is uncovered from top to bottom behind an accent edge (a mask, not a cross-fade: never two
// screens half visible), its caption replaces the first; the rest is a hold. The screen is the author's image
// (`image`, `image2`) or, without one, a generic app drawn from tokens. The viewer waits for the images to
// decode before the first frame. Adapted from HyperFrames browser-device-stage (with device-frame-stage).
const BOX: Record<Chrome, string> = {
  browser: 'left: 15cqw; top: 7cqh; width: 70cqw; height: 74cqh;',
  window: 'left: 15cqw; top: 7cqh; width: 70cqw; height: 74cqh;',
  tablet: 'left: 25cqw; top: 6cqh; width: 50cqw; height: 76cqh;',
  phone: 'left: 39cqw; top: 4cqh; width: 22cqw; height: 80cqh;',
}

export default gsapScene(({ root, gsap, at, parameters }) => {
  const kind = str(parameters, 'device', 'browser') as Chrome
  const title = str(parameters, 'title', 'course.example.edu/lesson-3')
  const image = parameters.image as string | undefined
  const image2 = parameters.image2 as string | undefined
  const [v1, v2] = list<Variant>(parameters, 'variants', kind === 'phone' ? ['list', 'chart'] : ['doc', 'slides'])
  const caption = str(parameters, 'caption', '同一份文稿是网页')
  const caption2 = str(parameters, 'caption2', '也是幻灯片')
  const f = frame(root, `
    ${DEVICE_CSS}
    .df { position: absolute; ${BOX[kind] ?? BOX.browser} border-radius: 1.4cqw; box-shadow: ${shadow(2.4)}; }
    .df__b { position: absolute; inset: 0; }
    .df__b2 { clip-path: inset(0 0 100% 0); }
    .df__edge { position: absolute; left: 0; right: 0; top: 0; height: 0.35cqh; background: var(--pm-color-accent); opacity: 0; }
    .df__dim { position: absolute; inset: 0; background: var(--pm-color-ink); opacity: 0.35; pointer-events: none; }
    .df__sheen { position: absolute; inset: -20% -40%; background: linear-gradient(105deg, transparent 40%, var(--pm-color-sheen) 50%, transparent 60%); opacity: 0; pointer-events: none; }
    .df__cap { position: absolute; left: 0; right: 0; top: 87cqh; text-align: center; }
    .df__cap > span { position: absolute; left: 0; right: 0; }
  `, `
    <div class="df">${device(kind, `<div class="df__b">${screen(image, v1)}</div><div class="df__b df__b2">${screen(image2, v2)}</div><i class="df__edge"></i><i class="df__dim"></i><i class="df__sheen"></i>`, title)}</div>
    <div class="lf-lead df__cap"><span class="df__c1">${esc(caption)}</span><span class="df__c2">${esc(caption2)}</span></div>`)
  const s = (k: number) => at(k) / 1000
  const tl = gsap.timeline()
  const a = atoms(gsap, tl)
  const dev = f.querySelector('.df')!
  const screenEl = f.querySelector('.ui-screen')!
  const h = screenEl.getBoundingClientRect().height || 1
  // rise
  gsap.set(dev, { autoAlpha: 0, yPercent: 8, scale: 0.96 })
  tl.to(dev, { autoAlpha: 1, duration: 0.25, ease: 'power1.out' }, 0)
  tl.to(dev, { yPercent: 0, duration: 0.6, ease: 'expo.out' }, 0)
  tl.to(dev, { scale: 1, duration: 0.6, ease: 'expo.out' }, 0.05)
  tl.to('.df__dim', { opacity: 0, duration: 0.5, ease: 'power2.out' }, 0.15)
  gsap.set('.df__sheen', { xPercent: -60 })
  tl.to('.df__sheen', { keyframes: [{ opacity: 0.9, duration: 0.15 }, { opacity: 0.9, duration: 0.2 }, { opacity: 0, duration: 0.15 }], ease: 'none' }, 0.6)
  tl.to('.df__sheen', { xPercent: 60, duration: 0.5, ease: 'power2.inOut' }, 0.6)
  a.enter('.df__c1', 0.7)
  // look: a breath while the caption is read
  tl.to(dev, { scale: 1.01, y: -0.004 * h, duration: Math.max(0.3, s(2) - s(1)), ease: 'sine.inOut' }, s(1))
  // swap: the second screen is uncovered behind an accent edge, then the caption is replaced
  gsap.set('.df__c2', { autoAlpha: 0 })
  tl.to('.df__b2', { clipPath: 'inset(0 0 0% 0)', duration: 0.6, ease: 'power3.inOut' }, s(2))
  tl.set('.df__edge', { opacity: 1 }, s(2))
  tl.fromTo('.df__edge', { top: '0%' }, { top: '100%', duration: 0.6, ease: 'power3.inOut', immediateRender: false }, s(2))
  tl.to('.df__edge', { opacity: 0, duration: 0.15 }, s(2) + 0.6)
  a.replace('.df__c1', '.df__c2', s(2) + 0.35)
  tl.to(dev, { scale: 1, y: 0, duration: 1.4, ease: 'sine.inOut' }, s(2) + 0.6)
  return tl
})
