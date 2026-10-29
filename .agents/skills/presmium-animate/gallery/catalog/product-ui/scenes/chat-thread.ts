import { gsapScene } from '@lincyaw/addon-motion/scene'
import { AVATAR_CSS, avatar, device, DEVICE_CSS, esc, frame, list, str } from './lib/ui.ts'

// Chat thread: a generic two-person conversation plays out on a phone. One state per message (`m1`…). A message
// from the other side: 0–0.15 s a typing bubble pops from its corner (scale 0.75 to 1), its three dots wave
// while they "write" (about 0.6 s, longer for longer messages, never past a third of the state); then the
// bubble grows into the message: the row opens to the message's height, pushing the thread up, and the text
// bubble scales up from the sender's corner as the dots fade, so the same bubble turns into the reply. A message
// of your own side is sent at once: 0–0.3 s the row opens and the accent bubble rises from the lower right
// corner. The rest of each state is reading time; size the state to about 0.25 s per character. The thread is
// bottom-aligned, so older messages scroll off the top. Adapted from HyperFrames chat-thread (with
// thread-message-stack, message-thread-reveal, chat-message, typing-indicator).
interface Message { from: 'me' | 'them', text: string }

export default gsapScene(({ root, gsap, at, durations, parameters }) => {
  const name = str(parameters, 'name', '小林 · 机器学习')
  const messages = list<Message>(parameters, 'messages', [
    { from: 'them', text: '老师，梯度下降为什么会来回震荡？' },
    { from: 'me', text: '学习率太大，每一步都跨过了最低点。' },
    { from: 'them', text: '那把它调小就行吗？' },
    { from: 'me', text: '对，先试 0.1，再看损失曲线。' },
    { from: 'them', text: '收敛了！谢谢老师' },
  ]).slice(0, durations.length)
  const f = frame(root, `
    ${DEVICE_CSS}
    ${AVATAR_CSS}
    .ct { position: absolute; left: 34cqw; top: 3cqh; width: 32cqw; height: 94cqh; }
    .ct__app { position: absolute; inset: 0; display: flex; flex-direction: column; background: var(--pm-color-bg); }
    /* inside the phone the units are the screen's: 1cqw is 1% of the screen's width */
    .ct__head { flex: none; display: flex; align-items: center; gap: 3.4cqw; padding: 6cqh 5cqw 1.8cqh; border-bottom: 0.5cqw solid var(--pm-color-line); background: var(--pm-color-surface); font-size: 5.4cqw; font-weight: 600; }
    .ct__head .ui-avatar { width: 11cqw; height: 11cqw; font-size: 5cqw; }
    .ct__thread { flex: 1; min-height: 0; display: flex; flex-direction: column; justify-content: flex-end; padding: 0 4.7cqw 2.6cqh; overflow: hidden; }
    .ct__row { position: relative; flex: none; overflow: visible; }
    .ct__in { display: flex; padding-top: 1.6cqh; }
    .ct__row--me .ct__in { justify-content: flex-end; }
    .ct__msg { max-width: 80%; padding: 1.4cqh 4.4cqw; border-radius: 5.4cqw; font-size: 5.4cqw; line-height: 1.4; }
    .ct__row--them .ct__msg { background: var(--pm-color-surface); border: 0.5cqw solid var(--pm-color-line); border-bottom-left-radius: 1.3cqw; transform-origin: 0 100%; }
    .ct__row--me .ct__msg { background: var(--pm-color-accent); color: var(--pm-color-on-accent); border-bottom-right-radius: 1.3cqw; transform-origin: 100% 100%; }
    .ct__dots { position: absolute; left: 0; bottom: 0; display: flex; gap: 1.7cqw; padding: 2cqh 4.4cqw; border-radius: 5.4cqw; border-bottom-left-radius: 1.3cqw; background: var(--pm-color-surface); border: 0.5cqw solid var(--pm-color-line); transform-origin: 0 100%; }
    .ct__dots i { width: 2.6cqw; height: 2.6cqw; border-radius: 50%; background: var(--pm-color-muted); }
  `, `
    <div class="ct">${device('phone', `<div class="ct__app"><div class="ct__head">${avatar(name)}<span>${esc(name)}</span></div>
      <div class="ct__thread">${messages.map(m => `<div class="ct__row ct__row--${m.from === 'me' ? 'me' : 'them'}"><div class="ct__in"><div class="ct__msg">${esc(m.text)}</div></div>${m.from === 'me' ? '' : '<div class="ct__dots"><i></i><i></i><i></i></div>'}</div>`).join('')}</div></div>`)}</div>`)
  const s = (k: number) => at(k) / 1000
  const tl = gsap.timeline()
  const rows = [...f.querySelectorAll<HTMLElement>('.ct__row')]
  const heights = rows.map(r => r.offsetHeight)
  const unit = (f.clientWidth || 640) / 100
  rows.forEach((row, i) => {
    const t = s(i), len = (durations[i] ?? 1500) / 1000
    const msg = row.querySelector('.ct__msg')!, dots = row.querySelector('.ct__dots')
    gsap.set(row, { height: 0 })
    gsap.set(msg, { autoAlpha: 0, scale: 0.75 })
    if (dots) {
      // the other side types first: the dots bubble opens a short row and waves
      const typing = Math.min(len / 3, 0.35 + messages[i]!.text.length * 0.02)
      const dotRow = (dots as HTMLElement).offsetHeight + parseFloat(getComputedStyle(row.firstElementChild!).paddingTop)
      gsap.set(dots, { autoAlpha: 0, scale: 0.75 })
      tl.to(row, { height: dotRow, duration: 0.25, ease: 'power3.out' }, t)
      tl.to(dots, { autoAlpha: 1, scale: 1, duration: 0.15, ease: 'power2.out' }, t)
      const waves = Math.max(1, Math.round(typing / 0.36))
      tl.to(dots.querySelectorAll('i'), { y: -0.5 * unit, duration: 0.18, ease: 'sine.inOut', stagger: { each: 0.1, repeat: waves * 2 - 1, yoyo: true } }, t + 0.1)
      const at2 = t + 0.15 + typing
      tl.to(row, { height: heights[i], duration: 0.3, ease: 'power3.out' }, at2)
      tl.to(dots, { autoAlpha: 0, scale: 1.1, duration: 0.12, ease: 'power2.in' }, at2)
      tl.to(msg, { autoAlpha: 1, duration: 0.12 }, at2)
      tl.to(msg, { scale: 1, duration: 0.32, ease: 'back.out(1.4)' }, at2)
    } else {
      tl.to(row, { height: heights[i], duration: 0.3, ease: 'power3.out' }, t)
      tl.to(msg, { autoAlpha: 1, duration: 0.12 }, t)
      tl.to(msg, { scale: 1, duration: 0.32, ease: 'back.out(1.4)' }, t)
    }
  })
  return tl
})
