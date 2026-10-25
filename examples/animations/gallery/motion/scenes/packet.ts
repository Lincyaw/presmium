import { motionScene } from '@lincyaw/addon-motion/scene'
import type { MotionSequence } from '@lincyaw/addon-motion/scene'

// Keyframes with `times`: one segment holds the whole round trip of a request, there (0–0.4), waiting at the
// server (0.4–0.6) and back (0.6–1), with one easing per leg (`ease` is an array, one per interval).
// Then the TCP handshake: three packets, each its own element, placed with absolute `at` inside the step.
export default motionScene(({ root, motion, at, color }) => {
  root.innerHTML = `<div class="cq">
    <style>
      .cq { container-type: size; width: 100%; height: 100%; }
      .net { width: 100%; height: 100%; display: grid; grid-template-columns: 20cqw 1fr 20cqw; grid-template-rows: 1fr 1fr; align-items: center; padding: 6cqh 4cqw; box-sizing: border-box; font-family: var(--pm-font-sans); color: var(--pm-color-ink); row-gap: 4cqh; }
      .net__host { grid-row: 1 / 3; height: 100%; border-radius: 2cqh; border: 0.4cqh solid var(--pm-color-line-strong); background: var(--pm-color-surface); display: grid; place-items: center; font-size: 6.5cqh; }
      .net__lane { position: relative; height: 100%; margin: 0 1cqw; border-bottom: 0.3cqh dashed var(--pm-color-line); }
      .net__slider { position: absolute; inset: 0 24cqh 0 0; }
      .net__mover { width: 100%; height: 100%; display: flex; align-items: center; }
      .net__pkt { height: 12cqh; width: 24cqh; box-sizing: border-box; border-radius: 1.5cqh; display: grid; place-items: center; font-family: var(--pm-font-mono); font-size: 5cqh; background: ${color('accent')}; color: var(--pm-color-on-accent); white-space: nowrap; opacity: 0; }
      .net__note { position: absolute; left: 0; right: 0; top: 0; text-align: center; font-size: 5.5cqh; color: var(--pm-color-muted); }
    </style>
    <div class="net">
      <div class="net__host">客户端</div>
      <div class="net__lane"><span class="net__note" data-note>一次请求的往返时间 RTT</span><div class="net__slider"><div class="net__mover" data-m="req"><div class="net__pkt" data-p="req">GET</div></div></div></div>
      <div class="net__host" style="grid-column: 3">服务器</div>
      <div class="net__lane" style="grid-column: 2; grid-row: 2"><span class="net__note">三次握手</span><div class="net__slider">
        <div class="net__mover" data-m="syn" style="position: absolute; inset: 0"><div class="net__pkt" data-p="syn">SYN</div></div>
        <div class="net__mover" data-m="synack" style="position: absolute; inset: 0"><div class="net__pkt" data-p="synack">SYN-ACK</div></div>
        <div class="net__mover" data-m="ack" style="position: absolute; inset: 0"><div class="net__pkt" data-p="ack">ACK</div></div>
      </div></div>
    </div></div>`
  const m = (k: string) => root.querySelector<HTMLElement>(`[data-m="${k}"]`)!
  const p = (k: string) => root.querySelector<HTMLElement>(`[data-p="${k}"]`)!
  const s = (k: number) => at(k) / 1000
  const leg = 0.55
  const seq: MotionSequence = [
    // Step 0: the request goes, waits at the server, and comes back.
    [p('req'), { opacity: [0, 1, 1, 0] }, { at: s(0), duration: 2, times: [0, 0.05, 0.95, 1] }],
    [m('req'), { x: ['0%', '100%', '100%', '0%'] }, { at: s(0), duration: 2, times: [0, 0.4, 0.6, 1], ease: ['easeIn', 'linear', 'easeOut'] }],
    [p('req'), { backgroundColor: [color('accent'), color('accent'), color('ok'), color('ok')] }, { at: s(0), duration: 2, times: [0, 0.45, 0.55, 1] }],
    // Step 1: SYN →, ← SYN-ACK, ACK →.
    [p('syn'), { opacity: [0, 1, 1, 0] }, { at: s(1), duration: leg, times: [0, 0.1, 0.9, 1] }],
    [m('syn'), { x: ['0%', '100%'] }, { at: s(1), duration: leg, ease: 'linear' }],
    [p('synack'), { opacity: [0, 1, 1, 0] }, { at: s(1) + leg, duration: leg, times: [0, 0.1, 0.9, 1] }],
    [m('synack'), { x: ['100%', '0%'] }, { at: s(1) + leg, duration: leg, ease: 'linear' }],
    [p('ack'), { opacity: [0, 1, 1, 1] }, { at: s(1) + 2 * leg, duration: leg, times: [0, 0.1, 0.9, 1] }],
    [m('ack'), { x: ['0%', '100%'] }, { at: s(1) + 2 * leg, duration: leg, ease: 'linear' }],
  ]
  return motion.animate(seq)
})
