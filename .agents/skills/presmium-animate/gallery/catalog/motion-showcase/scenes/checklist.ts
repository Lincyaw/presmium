import { gsapScene } from '@lincyaw/addon-motion/scene'
import { frame } from '../../../lengths/scenes/kit/frame.ts'

// Checklist, with GSAP: the takeaways of a lesson, one row at a time. Three states. `title` (0.7 s): the heading
// rises in and a short accent rule draws under it. `items` (1.3 s per row): each row's circle draws (0.3 s) and the
// tick in it follows (0.2 s); as the tick lands the text rises out of a slot behind its baseline (a mask, not a
// fade, 0.45 s), then an accent underline sweeps left to right under the row's key phrase (0.4 s, power2.inOut), the
// one thing to remember from that row. When the next row starts, the row before steps back to the muted colour, so
// only the newest row is in focus. `hold` (2.2 s): every row comes back to full ink with its underline, the list
// read as one summary. The rows' pace is the `items` state's duration divided by their number, so a narrated step
// can stretch it. Adapted from HyperFrames mk-specs-list.
interface Row { text: string, key?: string }

export default gsapScene(({ root, gsap, at, color, parameters }) => {
  const title = (parameters.title as string | undefined) ?? '本节要点'
  const rows = (parameters.items as Row[] | undefined) ?? [
    { text: '梯度指向函数增长最快的方向', key: '增长最快' },
    { text: '学习率决定每一步走多远', key: '每一步走多远' },
    { text: '学习率太大会震荡，太小收敛慢', key: '震荡' },
  ]
  const line = (r: Row) => {
    const i = r.key ? r.text.indexOf(r.key) : -1
    if (i < 0) return r.text
    return `${r.text.slice(0, i)}<span class="ck__key">${r.key}<span class="ck__under"></span></span>${r.text.slice(i + r.key!.length)}`
  }
  frame(root, `
    .ck { position: absolute; left: 14cqw; right: 8cqw; top: 13cqh; }
    .ck__title { font: 600 5.4cqw/1.2 var(--pm-font-serif); }
    .ck__rule { width: 7cqw; height: 0.6cqh; margin: 2cqh 0 6cqh; border-radius: 1cqw; background: var(--pm-color-accent); transform-origin: left; }
    .ck__row { display: flex; align-items: center; gap: 2cqw; margin-bottom: 7cqh; }
    .ck__mark { flex: none; width: 5cqw; height: 5cqw; overflow: visible; }
    .ck__slot { overflow: hidden; padding: 0.4cqh 0 1.4cqh; }
    .ck__text { display: block; font-size: 4cqw; font-weight: 500; white-space: nowrap; }
    .ck__key { position: relative; }
    .ck__under { position: absolute; left: 0; right: 0; bottom: -0.5cqh; height: 0.55cqh; border-radius: 1cqw; background: var(--pm-color-accent); transform-origin: left; transform: scaleX(0); }
  `, `<div class="ck"><div class="ck__title">${title}</div><div class="ck__rule"></div>
    ${rows.map(r => `<div class="ck__row">
      <svg class="ck__mark" viewBox="0 0 40 40" aria-hidden="true"><circle class="ck__circle" cx="20" cy="20" r="17" fill="none" stroke="var(--pm-color-accent)" stroke-width="3.5" transform="rotate(-90 20 20)" />
        <path class="ck__tick" d="M 12 21 L 18 27 L 29 14" fill="none" stroke="var(--pm-color-accent)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" /></svg>
      <div class="ck__slot"><span class="ck__text">${line(r)}</span></div></div>`).join('')}</div>`)

  const S = (k: number) => at(k) / 1000
  const tl = gsap.timeline()
  const rowEls = gsap.utils.toArray<HTMLElement>('.ck__row', root)

  // title
  gsap.set('.ck__title', { autoAlpha: 0, y: '0.6em' })
  tl.to('.ck__title', { autoAlpha: 1, y: 0, duration: 0.45, ease: 'expo.out' }, 0.05)
  tl.fromTo('.ck__rule', { scaleX: 0 }, { scaleX: 1, duration: 0.4, ease: 'power2.inOut' }, 0.25)

  // items, one at a time
  const beat = (S(2) - S(1)) / rows.length
  rowEls.forEach((row, i) => {
    const t = S(1) + i * beat
    const circle = row.querySelector('.ck__circle')!, tick = row.querySelector('.ck__tick')!
    const text = row.querySelector<HTMLElement>('.ck__text')!, under = row.querySelector('.ck__under')
    gsap.set([circle, tick], { drawSVG: '0%', autoAlpha: 0 })
    tl.set([circle, tick], { autoAlpha: 1 }, t)
    tl.to(circle, { drawSVG: '100%', duration: 0.3, ease: 'power2.inOut' }, t)
    tl.to(tick, { drawSVG: '100%', duration: 0.2, ease: 'power2.out' }, t + 0.25)
    gsap.set(text, { yPercent: 110 })
    tl.to(text, { yPercent: 0, duration: 0.45, ease: 'expo.out' }, t + 0.35)
    if (under) tl.to(under, { scaleX: 1, duration: 0.4, ease: 'power2.inOut' }, t + 0.7)
    if (i > 0) tl.to(rowEls[i - 1]!.querySelector('.ck__text'), { color: color('muted'), duration: 0.3, ease: 'power1.inOut' }, t)
  })

  // hold: the whole list in full ink
  tl.to(rowEls.map(r => r.querySelector('.ck__text')), { color: color('ink'), duration: 0.4, ease: 'power1.inOut' }, S(2))
  return tl
})
