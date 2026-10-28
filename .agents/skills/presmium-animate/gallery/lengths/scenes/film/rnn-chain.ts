import { gsapScene } from '@lincyaw/addon-motion/scene'
import { atoms, EASE } from '../kit/atoms.ts'
import { frame, pick } from '../kit/frame.ts'

// The problem before the Transformer, with GSAP: a recurrent network reads one word per step. `tokens`: the
// sentence the attention shot uses next (the same words, so the two shots compare one thing). `chain`: a state dot
// walks from word to word, one tick per step, and each word lights as it is read; the dot starts in the color of
// "小猫" and loses it at every step, so by "它" little of it is left. `hold`: a dashed arc from "它" back to "小猫"
// with a question mark: far words reach each other only through every word between.
const TOKENS = ['小猫', '没有', '过', '马路', '因为', '它', '太', '累', '了']
const IT = 5

export default gsapScene(({ root, gsap, at, color }) => {
  const f = frame(root, `
    .rn { position: absolute; left: 8cqw; right: 8cqw; top: 46%; display: flex; justify-content: space-between; }
    .rn__tok { width: 8.6cqw; height: 6.8cqw; display: grid; place-items: center; border-radius: 1.2cqw; background: var(--pm-color-surface); border: 0.25cqw solid var(--pm-color-line-strong); font-size: 3cqw; font-weight: 600; }
    .rn__ticks { position: absolute; left: 8cqw; right: 8cqw; top: 70%; display: flex; justify-content: space-between; }
    .rn__tick { width: 8.6cqw; height: 1cqh; border-radius: 1cqw; background: var(--pm-color-line); transform-origin: left; }
    .rn__fill { width: 100%; height: 100%; border-radius: 1cqw; background: var(--pm-color-ink); transform: scaleX(0); transform-origin: left; }
    .rn__dot { position: absolute; left: 0; top: 0; width: 3cqw; height: 3cqw; margin: -1.5cqw 0 0 -1.5cqw; border-radius: 50%; }
    .rn__layer { position: absolute; inset: 0; pointer-events: none; }
    .rn__arc { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  `, `
    <svg class="rn__arc" viewBox="0 0 100 56.25" preserveAspectRatio="none"><path class="rn__back" d="" fill="none" stroke="var(--pm-color-warn)" stroke-width="0.5" stroke-dasharray="1.2 1" /><text class="rn__q" font-size="5" font-weight="600" fill="var(--pm-color-warn)" text-anchor="middle">?</text></svg>
    <div class="rn">${TOKENS.map(t => `<div class="rn__tok">${t}</div>`).join('')}</div>
    <div class="rn__ticks">${TOKENS.map(() => '<div class="rn__tick"><div class="rn__fill"></div></div>').join('')}</div>
    <div class="rn__layer"><div class="rn__dot"></div></div>`)
  const s = (k: number) => at(k) / 1000
  const tl = gsap.timeline()
  const a = atoms(gsap, tl)
  const toks = [...f.querySelectorAll<HTMLElement>('.rn__tok')]
  const fills = [...f.querySelectorAll<HTMLElement>('.rn__fill')]
  const layer = pick(f, '.rn__layer'), dot = pick(f, '.rn__dot')
  // Token centres in % of the frame: 9 boxes of 8.6 cqw spread over 84 cqw from 8 cqw.
  const cx = (i: number) => 8 + 4.3 + i * ((84 - 8.6) / 8)
  // The dot rides just above the row, whose top is at 46% of the height.
  const cy = 41
  a.enter(toks, s(0) + 0.1, { stagger: 0.06 })
  a.enter('.rn__tick', s(0) + 0.4, { from: 'fade', stagger: 0.03 })
  // chain: one step per word.
  const step = (s(2) - s(1)) / TOKENS.length
  const accent = color('accent'), grey = color('line-strong')
  gsap.set(layer, { xPercent: cx(0), yPercent: cy })
  gsap.set(dot, { autoAlpha: 0, backgroundColor: accent })
  tl.to(dot, { autoAlpha: 1, duration: 0.15 }, s(1))
  TOKENS.forEach((_, i) => {
    const t = s(1) + i * step
    if (i > 0) tl.to(layer, { xPercent: cx(i), duration: step * 0.6, ease: EASE.move }, t)
    tl.to(dot, { backgroundColor: gsap.utils.interpolate(accent, grey, Math.min(1, i / IT)), duration: step * 0.6 }, t)
    tl.to(toks[i]!, { borderColor: accent, backgroundColor: 'transparent', duration: 0.15 }, t + step * 0.5)
    tl.to(fills[i]!, { scaleX: 1, duration: step * 0.8, ease: 'power1.inOut' }, t)
  })
  // hold: the long way from 它 back to 小猫.
  const back = pick<SVGPathElement>(f, '.rn__back'), q = pick<SVGTextElement>(f, '.rn__q')
  // In the overlay's units (100 × 56.25): just above the dot's path.
  const y = cy * 0.5625 - 2
  back.setAttribute('d', `M ${cx(IT)} ${y} Q ${(cx(IT) + cx(0)) / 2} ${y - 16} ${cx(0)} ${y}`)
  q.setAttribute('x', String((cx(IT) + cx(0)) / 2))
  q.setAttribute('y', String(y - 9.5))
  a.draw(back, s(2), { duration: 0.7 })
  a.enter(q, s(2) + 0.6, { from: 'fade' })
  tl.to(toks[0]!, { borderColor: color('warn'), duration: 0.2 }, s(2) + 0.6)
  tl.to(toks[IT]!, { borderColor: color('warn'), duration: 0.2 }, s(2) + 0.6)
  return tl
})
