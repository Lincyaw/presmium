import { gsapScene } from '@lincyaw/addon-motion/scene'
import { atoms, DUR, EASE } from '../kit/atoms.ts'
import { frame, markSvg } from '../kit/frame.ts'
import { fileCard, ICONS } from '../kit/icons.ts'

// Problem → solution in ten seconds, shown with files and icons rather than said. `chaos`: four files of one
// lesson land scattered (slides, handout, recording, code). `pain`: one of them is edited, and the other three
// get a warning one after another: they are now out of date. `gather`: the four fly into one document, which
// pops. `fanout`: lines draw from it to the four forms, each appearing as its line arrives. `hold`: the document
// pulses once and the frame rests. The 30- and 60-second films show its first two states as the problem and its
// last three as the answer.
const FILES = [
  { ext: 'PPTX', tint: 'warn', x: 26, y: 30, r: -8 },
  { ext: 'DOCX', tint: 'accent', x: 72, y: 27, r: 6 },
  { ext: 'MP4', tint: 'danger', x: 30, y: 72, r: 5 },
  { ext: 'PY', tint: 'ok', x: 70, y: 70, r: -6 },
]
const FORMS = [
  { icon: ICONS.web, x: 19, y: 26 },
  { icon: ICONS.slides, x: 81, y: 26 },
  { icon: ICONS.notebook, x: 19, y: 74 },
  { icon: ICONS.video, x: 81, y: 74 },
]

export default gsapScene(({ root, gsap, at, color }) => {
  const f = frame(root, `
    .ps__pos { position: absolute; transform: translate(-50%, -50%); }
    .ps__file { display: block; width: 11cqw; height: 13.75cqw; overflow: visible; }
    .ps__warn { position: absolute; right: -1.4cqw; top: -1.4cqw; width: 3.6cqw; height: 3.6cqw; display: grid; place-items: center; border-radius: 50%; background: var(--pm-color-warn); color: var(--pm-color-surface); font: 600 2.4cqw/1 var(--pm-font-sans); }
    .ps__pen { position: absolute; width: 4.5cqw; height: 4.5cqw; color: var(--pm-color-ink); }
    .ps__doc { width: 15cqw; height: 15cqw; display: grid; place-items: center; border-radius: 2cqw; background: var(--pm-color-accent-soft); border: 0.3cqw solid var(--pm-color-accent); color: var(--pm-color-accent); }
    .ps__doc .mark { width: 9cqw; height: 9cqw; }
    .ps__form { width: 11cqw; height: 11cqw; display: grid; place-items: center; border-radius: 1.6cqw; background: var(--pm-color-surface); border: 0.2cqw solid var(--pm-color-line-strong); color: var(--pm-color-accent); }
    .ps__form .lf-icon { width: 6cqw; height: 6cqw; }
    .ps__links { position: absolute; inset: 0; width: 100%; height: 100%; }
  `, `
    <svg class="ps__links" viewBox="0 0 100 56.25" preserveAspectRatio="none">${FORMS.map(form => `<path class="ps__link" d="M 50 28.1 L ${form.x} ${form.y * 0.5625}" stroke="${color('accent')}" stroke-width="0.4" fill="none" />`).join('')}</svg>
    ${FORMS.map(form => `<div class="ps__pos" style="left:${form.x}%; top:${form.y}%"><div class="ps__form">${form.icon}</div></div>`).join('')}
    <div class="ps__pos" style="left:50%; top:50%"><div class="ps__doc">${markSvg()}</div></div>
    ${FILES.map(file => `<div class="ps__pos ps__filepos" style="left:${file.x}%; top:${file.y}%"><div class="ps__card" style="position:relative">${fileCard(file.ext, color(file.tint), 'ps__file')}<div class="ps__warn">!</div></div></div>`).join('')}
    <div class="ps__pen">${ICONS.pencil}</div>
  `)
  const s = (k: number) => at(k) / 1000
  const tl = gsap.timeline()
  const a = atoms(gsap, tl)
  const cards = [...f.querySelectorAll<HTMLElement>('.ps__card')]
  const spots = [...f.querySelectorAll<HTMLElement>('.ps__filepos')]
  const warns = [...f.querySelectorAll<HTMLElement>('.ps__warn')]
  // chaos: the files land, each turned a little, one after another.
  gsap.set(cards, { rotation: (i: number) => FILES[i]!.r })
  a.enter(cards, s(0) + 0.1, { from: 'scale', stagger: 0.18 })
  // pain: a pencil edits the slides (its first line turns accent), then the others are flagged one by one.
  gsap.set('.ps__pen', { left: '33%', top: '24%', autoAlpha: 0 })
  tl.to('.ps__pen', { autoAlpha: 1, duration: 0.15 }, s(1))
  tl.to('.ps__pen', { keyframes: { x: ['0%', '60%', '0%', '60%'] }, duration: 0.45, ease: 'none' }, s(1) + 0.1)
  tl.to(cards[0]!.querySelectorAll('.lf-file__line'), { stroke: color('accent'), duration: 0.2 }, s(1) + 0.2)
  tl.to('.ps__pen', { autoAlpha: 0, duration: 0.15 }, s(1) + 0.6)
  gsap.set(warns, { autoAlpha: 0, scale: 0 })
  warns.slice(1).forEach((warn, i) => {
    const t = s(1) + 0.6 + i * 0.2
    tl.to(warn, { autoAlpha: 1, scale: 1, duration: 0.3, ease: EASE.pop }, t)
    tl.to(cards[i + 1]!, { keyframes: { x: ['0%', '-4%', '4%', '-2%', '0%'] }, duration: 0.3, ease: 'none' }, t)
  })
  // gather: the files fly into the middle and shrink away; the document appears where they meet.
  tl.to(spots, { left: '50%', top: '50%', duration: DUR.move, ease: EASE.move, stagger: 0.05 }, s(2))
  tl.to(cards, { scale: 0.3, rotation: 0, autoAlpha: 0, duration: DUR.move, ease: 'power2.in', stagger: 0.05 }, s(2))
  a.enter('.ps__doc', s(2) + 0.6, { from: 'scale' })
  // fanout: a line to each form, the form appearing as the line arrives.
  a.draw('.ps__link', s(3), { duration: 0.5, stagger: 0.25 })
  a.enter('.ps__form', s(3) + 0.4, { from: 'scale', stagger: 0.25 })
  // hold: one pulse on the document.
  a.emphasize('.ps__doc', s(4) + 0.2)
  return tl
})
