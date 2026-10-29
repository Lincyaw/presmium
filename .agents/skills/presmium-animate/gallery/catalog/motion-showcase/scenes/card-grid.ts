import { gsapScene } from '@lincyaw/addon-motion/scene'
import { frame } from '../../../lengths/scenes/kit/frame.ts'
import { ICONS } from '../../../lengths/scenes/kit/icons.ts'

// Card grid, with GSAP: the parts of something assemble into a grid, then one of them is picked. Two states.
// `assemble` (1.6 s): each card fades in and rises a short way straight into its own slot (0.5 s, power3.out, no
// overshoot: a list is not a celebration); the starts come from a meaningful origin (`from`: start, center, end or
// edges) through GSAP's grid stagger, the whole wave capped at 0.6 s and itself eased, so a large grid does not take
// longer. 0.15 s after its card lands, each line icon draws itself on (0.5 s), the detail arriving after the
// container. `focus` (2.2 s): 0–0.4 s the chosen card lifts 4% and takes the accent, the others step back to 40%
// opacity: the grid was the context, this card is the subject of the next shot; then a hold. Without `focus` the
// second state is a plain hold. Adapted from HyperFrames grid-card-assemble (with stagger-cascade, stagger-lattice
// and mk-placeholder-grid, whose waves are its `from` values).
interface Item { label: string, body?: string, icon?: string }

const SVG = (body: string) => `<svg class="lf-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
const MORE: Record<string, string> = {
  quiz: SVG('<rect x="8" y="8" width="32" height="32" rx="4" /><path d="M15 24 L21 30 L33 17" />'),
  chat: SVG('<path d="M8 12 H40 V32 H22 L14 39 V32 H8 Z" /><path d="M15 20 H33 M15 26 H27" />'),
}
const icon = (name: string) => (ICONS as Record<string, string>)[name] ?? MORE[name] ?? MORE.quiz!

export default gsapScene(({ root, gsap, at, color, parameters }) => {
  const items = (parameters.items as Item[] | undefined) ?? [
    { label: '讲义', body: '课前阅读', icon: 'web' }, { label: '幻灯片', body: '课堂放映', icon: 'slides' },
    { label: 'Notebook', body: '动手练习', icon: 'notebook' }, { label: '讲解视频', body: '课后复习', icon: 'video' },
    { label: '小测', body: '检查理解', icon: 'quiz' }, { label: '讨论', body: '答疑交流', icon: 'chat' },
  ]
  const from = (parameters.from as string | undefined) ?? 'start'
  const focus = (parameters.focus as number | undefined) ?? 2
  const n = items.length
  const cols = (parameters.columns as number | undefined) || (n <= 3 ? n : n === 4 ? 2 : Math.ceil(n / 2) <= 4 ? Math.ceil(n / 2) : Math.ceil(Math.sqrt(n)))
  const rows = Math.ceil(n / cols)
  frame(root, `
    .cg { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: grid; grid-template-columns: repeat(${cols}, 24cqw); gap: 2.4cqw; }
    .cg__card { height: ${rows > 2 ? 22 : 30}cqh; padding: 2cqw; display: flex; flex-direction: column; justify-content: center; gap: 1cqh; }
    .cg__card .lf-icon { width: 4.6cqw; height: 4.6cqw; color: var(--pm-color-accent); }
    .cg__label { font-size: 2.8cqw; font-weight: 600; }
    .cg__body { font-size: ${2}cqw; color: var(--pm-color-muted); }
  `, `<div class="cg">${items.map(it => `<div class="lf-card cg__card">${icon(it.icon ?? 'quiz')}<div class="cg__label">${it.label}</div>${it.body ? `<div class="cg__body">${it.body}</div>` : ''}</div>`).join('')}</div>`)

  const S = (k: number) => at(k) / 1000
  const tl = gsap.timeline()
  const cards = gsap.utils.toArray<HTMLElement>('.cg__card', root)
  // One start time per card from the grid stagger; the card and, a beat later, its icon use the same one.
  const delay = gsap.utils.distribute({ base: 0, amount: Math.min(0.6, 0.08 * (n - 1)), from: from as 'start', grid: [rows, cols], ease: 'power1.out' })
  cards.forEach((card, i) => {
    const t = 0.1 + delay(i, card, cards)
    gsap.set(card, { autoAlpha: 0, yPercent: 12 })
    tl.to(card, { autoAlpha: 1, yPercent: 0, duration: 0.5, ease: 'power3.out' }, t)
    const strokes = [...card.querySelectorAll('.lf-icon > *')]
    gsap.set(strokes, { drawSVG: '0%' })
    tl.to(strokes, { drawSVG: '100%', duration: 0.5, ease: 'power2.inOut' }, t + 0.15)
  })
  if (focus >= 0 && focus < n) {
    const t1 = S(1)
    tl.to(cards[focus]!, { scale: 1.04, borderColor: color('accent'), backgroundColor: color('accent-soft'), duration: 0.4, ease: 'power2.out' }, t1)
    tl.to(cards.filter((_, i) => i !== focus), { autoAlpha: 0.4, duration: 0.4, ease: 'power1.inOut' }, t1)
  }
  return tl
})
