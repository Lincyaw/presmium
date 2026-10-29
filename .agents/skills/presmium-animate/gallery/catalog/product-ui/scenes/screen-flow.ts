import { gsapScene } from '@lincyaw/addon-motion/scene'
import { atoms, device, DEVICE_CSS, esc, frame, list, screen, str, type Chrome, type Variant } from './lib/ui.ts'

// Screen flow: two to five app screens ride a horizontal rail, one at the centre and its neighbours receded, and
// the rail advances one screen per state (`s1`…). `s1`: the centre screen rises, the neighbours follow 0.1 s
// later, its label rises under it. Each later state: 0–0.6 s the whole rail moves one place left with both ends
// eased; every screen's size and brightness are one function of its distance from the centre (100% at the
// centre, 82% and dimmed one place away), so the rail reads as one object; the label is replaced as the new
// screen arrives (0.35 s); the rest is a hold to read the screen. Forward is to the left, as pages turn. Screens
// are the author's images or drawn apps; `device` is phone (default), tablet or browser. Adapted from
// HyperFrames screen-flow-carousel (with sticky-mock-swap).
interface Screen { image?: string, variant?: Variant, label?: string }
const SIZE: Record<string, { w: number, h: number, step: number }> = {
  phone: { w: 20, h: 76, step: 25 },
  tablet: { w: 40, h: 72, step: 44 },
  browser: { w: 52, h: 70, step: 56 },
}

export default gsapScene(({ root, gsap, at, durations, parameters }) => {
  const kind = (str(parameters, 'device', 'phone') as Chrome) in SIZE ? str(parameters, 'device', 'phone') as Chrome : 'phone'
  const size = SIZE[kind]!
  const screens = list<Screen>(parameters, 'screens', [
    { variant: 'list', label: '① 选一门课' },
    { variant: 'doc', label: '② 读讲义' },
    { variant: 'slides', label: '③ 看幻灯片' },
    { variant: 'chart', label: '④ 查学习进度' },
  ]).slice(0, Math.max(1, durations.length))
  const f = frame(root, `
    ${DEVICE_CSS}
    .sfw { position: absolute; left: ${50 - size.w / 2}cqw; top: 5cqh; width: ${size.w}cqw; height: ${size.h}cqh; }
    .sfw__cap { position: absolute; left: 0; right: 0; top: 86cqh; }
    .sfw__cap > span { position: absolute; left: 0; right: 0; text-align: center; }
  `, `
    ${screens.map((sc, i) => `<div class="sfw" data-i="${i}">${device(kind, screen(sc.image, sc.variant ?? 'dashboard'), str(parameters, 'title', 'app.example.com'))}</div>`).join('')}
    <div class="lf-lead sfw__cap">${screens.map(sc => `<span>${esc(sc.label ?? '')}</span>`).join('')}</div>`)
  const s = (k: number) => at(k) / 1000
  const tl = gsap.timeline()
  const a = atoms(gsap, tl)
  const cards = [...f.querySelectorAll<HTMLElement>('.sfw')], caps = [...f.querySelectorAll<HTMLElement>('.sfw__cap > span')]
  const W = f.clientWidth || 640
  // the place of screen i when screen `c` is at the centre: one function of the distance
  const place = (i: number, c: number) => {
    const d = i - c, ad = Math.min(Math.abs(d), 2)
    return { x: (d * size.step * W) / 100, scale: 1 - 0.18 * Math.min(ad, 1) - 0.08 * Math.max(0, ad - 1), opacity: ad === 0 ? 1 : ad <= 1 ? 0.45 : 0, zIndex: 10 - Math.round(ad * 2) }
  }
  // s1: centre first, then the neighbours
  cards.forEach((card, i) => {
    const p = place(i, 0)
    gsap.set(card, { x: p.x, scale: p.scale * 0.96, zIndex: p.zIndex, autoAlpha: 0, yPercent: 5 })
    tl.to(card, { autoAlpha: p.opacity, scale: p.scale, yPercent: 0, duration: 0.5, ease: 'expo.out' }, i === 0 ? 0 : 0.1)
  })
  caps.forEach(c => gsap.set(c, { autoAlpha: 0 }))
  a.enter(caps[0]!, 0.35)
  // each later state: the rail moves one place; the label is replaced as the screen arrives
  for (let k = 1; k < screens.length; k++) {
    const t = s(k)
    cards.forEach((card, i) => {
      const p = place(i, k)
      tl.set(card, { zIndex: p.zIndex }, t + 0.3)
      tl.to(card, { x: p.x, scale: p.scale, autoAlpha: p.opacity, duration: 0.6, ease: 'power3.inOut' }, t)
    })
    a.exit(caps[k - 1]!, t + 0.1)
    a.enter(caps[k]!, t + 0.35)
  }
  return tl
})
