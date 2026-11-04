import { gsapScene } from '@lincyaw/addon-motion/scene'
import { clock, escape, frame, TYPE } from './frame.ts'
import { MARK } from './brand.ts'

// The opening of every film, one state: the brand card of 翰林院传达室 (Hanlin Dispatch) and the paper of the day,
// which slides out of the courier's scroll into its place. It matches the fixed opening line of the narration,
// "三分钟读完一篇论文。大家好，这里是翰林院传达室，今天给大家带来{单位}的{论文}。": the series line, the name, then
// the paper. Parameters: institution, title, titleZh, authors, venue.

export default gsapScene(({ root, gsap, at, durations, parameters }) => {
  const { T } = clock(at, durations)
  const p = (k: string) => escape(String(parameters[k] ?? ''))

  frame(root, `
    .badge { position: absolute; left: 9cqw; top: 22cqh; width: 22cqw; height: 22cqw; border-radius: 4cqw; overflow: hidden;
      background: #f7f5f0; box-shadow: 0 0 0 0.15cqw var(--c-line-strong); }
    .badge svg { width: 100%; height: 100%; display: block; }
    .series { position: absolute; left: 36cqw; top: 23cqh; font-size: ${TYPE.lead}cqw; font-weight: 650; color: var(--c-accent); white-space: nowrap; }
    .name { position: absolute; left: 36cqw; top: 31cqh; font-size: 6.2cqw; font-weight: 800; letter-spacing: 0.04em; white-space: nowrap; line-height: 1.1; }
    .en { position: absolute; left: 36.3cqw; top: 46cqh; font-size: ${TYPE.body}cqw; color: var(--pm-color-muted); white-space: nowrap;
      font-family: var(--pm-font-mono); letter-spacing: 0.08em; }
    .rule { position: absolute; left: 9cqw; top: 66cqh; width: 82cqw; height: 0.15cqw; background: var(--c-line-strong); transform-origin: 0 50%; }
    .today { position: absolute; left: 9cqw; top: 71cqh; font-size: ${TYPE.body}cqw; color: var(--pm-color-muted); white-space: nowrap; }
    .paper { position: absolute; left: 20cqw; top: 70cqh; width: 71cqw; display: flex; flex-direction: column; gap: 0.6cqh; }
    .paper__inst { align-self: flex-start; font-size: ${TYPE.small}cqw; font-weight: 700; padding: 0.25cqw 1cqw; border-radius: 99cqw;
      color: var(--c-accent); background: var(--c-accent-soft); }
    .paper__t { font-size: ${TYPE.title}cqw; font-weight: 800; line-height: 1.12; white-space: nowrap; }
    .paper__t span { color: var(--pm-color-muted); font-weight: 650; font-size: ${TYPE.lead}cqw; margin-left: 1.2cqw; }
    .paper__a { font-size: ${TYPE.small}cqw; color: var(--pm-color-muted); white-space: nowrap; }
  `, `
    <div class="badge">${MARK}</div>
    <div class="series">三分钟读完一篇论文</div>
    <div class="name">翰林院传达室</div>
    <div class="en">HANLIN DISPATCH · PAPERS, DELIVERED</div>
    <div class="rule"></div>
    <div class="today">今天</div>
    <div class="paper">
      <span class="paper__inst">${p('institution')}</span>
      <div class="paper__t">${p('title')}<span>${p('titleZh')}</span></div>
      <div class="paper__a">${p('authors')} · ${p('venue')}</div>
    </div>
  `)

  const tl = gsap.timeline()
  gsap.set(['.badge', '.series', '.name', '.en', '.rule', '.today', '.paper'], { autoAlpha: 0 })
  // 三分钟读完一篇论文: the courier arrives, the series line rises beside it.
  tl.fromTo('.badge', { autoAlpha: 0, scale: 0.82, y: 18, transformOrigin: '50% 100%' },
    { autoAlpha: 1, scale: 1, y: 0, duration: 0.6, ease: 'back.out(1.7)', immediateRender: false }, T(0, 0))
  tl.fromTo('.series', { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: 'expo.out', immediateRender: false }, T(0, 0.04))
  // 这里是翰林院传达室: the name.
  tl.fromTo('.name', { autoAlpha: 0, y: 20 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'expo.out', immediateRender: false }, T(0, 0.26))
  tl.to('.en', { autoAlpha: 1, duration: 0.4 }, T(0, 0.34))
  // 今天给大家带来……: the paper is delivered from the scroll to its place under the rule.
  tl.fromTo('.rule', { autoAlpha: 1, scaleX: 0 }, { autoAlpha: 1, scaleX: 1, duration: 0.5, ease: 'power2.inOut', immediateRender: false }, T(0, 0.5))
  tl.to('.today', { autoAlpha: 1, duration: 0.3 }, T(0, 0.55))
  tl.fromTo('.paper', { autoAlpha: 0, x: -120, y: -90, scale: 0.6, transformOrigin: '0 0' },
    { autoAlpha: 1, x: 0, y: 0, scale: 1, duration: 0.75, ease: 'power3.out', immediateRender: false }, T(0, 0.6))
  tl.set({}, {}, T(1))
  return tl
})
