import { gsapScene } from '@lincyaw/addon-motion/scene'
import { frame, TYPE } from '../../../lengths/scenes/kit/frame.ts'
import { esc } from './lib/text.ts'

// Lower third, with GSAP: the speaker's name and role over the shot, in the lower left (or right). Behind it a
// placeholder shot (a speaker silhouette in front of a board, in token colours) stands for the video it overlays;
// `backdrop: false` leaves the frame empty, to lay the scene over a real shot. Five looks, by `look`:
//   bar   — a card with an accent tab: the tab grows first, the card is uncovered from it, the name rises in a
//           mask, the role fades up; `tone` makes the card surface, ink or accent;
//   stack — two bars: the name bar (ink) wipes in from the left, the role bar (accent) from the right under it;
//   rule  — no card: a vertical accent rule grows, the name and role slide out from behind it;
//   sweep — no card: an accent block sweeps across and uncovers the name as it leaves; the role fades up;
//   pill  — a rounded pill pops (3% overshoot, interface scale) with a status dot, name and role in one line.
// State `in` (1 s): the cause first (tab, rule, bar or sweep), then the name 120–150 ms later, the role and
// kicker last: each part starts before the last ends, and each property has its own timing.
// State `hold` (3 s): nothing moves; the name and role (about 15 characters) are read twice.
// State `out` (0.5 s): it leaves in 0.3 s, accelerating, in the reverse order of its entrance (clip or fade).
// Adapted from HyperFrames lt-clean-bar, lt-dark-card, lt-color-block, lt-bold-block, lt-stack-bars,
// lt-side-rule, lt-kicker-name, lt-mask-reveal, lt-soft-pill and lower-third-bild.
type Look = 'bar' | 'stack' | 'rule' | 'sweep' | 'pill'

const SHOT = `<div class="lt-shot">
  <div class="lt-board"><div class="lt-board__l"></div><div class="lt-board__l lt-board__l--s"></div><div class="lt-board__l"></div></div>
  <div class="lt-person"><div class="lt-person__head"></div><div class="lt-person__body"></div></div>
</div>`

