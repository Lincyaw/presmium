import { gsapScene } from '@lincyaw/addon-motion/scene'
import { clock, escape, frame, TYPE } from './frame.ts'
import { MARK } from './brand.ts'

// The ending of every film, one state, matched to the fixed closing line of the narration:
// "一句话总结：{论文做了什么}。想看哪篇论文，欢迎在评论区留言。翰林院传达室为您分享最新论文，我们下期见。"
// On screen only keywords: the summary as a short phrase, then the invitation to comment beside a speech bubble, then
// the series' mark. Parameters: summary (the phrase, at most about 24 汉字), paper (the paper's short name).

export default gsapScene(({ root, gsap, at, durations, parameters }) => {
  const { T } = clock(at, durations)
  const p = (k: string) => escape(String(parameters[k] ?? ''))

  frame(root, `
    .head { position: absolute; left: 9cqw; top: 12cqh; width: 82cqw; height: 36cqh; display: flex; flex-direction: column; justify-content: flex-end; gap: 1.6cqh; }
    .k { font-size: ${TYPE.lead}cqw; font-weight: 650; color: var(--c-accent); white-space: nowrap; }
    .sum { font-size: 4cqw; font-weight: 800; line-height: 1.25; }
    .paper { font-size: ${TYPE.body}cqw; color: var(--pm-color-muted); white-space: nowrap; }
    .rule { position: absolute; left: 9cqw; top: 50cqh; width: 82cqw; height: 0.15cqw; background: var(--c-line-strong); transform-origin: 0 50%; }
    .ask { position: absolute; left: 9cqw; top: 56cqh; display: flex; align-items: center; gap: 2cqw; }
    .ask svg { width: 7cqw; height: auto; overflow: visible; }
    .ask__t { font-size: ${TYPE.title}cqw; font-weight: 800; white-space: nowrap; }
    .ask__s { margin-top: 0.8cqh; font-size: ${TYPE.body}cqw; color: var(--pm-color-muted); white-space: nowrap; }
    .brand-end { position: absolute; right: 9cqw; top: 55cqh; display: flex; align-items: center; gap: 1.4cqw; }
    .brand-end__m { width: 10cqw; height: 10cqw; border-radius: 2cqw; overflow: hidden; box-shadow: 0 0 0 0.15cqw var(--c-line-strong); }
    .brand-end__m svg { width: 100%; height: 100%; display: block; }
    .brand-end__n { font-size: ${TYPE.lead}cqw; font-weight: 800; white-space: nowrap; }
    .brand-end__s { font-size: ${TYPE.small}cqw; color: var(--pm-color-muted); white-space: nowrap; }
  `, `
    <div class="head"><div class="k">一句话总结</div><div class="sum">${p('summary')}</div><div class="paper">${p('paper')}</div></div>
    <div class="rule"></div>
    <div class="ask">
      <svg viewBox="0 0 40 34"><path class="bubble" d="M6,2 H34 Q38,2 38,6 V22 Q38,26 34,26 H16 L8,32 L9,26 H6 Q2,26 2,22 V6 Q2,2 6,2 Z"
        fill="var(--c-accent-soft)" stroke="var(--c-accent)" stroke-width="1.6" stroke-linejoin="round"/>
        <circle class="dot" cx="12" cy="14" r="2.2" fill="var(--c-accent)"/><circle class="dot" cx="20" cy="14" r="2.2" fill="var(--c-accent)"/><circle class="dot" cx="28" cy="14" r="2.2" fill="var(--c-accent)"/></svg>
      <div><div class="ask__t">想看哪篇论文？</div><div class="ask__s">评论区告诉我们</div></div>
    </div>
    <div class="brand-end"><div class="brand-end__m">${MARK}</div><div><div class="brand-end__n">翰林院传达室</div><div class="brand-end__s">为您分享最新论文 · 下期见</div></div></div>
  `)

  const tl = gsap.timeline()
  gsap.set(['.k', '.sum', '.paper', '.rule', '.ask', '.brand-end', '.dot'], { autoAlpha: 0 })
  // 一句话总结: the label, then the summary rises.
  tl.to('.k', { autoAlpha: 1, duration: 0.35 }, T(0, 0.02))
  tl.fromTo('.sum', { autoAlpha: 0, y: 14 }, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'expo.out', immediateRender: false }, T(0, 0.06))
  tl.to('.paper', { autoAlpha: 1, duration: 0.4 }, T(0, 0.2))
  // 想看哪篇论文，欢迎在评论区留言: the bubble pops, its dots appear one by one like someone typing.
  tl.fromTo('.rule', { autoAlpha: 1, scaleX: 0 }, { autoAlpha: 1, scaleX: 1, duration: 0.5, ease: 'power2.inOut', immediateRender: false }, T(0, 0.5))
  tl.fromTo('.ask', { autoAlpha: 0, scale: 0.8, transformOrigin: '0 50%' }, { autoAlpha: 1, scale: 1, duration: 0.5, ease: 'back.out(1.8)', immediateRender: false }, T(0, 0.55))
  tl.to('.dot', { autoAlpha: 1, duration: 0.15, stagger: 0.18 }, T(0, 0.62))
  // 翰林院传达室为您分享最新论文，我们下期见: the series' mark.
  tl.fromTo('.brand-end', { autoAlpha: 0, x: 20 }, { autoAlpha: 1, x: 0, duration: 0.5, ease: 'expo.out', immediateRender: false }, T(0, 0.82))
  tl.set({}, {}, T(1))
  return tl
})
