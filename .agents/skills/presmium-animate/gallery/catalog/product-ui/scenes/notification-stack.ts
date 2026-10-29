import { gsapScene } from '@lincyaw/addon-motion/scene'
import { esc, frame, list, num, shadow } from './lib/ui.ts'

// Notification stack: generic notification cards land one after another, newest on top, then one is brought
// forward. One state per card (`n1`…, 0.9 s each by default), then `focus`. Each arrival: 0–0.45 s the card
// drops in from above its slot, opacity first, and settles with a 2% overshoot (an interface part: small);
// 0.04 s later the cards already there are pushed down one slot on power3.out, the reaction to the impact, and
// each step deeper shrinks them by 2% and dims them a little (depth from one value). `focus` (1.8 s): 0–0.5 s
// the chosen card grows 3% and takes an accent edge while the others recede, so the eye ends on one message;
// the rest is a hold with a slow 1% breath. Each card: a letter tile for the app (no real app's icon), app name
// and time, a title and one line of body. Adapted from HyperFrames notification-stack (with
// notification-cascade, notification-pileup, native-notification-pop, macos-notification).
interface Note { app: string, title: string, body?: string, time?: string }

const CARD = 15.5, GAP = 2.4   // cqh

export default gsapScene(({ root, gsap, at, durations, parameters }) => {
  const notes = list<Note>(parameters, 'items', [
    { app: '课程平台', title: '第 3 讲作业今晚截止', body: '23:59 前提交到课程空间', time: '现在' },
    { app: '讨论区', title: '你的提问有 2 条新回复', body: '“学习率为什么不能太大？”', time: '2 分钟前' },
    { app: '日程', title: '14:00 机器学习答疑', body: '教学楼 A204', time: '10 分钟前' },
    { app: 'Presmium', title: '讲授视频已导出', body: 'lecture.mp4 · 6 分 12 秒', time: '刚刚' },
  ]).slice(0, Math.max(1, durations.length - 1))
  const focus = Math.min(notes.length - 1, num(parameters, 'focus', notes.length - 1))
  const TOP = (100 - notes.length * (CARD + GAP) + GAP) / 2   // the full stack is centred
  const f = frame(root, `
    .ns { position: absolute; left: 28cqw; width: 44cqw; top: ${TOP}cqh; height: ${CARD}cqh; display: flex; align-items: center; gap: 1.6cqw; padding: 0 1.8cqw;
      border-radius: 1.6cqw; background: var(--pm-color-surface); border: 0.15cqw solid var(--pm-color-line); box-shadow: ${shadow(1.4)}; transform-origin: 50% 0; }
    .ns__icon { width: 4.4cqw; height: 4.4cqw; flex: none; display: grid; place-items: center; border-radius: 1.1cqw; background: var(--pm-color-accent-soft); color: var(--pm-color-accent); font-size: 2.2cqw; font-weight: 700; }
    .ns__text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.5cqh; }
    .ns__meta { display: flex; justify-content: space-between; font-size: 1.35cqw; color: var(--pm-color-muted); }
    .ns__title { font-size: 1.9cqw; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ns__body { font-size: 1.55cqw; color: var(--pm-color-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ns__edge { position: absolute; inset: -0.15cqw; border-radius: inherit; border: 0.3cqw solid var(--pm-color-accent); opacity: 0; }
  `, notes.map((n, i) => `<div class="ns" data-i="${i}"><span class="ns__icon">${esc([...n.app][0] ?? '')}</span><div class="ns__text">
      <div class="ns__meta"><span>${esc(n.app)}</span><span>${esc(n.time ?? '')}</span></div>
      <div class="ns__title">${esc(n.title)}</div>${n.body ? `<div class="ns__body">${esc(n.body)}</div>` : ''}</div><i class="ns__edge"></i></div>`).join(''))
  const s = (k: number) => at(k) / 1000
  const tl = gsap.timeline()
  const cards = [...f.querySelectorAll<HTMLElement>('.ns')]
  const slot = (f.clientHeight || 360) * (CARD + GAP) / 100
  cards.forEach(c => gsap.set(c, { autoAlpha: 0, y: -0.5 * slot, scale: 1 }))
  cards.forEach((card, i) => {
    const t = s(i)
    tl.to(card, { autoAlpha: 1, duration: 0.2, ease: 'power1.out' }, t)
    tl.to(card, { y: 0, duration: 0.45, ease: 'back.out(1.2)' }, t)
    // the cards already there are pushed down one slot, deeper ones shrink and dim a little
    for (let j = 0; j < i; j++) {
      const depth = i - j
      tl.to(cards[j]!, { y: depth * slot, scale: 1 - 0.02 * depth, opacity: 1 - 0.08 * depth, duration: 0.45, ease: 'power3.out' }, t + 0.04)
    }
  })
  // focus: one card forward, the others recede
  const tf = s(notes.length)
  cards.forEach((card, i) => {
    const depth = notes.length - 1 - i
    if (i === focus) {
      tl.to(card, { scale: 1.03, opacity: 1, duration: 0.5, ease: 'back.out(1.6)' }, tf)
      tl.to(card.querySelector('.ns__edge'), { opacity: 1, duration: 0.3 }, tf + 0.1)
      tl.to(card, { scale: 1.04, duration: Math.max(0.3, (durations[notes.length] ?? 1800) / 1000 - 0.5), ease: 'sine.inOut' }, tf + 0.5)
    } else {
      tl.to(card, { opacity: 0.4, scale: 1 - 0.02 * depth - 0.01, duration: 0.4, ease: 'power2.out' }, tf)
    }
  })
  return tl
})