export default gsapScene(({ root, gsap, at, parameters }) => {
  const name = (parameters.name as string | undefined) ?? '陈思远'
  const role = (parameters.role as string | undefined) ?? '计算机系副教授 · 机器学习'
  const kicker = (parameters.kicker as string | undefined) ?? '主讲'
  const look = ((parameters.look as string | undefined) ?? 'bar') as Look
  const tone = (parameters.tone as string | undefined) ?? 'surface'
  const right = parameters.side === 'right'
  const backdrop = parameters.backdrop !== false
  const s = (k: number) => at(k) / 1000
  const card = tone === 'ink' ? ['var(--pm-color-ink)', 'var(--pm-color-bg)'] : tone === 'accent' ? ['var(--pm-color-accent)', 'var(--pm-color-on-accent)'] : ['var(--pm-color-surface)', 'var(--pm-color-ink)']
  frame(root, `
    .lt-shot { position: absolute; inset: 0; background: var(--pm-color-sunk); }
    .lt-board { position: absolute; left: 12%; right: 12%; top: 10%; height: 46%; border-radius: 1cqw; background: var(--pm-color-surface); border: 0.2cqw solid var(--pm-color-line); padding: 5cqh 4cqw; display: flex; flex-direction: column; gap: 3.5cqh; }
    .lt-board__l { height: 2.2cqh; width: 70%; border-radius: 1cqh; background: var(--pm-color-line); }
    .lt-board__l--s { width: 45%; background: var(--pm-color-accent-soft); }
    .lt-person { position: absolute; left: ${right ? '24%' : '58%'}; bottom: 0; width: 22%; height: 62%; }
    .lt-person__head { position: absolute; left: 30%; top: 0; width: 40%; aspect-ratio: 1; border-radius: 50%; background: var(--pm-color-line-strong); }
    .lt-person__body { position: absolute; left: 0; right: 0; bottom: 0; height: 58%; border-radius: 45% 45% 0 0; background: var(--pm-color-line-strong); }
    .lt { position: absolute; bottom: 9cqh; ${right ? 'right: 6cqw; align-items: flex-end; text-align: right;' : 'left: 6cqw; align-items: flex-start;'} display: flex; flex-direction: column; gap: 0.6cqh; }
    .lt__name { font: 600 ${TYPE.lead}cqw/1.2 var(--pm-font-sans); white-space: nowrap; }
    .lt__role { font-size: ${TYPE.label}cqw; line-height: 1.3; color: var(--pm-color-muted); white-space: nowrap; }
    .lt__kicker { font-size: ${TYPE.caption}cqw; font-weight: 600; color: var(--pm-color-accent); letter-spacing: 0.08em; white-space: nowrap; }
    .lt__mask { overflow: clip; padding-block: 0.1em; margin-block: -0.1em; }
    .lt__in { display: inline-block; }
    /* bar */
    .lt--bar { flex-direction: row; align-items: stretch; gap: 0; }
    .lt--bar .lt__tab { width: 0.7cqw; border-radius: 0.3cqw; background: var(--pm-color-accent); }
    .lt--bar .lt__card { display: flex; flex-direction: column; gap: 0.4cqh; padding: 1.6cqh 2.2cqw; border-radius: 0 0.8cqw 0.8cqw 0; background: ${card[0]}; color: ${card[1]}; box-shadow: var(--pm-shadow-float); }
    .lt--bar .lt__role { color: ${tone === 'surface' ? 'var(--pm-color-muted)' : `color-mix(in oklab, ${card[1]} 75%, transparent)`}; }
    .lt--bar .lt__kicker { color: ${tone === 'accent' ? card[1] : 'var(--pm-color-accent)'}; }
    /* stack */
    .lt--stack { gap: 0; }
    .lt--stack .lt__name { padding: 0.9cqh 1.6cqw; background: var(--pm-color-ink); color: var(--pm-color-bg); }
    .lt--stack .lt__role { padding: 0.7cqh 1.6cqw; background: var(--pm-color-accent); color: var(--pm-color-on-accent); }
    /* rule */
    .lt--rule { flex-direction: row; align-items: stretch; gap: 1.4cqw; }
    .lt--rule .lt__bar { width: 0.5cqw; border-radius: 0.25cqw; background: var(--pm-color-accent); }
    .lt--rule .lt__col { display: flex; flex-direction: column; gap: 0.4cqh; overflow: clip; }
    /* sweep */
    .lt--sweep .lt__wrap { position: relative; }
    .lt--sweep .lt__block { position: absolute; inset: -0.4cqh -0.6cqw; background: var(--pm-color-accent); }
    /* pill */
    .lt--pill { flex-direction: row; align-items: center; gap: 1.2cqw; padding: 1.2cqh 2.2cqw 1.2cqh 1.6cqw; border-radius: 99cqw; background: var(--pm-color-surface); border: 0.15cqw solid var(--pm-color-line); box-shadow: var(--pm-shadow-float); }
    .lt--pill .lt__dot { width: 1.2cqw; aspect-ratio: 1; border-radius: 50%; background: var(--pm-color-accent); }
    .lt--pill .lt__name { font-size: ${TYPE.body}cqw; }
  `, `${backdrop ? SHOT : ''}${markup(look, esc(name), esc(role), esc(kicker))}`)

  const tl = gsap.timeline()
  const q = (sel: string) => root.querySelector<HTMLElement>(sel)
  const all = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)]
  const box = q('.lt')!
  const nameIn = all('.lt__name .lt__in, .lt__name.lt__in')
  const roleEl = q('.lt__role')!, kick = q('.lt__kicker')
  const from = right ? 'inset(0% 0% 0% 100%)' : 'inset(0% 100% 0% 0%)'
  const open = 'inset(0% 0% 0% 0%)'
  const shut = right ? 'inset(0% 100% 0% 0%)' : 'inset(0% 0% 0% 100%)'
  const rise = (els: Element[], t: number) => { gsap.set(els, { yPercent: 110 }); tl.to(els, { yPercent: 0, duration: 0.45, ease: 'power3.out' }, t) }
  const fadeUp = (el: Element | null, t: number) => { if (!el) return; gsap.set(el, { autoAlpha: 0, y: '0.4em' }); tl.to(el, { autoAlpha: 1, y: 0, duration: 0.4, ease: 'power2.out' }, t) }
  const t2 = s(2)

  if (look === 'bar') {
    const tab = q('.lt__tab')!, cardEl = q('.lt__card')!
    gsap.set(tab, { scaleY: 0 })
    gsap.set(cardEl, { clipPath: from })
    tl.to(tab, { scaleY: 1, duration: 0.3, ease: 'power3.out' }, 0.05)
    tl.to(cardEl, { clipPath: open, duration: 0.5, ease: 'power3.inOut' }, 0.2)
    rise(nameIn, 0.35); fadeUp(kick, 0.45); fadeUp(roleEl, 0.5)
    tl.to(cardEl, { clipPath: from, duration: 0.3, ease: 'power2.in' }, t2 + 0.05)
    tl.to(tab, { scaleY: 0, duration: 0.2, ease: 'power2.in' }, t2 + 0.25)
  } else if (look === 'stack') {
    const n = q('.lt__name')!
    gsap.set(n, { clipPath: 'inset(0% 100% 0% 0%)' })
    gsap.set(roleEl, { clipPath: 'inset(0% 0% 0% 100%)' })
    tl.to(n, { clipPath: open, duration: 0.5, ease: 'power4.out' }, 0.1)
    tl.to(roleEl, { clipPath: open, duration: 0.5, ease: 'power4.out' }, 0.34)
    rise(nameIn, 0.2)
    tl.to(roleEl, { clipPath: 'inset(0% 0% 0% 100%)', duration: 0.28, ease: 'power3.in' }, t2)
    tl.to(n, { clipPath: 'inset(0% 100% 0% 0%)', duration: 0.3, ease: 'power3.in' }, t2 + 0.08)
  } else if (look === 'rule') {
    const bar = q('.lt__bar')!, col = q('.lt__col')!
    gsap.set(bar, { scaleY: 0, transformOrigin: '50% 100%' })
    gsap.set(col.children, { xPercent: right ? 105 : -105 })
    tl.to(bar, { scaleY: 1, duration: 0.35, ease: 'power3.out' }, 0.05)
    tl.to(col.children, { xPercent: 0, duration: 0.5, ease: 'power3.out', stagger: 0.08 }, 0.25)
    tl.to(col.children, { xPercent: right ? 105 : -105, duration: 0.25, ease: 'power2.in', stagger: 0.04 }, t2)
    tl.to(bar, { scaleY: 0, duration: 0.2, ease: 'power2.in' }, t2 + 0.2)
  } else if (look === 'sweep') {
    const block = q('.lt__block')!, nm = q('.lt__name')!
    gsap.set(block, { scaleX: 0, transformOrigin: right ? '100% 50%' : '0% 50%' })
    gsap.set(nm, { clipPath: from })
    // One sweep: the block grows across, the name is uncovered behind it as it drains to the far side.
    tl.to(block, { scaleX: 1, duration: 0.35, ease: 'power3.in' }, 0.05)
    tl.set(nm, { clipPath: open }, 0.4)
    tl.set(block, { transformOrigin: right ? '0% 50%' : '100% 50%' }, 0.4)
    tl.to(block, { scaleX: 0, duration: 0.4, ease: 'power3.out' }, 0.4)
    fadeUp(kick, 0.5); fadeUp(roleEl, 0.6)
    tl.to(box, { autoAlpha: 0, y: '1cqh', duration: 0.3, ease: 'power2.in' }, t2)
  } else {
    const dot = q('.lt__dot')!
    gsap.set(box, { autoAlpha: 0, scale: 0.9, transformOrigin: right ? '100% 50%' : '0% 50%' })
    tl.to(box, { autoAlpha: 1, duration: 0.2, ease: 'power1.out' }, 0.05)
    tl.to(box, { scale: 1, duration: 0.45, ease: 'back.out(1.6)' }, 0.05)
    gsap.set(dot, { scale: 0 })
    tl.to(dot, { keyframes: [{ scale: 1.4, duration: 0.15, ease: 'power2.out' }, { scale: 1, duration: 0.4, ease: 'back.out(3)' }] }, 0.3)
    fadeUp(roleEl, 0.35)
    tl.to(box, { autoAlpha: 0, scale: 0.96, duration: 0.25, ease: 'power2.in' }, t2)
  }
  return tl
})

function markup(look: Look, name: string, role: string, kicker: string): string {
  const k = kicker ? `<div class="lt__kicker">${kicker}</div>` : ''
  const n = `<div class="lt__name lt__mask"><span class="lt__in">${name}</span></div>`
  const r = `<div class="lt__role">${role}</div>`
  switch (look) {
    case 'bar': return `<div class="lt lt--bar"><div class="lt__tab"></div><div class="lt__card">${k}${n}${r}</div></div>`
    case 'stack': return `<div class="lt lt--stack"><div class="lt__name lt__mask"><span class="lt__in">${name}</span></div>${r}</div>`
    case 'rule': return `<div class="lt lt--rule"><div class="lt__bar"></div><div class="lt__col">${k}<div class="lt__name">${name}</div>${r}</div></div>`
    case 'sweep': return `<div class="lt lt--sweep">${k}<div class="lt__wrap"><div class="lt__name">${name}</div><div class="lt__block"></div></div>${r}</div>`
    default: return `<div class="lt lt--pill"><div class="lt__dot"></div><div class="lt__name">${name}</div>${r}</div>`
  }
}
