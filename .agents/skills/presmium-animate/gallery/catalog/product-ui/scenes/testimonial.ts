import { gsapScene } from '@lincyaw/addon-motion/scene'
import { atoms, AVATAR_CSS, avatar, esc, frame, list, str } from './lib/ui.ts'

// Testimonial: a quote read at reading pace, then who said it. States `quote`, `author`. `quote`: the large
// quotation mark settles first (0–0.4 s), then each line rises out of its own slot behind a mask, one at a time,
// each line given time in proportion to its length (no more than 9 Chinese characters a second, and every line
// stays still once it is up). `author` (2.5 s): 0–0.5 s a short accent rule draws, the avatar pops (6%
// overshoot, the one new thing), name and role slide in from behind it 60 ms later; the rest is a hold with a
// 1% drift of the quote. A small tag says the quote is an example until the author replaces it with a real one.
// The avatar is the author's image or the initials. Adapted from HyperFrames testimonial-proof-card (with
// testimonial-card).

export default gsapScene(({ root, gsap, at, durations, parameters }) => {
  const lines = list<string>(parameters, 'lines', ['以前备一节课要三天：', '讲义、幻灯片、视频各做一遍。', '现在改一处，三样一起更新。'])
  const name = str(parameters, 'name', '王老师')
  const role = str(parameters, 'role', '高校计算机课程讲师')
  const tag = str(parameters, 'tag', '示例评价')
  const image = parameters.avatar as string | undefined
  const f = frame(root, `
    ${AVATAR_CSS}
    .tm { position: absolute; left: 16cqw; right: 12cqw; top: 14cqh; }
    .tm__mark { position: absolute; left: -7cqw; top: -4cqh; font: 700 14cqw/1 var(--pm-font-serif); color: var(--pm-color-accent-soft); }
    .tm__line { display: block; overflow: hidden; padding-bottom: 0.6cqh; }
    .tm__line > span { display: block; font: 500 4.2cqw/1.35 var(--pm-font-serif); white-space: nowrap; }
    .tm__rule { width: 5cqw; height: 0.35cqh; margin: 5cqh 0 3cqh; background: var(--pm-color-accent); transform-origin: 0 50%; }
    .tm__who { display: flex; align-items: center; gap: 1.6cqw; }
    .tm__who .ui-avatar { width: 6cqw; height: 6cqw; font-size: 2.6cqw; }
    .tm__id { display: flex; flex-direction: column; gap: 0.6cqh; overflow: hidden; }
    .tm__name { font-size: 2.4cqw; font-weight: 600; }
    .tm__role { font-size: 1.8cqw; color: var(--pm-color-muted); }
    .tm__tag { position: absolute; right: 3cqw; bottom: 5cqh; font-size: 1.4cqw; color: var(--pm-color-muted); border: 0.15cqw solid var(--pm-color-line-strong); border-radius: 99cqw; padding: 0.3cqh 1cqw; }
  `, `
    <div class="tm"><span class="tm__mark">“</span>
      <div class="tm__quote">${lines.map(l => `<span class="tm__line"><span>${esc(l)}</span></span>`).join('')}</div>
      <div class="tm__rule"></div>
      <div class="tm__who">${avatar(name, image)}<div class="tm__id"><span class="tm__name">${esc(name)}</span><span class="tm__role">${esc(role)}</span></div></div>
    </div>${tag ? `<span class="tm__tag">${esc(tag)}</span>` : ''}`)
  const s = (k: number) => at(k) / 1000
  const tl = gsap.timeline()
  const a = atoms(gsap, tl)
  // quote: the mark, then the lines one by one, each given time by its length
  gsap.set('.tm__mark', { autoAlpha: 0, scale: 0.7, transformOrigin: '50% 60%' })
  tl.to('.tm__mark', { autoAlpha: 1, scale: 1, duration: 0.4, ease: 'expo.out' }, 0)
  const inner = [...f.querySelectorAll<HTMLElement>('.tm__line > span')]
  const weights = lines.map(l => Math.max(4, [...l].length))
  const total = weights.reduce((x, y) => x + y, 0)
  const room = Math.max(0.5, (durations[0] ?? 3000) / 1000 - 0.35 - 0.3)
  let t = 0.35
  inner.forEach((el, i) => {
    gsap.set(el, { yPercent: 105 })
    tl.to(el, { yPercent: 0, duration: 0.5, ease: 'expo.out' }, t)
    t += (weights[i]! / total) * room
  })
  if (f.querySelector('.tm__tag')) a.enter('.tm__tag', 0.6, { from: 'fade', duration: 0.3 })
  // author: rule, avatar, name and role
  const w = s(1)
  gsap.set('.tm__rule', { scaleX: 0 })
  tl.to('.tm__rule', { scaleX: 1, duration: 0.4, ease: 'power2.inOut' }, w)
  gsap.set('.tm__who .ui-avatar', { autoAlpha: 0, scale: 0.6 })
  tl.to('.tm__who .ui-avatar', { autoAlpha: 1, duration: 0.15 }, w + 0.1)
  tl.to('.tm__who .ui-avatar', { scale: 1, duration: 0.45, ease: 'back.out(1.8)' }, w + 0.1)
  gsap.set('.tm__id > *', { autoAlpha: 0, xPercent: -20 })
  tl.to('.tm__id > *', { autoAlpha: 1, xPercent: 0, duration: 0.45, ease: 'expo.out', stagger: 0.06 }, w + 0.16)
  tl.to('.tm__quote', { y: -0.004 * (f.clientHeight || 360), duration: Math.max(0.5, (durations[1] ?? 2500) / 1000 - 0.6), ease: 'sine.inOut' }, w + 0.6)
  return tl
})
