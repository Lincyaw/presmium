import { gsapScene } from '@lincyaw/addon-motion/scene'
import anthropic from '../logos/anthropic.svg?raw'
import deepseek from '../logos/deepseek-color.svg?raw'
import google from '../logos/google-color.svg?raw'
import kimi from '../logos/kimi-color.svg?raw'
import meta from '../logos/meta-color.svg?raw'
import openai from '../logos/openai.svg?raw'
import qwen from '../logos/qwen-color.svg?raw'
import stepfun from '../logos/stepfun.svg?raw'
import zai from '../logos/zai.svg?raw'
import { EASE } from '../kit/atoms.ts'

// A new entry joins a leaderboard, told with a character instead of words: a recreation of a 4.6 s benchmark
// announcement (FrontierCS 2, October 2026). `idle`: the mascot bobs on the bar of the old model. `hop`: it hops
// one bar to the left, and the bar it stands on lights up (squash before the jump, stretch in the air, squash on
// landing). `open`: every bar from there on slides one place right; the bar is pulled from under the mascot and it
// drops to the baseline, so the gap explains itself. `rise`: the new bar grows under it and carries it up; the
// new name appears in the accent color. `burst`: the mascot bursts into streaks and notes, and the score appears.
// `hold`: the notes drift away. The only words are the chart's own labels.
// Logos: @lobehub/icons-static-svg 1.101.0 (MIT); the marks belong to their owners.
interface Entry { name: string[], value: number, logo: string, open: boolean }

const LOGOS: Record<string, string> = { anthropic, deepseek, google, kimi, meta, openai, qwen, stepfun, zai }
const E = (name: string, value: number, logo: string, open: boolean): Entry => ({ name: name.split('|'), value, logo, open })
const BOARD = [
  E('Claude|Opus 5.5', 58, 'anthropic', false), E('Gemini 4|Argon|(Antigravity)', 54, 'google', false), E('GPT-6|Astra', 44, 'openai', false),
  E('Gemini 4|Argon (Pi)', 40, 'google', false), E('GPT-6.1|Terra', 40, 'openai', false), E('GPT-6.1|Sol', 35, 'openai', false),
  E('GLM|5.3', 25, 'zai', true), E('Kimi|K3', 21, 'kimi', true), E('Muse|Wonder 1.0', 21, 'meta', true), E('DeepSeek|V4.1 Flash|1017', 17, 'deepseek', true),
  E('DeepSeek|V4.1 Flash', 15, 'deepseek', true), E('Muse|Spark 1.3', 13, 'meta', true), E('Qwen|3.8 Max', 13, 'qwen', true), E('GLM 5.3|Flash', 13, 'zai', true),
  E('Step 5|Preview', 8, 'stepfun', true),
]
const NEW = E('Kimi|K3.1 Pro', 25, 'kimi', true)
const AT = 6        // the new entry's place, and the bar the mascot hops onto
const FROM = 7      // the bar the mascot starts on

