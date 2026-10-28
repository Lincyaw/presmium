import { gsapScene } from '@lincyaw/addon-motion/scene'
import { atoms, DUR, POINTER, POINTER_CSS } from '../kit/atoms.ts'
import { frame, pick } from '../kit/frame.ts'

// One feature, one click, built from the atoms. `ui`: the window rises in; if there is a prompt it is typed into
// the box at 14 characters a second while the pointer travels to the button, arriving as the state ends. `click`:
// the press (pointer, button and a ring), then a progress bar fills. `done`: the bar gives way to the result, the
// preview on the left updates, and the caption names the benefit; the rest of the state is a hold to read it.
// Cause (the click) and effect (the result) are never on screen at the same moment.
export default gsapScene(({ root, gsap, at, color, parameters }) => {
  const title = (parameters.title as string | undefined) ?? 'Presmium Studio'
  const prompt = parameters.prompt as string | undefined
  const button = (parameters.button as string | undefined) ?? '导出视频'
  const result = (parameters.result as string | undefined) ?? '已导出 lecture.webm'
  const caption = (parameters.caption as string | undefined) ?? '一键导出带字幕的讲授视频'
  const f = frame(root, `
    ${POINTER_CSS}
    .fc__win { position: absolute; left: 14cqw; top: 8cqh; width: 72cqw; height: 70cqh; overflow: hidden; }
    .fc__bar { height: 8cqh; display: flex; align-items: center; gap: 0.8cqw; padding: 0 1.6cqw; border-bottom: 0.18cqw solid var(--pm-color-line); background: var(--pm-color-sunk); font-size: 1.6cqw; color: var(--pm-color-muted); }
    .fc__bar i { width: 1cqw; height: 1cqw; border-radius: 50%; background: var(--pm-color-line-strong); }
    .fc__bar span { margin-left: 1cqw; }
    .fc__preview { position: absolute; left: 2.5cqw; top: 14cqh; width: 38cqw; height: 50cqh; padding: 2.4cqw; border-radius: 0.8cqw; background: var(--pm-color-bg); border: 0.18cqw solid var(--pm-color-line); display: flex; flex-direction: column; gap: 2cqh; }
    .fc__h { height: 4.5cqh; width: 60%; border-radius: 0.4cqw; background: var(--pm-color-ink); opacity: 0.8; }
    .fc__l { height: 3cqh; border-radius: 0.4cqw; background: var(--pm-color-line-strong); transform-origin: left; }
    .fc__shine { position: absolute; inset: 0; background: linear-gradient(100deg, transparent 30%, var(--pm-color-accent-soft) 50%, transparent 70%); opacity: 0; }
    .fc__input { position: absolute; left: 43cqw; top: 22cqh; width: 26.5cqw; height: 10cqh; display: flex; align-items: center; padding: 0 1.2cqw; border-radius: 0.8cqw; border: 0.18cqw solid var(--pm-color-accent); font-size: 1.7cqw; white-space: nowrap; overflow: hidden; }
    .fc__btn { position: absolute; left: 43cqw; top: ${prompt ? 36 : 26}cqh; width: 26.5cqw; height: 11cqh; display: grid; place-items: center; border-radius: 0.8cqw; background: var(--pm-color-accent); color: var(--pm-color-on-accent); font-size: 2.2cqw; font-weight: 600; }
    .fc__progress { position: absolute; left: 43cqw; top: ${prompt ? 52 : 44}cqh; width: 26.5cqw; height: 2.4cqh; border-radius: 9cqw; background: var(--pm-color-sunk); overflow: hidden; }
    .fc__fill { width: 100%; height: 100%; background: var(--pm-color-accent); transform-origin: left; transform: scaleX(0); }
    .fc__result { position: absolute; left: 43cqw; top: ${prompt ? 50 : 42}cqh; width: 26.5cqw; background: var(--pm-color-ok-soft); color: var(--pm-color-ok); font-size: 1.8cqw; }
    .fc__caption { position: absolute; left: 0; right: 0; top: 84cqh; text-align: center; }
  `, `
    <div class="fc__win lf-card">
      <div class="fc__bar"><i></i><i></i><i></i><span>${title}</span></div>
      <div class="fc__preview"><div class="fc__h"></div>${[86, 70, 78].map(w => `<div class="fc__l" style="width:${w}%"></div>`).join('')}<div class="fc__shine"></div></div>
      ${prompt ? '<div class="fc__input"><span class="fc__typed"></span></div>' : ''}
      <div class="fc__btn">${button}</div>
      <div class="fc__progress"><div class="fc__fill"></div></div>
      <div class="lf-chip fc__result">✓ ${result}</div>
    </div>
    <div class="lf-body fc__caption">${caption}</div>
    <div class="lf-pointer-layer">${POINTER}</div>`)
  const s = (k: number) => at(k) / 1000
  const tl = gsap.timeline()
  const a = atoms(gsap, tl)
  const layer = pick(f, '.lf-pointer-layer'), btn = pick(f, '.fc__btn')
  // ui: the window, the prompt, the pointer reaching the button (its centre is 14 + 43 + 13.25 cqw across).
  a.enter('.fc__win', s(0))
  gsap.set(layer, { xPercent: 92, yPercent: 96, autoAlpha: 0 })
  tl.to(layer, { autoAlpha: 1, duration: 0.2 }, s(0) + 0.3)
  if (prompt) a.type('.fc__typed', prompt, s(0) + 0.45)
  const btnY = (prompt ? 36 : 26) + 8 + 5.5
  a.point(layer, s(1) - DUR.move - 0.05, 70.25, btnY)
  // click
  a.click('.lf-pointer', '.lf-pointer__ring', btn, s(1))
  gsap.set('.fc__progress', { autoAlpha: 0 })
  tl.to('.fc__progress', { autoAlpha: 1, duration: 0.15 }, s(1) + 0.15)
  tl.to('.fc__fill', { scaleX: 1, duration: Math.max(0.4, s(2) - s(1) - 0.35), ease: 'power1.inOut' }, s(1) + 0.2)
  // done: the result replaces the bar, the preview updates, the pointer steps aside, the caption names the benefit.
  a.replace('.fc__progress', '.fc__result', s(2))
  tl.to('.fc__l', { scaleX: (i: number) => [0.8, 1.15, 0.7][i], backgroundColor: color('accent-line'), duration: DUR.move, ease: 'power3.inOut', stagger: 0.06 }, s(2) + 0.1)
  tl.fromTo('.fc__shine', { autoAlpha: 0, xPercent: -60 }, { autoAlpha: 1, xPercent: 60, duration: 0.7, ease: 'power2.inOut', immediateRender: false }, s(2) + 0.1)
  tl.to('.fc__shine', { autoAlpha: 0, duration: 0.2 }, s(2) + 0.8)
  a.point(layer, s(2) + 0.1, 90, 70)
  a.enter('.fc__caption', s(2) + 0.25)
  return tl
})