export default gsapScene(({ root, gsap, at, color, parameters }) => {
  const title = (parameters.title as string | undefined) ?? 'FrontierCS 2'
  const metric = (parameters.metric as string | undefined) ?? 'Pass rate'
  const L = 80, SLOT = 90, BASE = 640, PX = 7.5
  const cx = (i: number) => L + SLOT * (i + 0.5)
  const top = (v: number) => BASE - v * PX
  const fill = (e: Entry) => (e.open ? 'var(--pm-color-accent-soft)' : 'var(--pm-color-line)')
  const logo = (key: string, x: number, y: number) => LOGOS[key]!.replace('<svg ', `<svg x="${x}" y="${y}" width="30" height="30" style="color: var(--pm-color-ink)" `)
  const column = (e: Entry, i: number, extra = '') => {
    const h = e.value * PX, inside = h > 60
    return `<g transform="translate(${cx(i)} 0)"><g class="lb__col ${extra}" data-i="${i}">
      <rect class="lb__bar" x="-33" y="${top(e.value)}" width="66" height="${h}" rx="6" fill="${fill(e)}" />
      <text class="lb__value" x="0" y="${inside ? top(e.value) + 38 : top(e.value) - 12}" text-anchor="middle" font-size="30" font-weight="600" fill="var(--pm-color-ink)">${e.value}</text>
      <rect class="lb__tile" x="-24" y="${BASE + 18}" width="48" height="48" rx="10" fill="var(--pm-color-sunk)" />
      <g class="lb__logo">${logo(e.logo, -15, BASE + 27)}</g>
      <text class="lb__name" y="${BASE + 98}" text-anchor="middle" font-size="16" fill="var(--pm-color-ink)">${e.name.map((line, j) => `<tspan x="0" dy="${j ? 19 : 0}">${line}</tspan>`).join('')}</text>
    </g></g>`
  }
  root.innerHTML = `<svg viewBox="0 0 1600 900" width="100%" height="100%" style="display:block; font-family: var(--pm-font-sans)">
    <text x="${L}" y="92" font-size="40" font-weight="600" fill="var(--pm-color-ink)">${title}</text>
    <text x="${L}" y="130" font-size="20" fill="var(--pm-color-muted)">${metric}</text>
    ${[10, 20, 30, 40, 50, 60].map(v => `<line x1="${L}" x2="${L + SLOT * 16}" y1="${top(v)}" y2="${top(v)}" stroke="var(--pm-color-line)" stroke-dasharray="4 6" />`).join('')}
    <line x1="${L}" x2="${L + SLOT * 16}" y1="${BASE}" y2="${BASE}" stroke="var(--pm-color-line-strong)" stroke-width="2" />
    ${BOARD.map((e, i) => column(e, i)).join('')}
    ${column(NEW, AT, 'lb__new')}
    <g class="lb__burst">${Array.from({ length: 9 }, (_, i) => {
      const a = (-165 + i * 18.75) * Math.PI / 180
      return `<path class="lb__streak" d="M 0 0 L ${Math.cos(a) * 120} ${Math.sin(a) * 120}" stroke-width="5" stroke-linecap="round" />`
    }).join('')}${Array.from({ length: 6 }, (_, i) => `<text class="lb__note" font-size="34" fill="var(--pm-color-accent)" text-anchor="middle">${i % 2 ? '♫' : '♪'}</text>`).join('')}</g>
    <g class="lb__mascot"><g class="lb__ball">
      <circle cx="0" cy="-24" r="24" fill="var(--pm-color-accent)" />
      <circle cx="6" cy="-25" r="21" fill="var(--pm-color-ink)" />
      <circle cx="11" cy="-33" r="4" fill="var(--pm-color-muted)" opacity="0.6" /><circle cx="15" cy="-18" r="2.6" fill="var(--pm-color-muted)" opacity="0.6" />
    </g></g>
  </svg>`
  const s = (k: number) => at(k) / 1000
  const tl = gsap.timeline()
  const accent = color('accent'), soft = color('accent-soft'), on = color('on-accent')
  const col = (i: number) => root.querySelector<SVGGElement>(`.lb__col[data-i="${i}"]:not(.lb__new)`)!
  const bar = (i: number) => col(i).querySelector('.lb__bar')!
  const value = (i: number) => col(i).querySelector('.lb__value')!
  const mascot = '.lb__mascot', ball = '.lb__ball'
  const streaks = [...root.querySelectorAll<SVGPathElement>('.lb__streak')]
  const tints = ['accent', 'ok', 'warn', 'danger', 'syntax-key', 'syntax-string', 'syntax-keyword', 'accent', 'ok']
  streaks.forEach((path, i) => path.setAttribute('stroke', color(tints[i]!)))

  // Start: the mascot on the old model's bar, which is lit; the new column and the burst are hidden.
  gsap.set(mascot, { x: cx(FROM), y: top(BOARD[FROM]!.value) })
  gsap.set(ball, { transformOrigin: '50% 100%' })
  gsap.set(bar(FROM), { fill: accent })
  gsap.set(value(FROM), { fill: on })
  gsap.set('.lb__new .lb__bar', { scaleY: 0, transformOrigin: '50% 100%', fill: accent })
  gsap.set('.lb__new .lb__value', { autoAlpha: 0 })
  gsap.set(['.lb__new .lb__tile', '.lb__new .lb__logo', '.lb__new .lb__name'], { autoAlpha: 0, scale: 0.6, transformOrigin: '50% 50%' })
  gsap.set('.lb__new .lb__name', { fill: accent, fontWeight: 600 })
  gsap.set(streaks, { drawSVG: '0% 0%', autoAlpha: 0 })
  gsap.set('.lb__note', { autoAlpha: 0 })

  /** Squash (before a jump or on landing) and back: the ball keeps its volume, wider when flatter. */
  const squash = (t: number, amount = 0.25) => tl.to(ball, { keyframes: [{ scaleX: 1 + amount * 0.8, scaleY: 1 - amount, duration: 0.08, ease: 'power2.out' }, { scaleX: 1, scaleY: 1, duration: 0.3, ease: 'elastic.out(1, 0.5)' }] }, t)
  /** A jump from where the mascot is to (x, y), peaking `lift` above the higher end. */
  const jump = (t: number, x: number, y: number, lift: number, duration = 0.5) => {
    tl.to(mascot, { x, duration, ease: 'power1.inOut' }, t)
    tl.to(mascot, { keyframes: [{ y: Math.min(y, top(25)) - lift, duration: duration * 0.45, ease: 'power2.out' }, { y, duration: duration * 0.55, ease: 'power2.in' }] }, t)
    tl.to(ball, { keyframes: [{ scaleX: 0.9, scaleY: 1.12, duration: duration * 0.4 }, { scaleX: 1, scaleY: 1, duration: duration * 0.4 }] }, t)
  }
  /** Note `i` rises from (x, y), relative to the place of the burst, and fades. */
  const note = (i: number, t: number, x: number, y: number) => {
    const el = root.querySelectorAll('.lb__note')[i]!
    tl.fromTo(el, { autoAlpha: 0, x, y, rotation: -10 }, { keyframes: [{ autoAlpha: 1, y: y - 30, duration: 0.25, ease: 'power2.out' }, { autoAlpha: 0, y: y - 90, rotation: 10, duration: 0.9, ease: 'power1.in' }], immediateRender: false }, t)
  }

  // idle: two small bobs.
  for (const t of [0.1, 0.45]) {
    tl.to(mascot, { keyframes: [{ y: top(21) - 18, duration: 0.15, ease: 'power2.out' }, { y: top(21), duration: 0.15, ease: 'power2.in' }] }, s(0) + t)
    squash(s(0) + t + 0.3, 0.15)
  }
  // hop: onto the bar on the left, which lights up as it lands; the old one goes back to its color.
  squash(s(1), 0.22)
  jump(s(1) + 0.1, cx(AT), top(25), 80)
  tl.to(bar(FROM), { fill: soft, duration: 0.2 }, s(1) + 0.15)
  tl.to(value(FROM), { fill: color('ink'), duration: 0.2 }, s(1) + 0.15)
  tl.to(bar(AT), { fill: accent, duration: 0.15 }, s(1) + 0.6)
  tl.to(value(AT), { fill: on, duration: 0.15 }, s(1) + 0.6)
  squash(s(1) + 0.6)
  note(5, s(1) + 0.6, 34, 0)
  // open: the bars from AT on slide one place right; the mascot drops when its bar has left from under it.
  tl.to(BOARD.slice(AT).map((_, j) => col(AT + j)), { x: SLOT, duration: 0.55, ease: EASE.move, stagger: 0.015 }, s(2))
  tl.to(bar(AT), { fill: soft, duration: 0.25 }, s(2) + 0.1)
  tl.to(value(AT), { fill: color('ink'), duration: 0.25 }, s(2) + 0.1)
  tl.to(mascot, { keyframes: [{ y: top(25) - 16, duration: 0.12, ease: 'power2.out' }, { y: BASE, duration: 0.32, ease: 'power2.in' }] }, s(2) + 0.18)
  squash(s(2) + 0.62, 0.3)
  // rise: the new bar grows and carries the mascot; the new name pops in under it.
  tl.to('.lb__new .lb__bar', { scaleY: 1, duration: 0.55, ease: 'back.out(1.4)' }, s(3) + 0.05)
  tl.to(mascot, { y: top(25), duration: 0.55, ease: 'back.out(1.4)' }, s(3) + 0.05)
  tl.to(['.lb__new .lb__tile', '.lb__new .lb__logo', '.lb__new .lb__name'], { autoAlpha: 1, scale: 1, duration: 0.4, ease: EASE.pop, stagger: 0.06 }, s(3) + 0.15)
  // burst: a last squash, then the mascot is gone in streaks and notes, and the score shows.
  squash(s(4), 0.3)
  gsap.set('.lb__burst', { x: cx(AT), y: top(25) - 24 })
  tl.to(ball, { scale: 1.4, autoAlpha: 0, duration: 0.15, ease: 'power2.out' }, s(4) + 0.1)
  tl.to(streaks, { autoAlpha: 1, duration: 0.01 }, s(4) + 0.1)
  tl.to(streaks, { keyframes: [{ drawSVG: '20% 90%', duration: 0.2, ease: 'power2.out' }, { drawSVG: '100% 100%', duration: 0.3, ease: 'power1.in' }] }, s(4) + 0.1)
  tl.to('.lb__new .lb__value', { autoAlpha: 1, fill: on, duration: 0.25 }, s(4) + 0.15)
  ;[0, 1, 2, 3, 4].forEach(i => note(i, s(4) + 0.12 + i * 0.06, -56 + i * 28, -10))
  return tl
})
