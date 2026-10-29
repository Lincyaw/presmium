import { gsapScene } from '@lincyaw/addon-motion/scene'
import { atoms, DUR, esc, frame, list, pick, POINTER, POINTER_CSS, shadow, str } from './lib/ui.ts'

// Onboarding stepper: a milestone rail on the left, the current step's card on the right, the pointer presses
// "next" each time. One state per step (`step-1`…), then `done`. `step-1`: the rail and the card rise, the first
// node lights, the pointer arrives at the button as the state ends. Each later step: 0–0.12 s the press (the
// cause); 0.15–0.6 s the rail's line draws down to the next node, the node it leaves takes a check, and the card's
// text slides out to the left and the next step's in from the right (forward is to the right, the one spatial
// convention); 0.6 s the reached node pops once. The rest is reading time (the body is one short line).
// `done`: the last press, the rail is complete, the card shows the finish line and the button's label changes;
// the pointer steps aside; hold. Adapted from HyperFrames onboarding-stepper-flow (with state-chip-rail).
interface Step { title: string, body?: string }

export default gsapScene(({ root, gsap, at, durations, color, parameters }) => {
  const steps = list<Step>(parameters, 'steps', [
    { title: '新建讲义', body: '选一个模板，起好标题' },
    { title: '写内容', body: '段落、公式、代码在同一份文稿里' },
    { title: '加动画', body: '把要讲的过程拆成一步一步' },
    { title: '导出', body: '网页、幻灯片和讲授视频一起生成' },
  ]).slice(0, Math.max(1, durations.length - 1))
  const next = str(parameters, 'button', '下一步')
  const finish = str(parameters, 'finish', '准备好了！')
  const start = str(parameters, 'start', '开始使用')
  const n = steps.length
  const y0 = 20, y1 = 80, gap = n > 1 ? (y1 - y0) / (n - 1) : 0   // node centres, cqh
  const check = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 L10 17.5 L19 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" /></svg>'
  const f = frame(root, `
    ${POINTER_CSS}
    .ob__line, .ob__fill { position: absolute; left: 21.8cqw; width: 0.4cqw; top: ${y0}cqh; height: ${y1 - y0}cqh; border-radius: 99cqw; background: var(--pm-color-line-strong); transform-origin: 50% 0; }
    .ob__fill { background: var(--pm-color-accent); transform: scaleY(0); }
    .ob__node { position: absolute; left: 20cqw; width: 4cqw; height: 4cqw; margin-top: -2cqw; display: grid; place-items: center; border-radius: 50%; background: var(--pm-color-surface); border: 0.3cqw solid var(--pm-color-line-strong); color: var(--pm-color-muted); font-weight: 700; font-size: 1.6cqw; }
    .ob__node svg { position: absolute; width: 56%; height: 56%; color: var(--pm-color-on-accent); opacity: 0; }
    .ob__name { position: absolute; left: 25.5cqw; transform: translateY(-50%); font-size: 1.7cqw; color: var(--pm-color-muted); white-space: nowrap; }
    .ob__card { position: absolute; left: 38cqw; width: 46cqw; top: 24cqh; height: 52cqh; border-radius: 1.6cqw; background: var(--pm-color-surface); border: 0.15cqw solid var(--pm-color-line); box-shadow: ${shadow(1.6)}; overflow: hidden; }
    .ob__page { position: absolute; left: 3cqw; right: 3cqw; top: 5cqh; display: flex; flex-direction: column; gap: 2cqh; }
    .ob__count { font: 1.5cqw var(--pm-font-mono); color: var(--pm-color-accent); }
    .ob__title { font: 600 3.6cqw/1.15 var(--pm-font-serif); }
    .ob__body { font-size: 2cqw; color: var(--pm-color-muted); }
    .ob__btn { position: absolute; right: 3cqw; bottom: 5cqh; height: 8.5cqh; min-width: 13cqw; padding: 0 2cqw; display: grid; place-items: center; border-radius: 0.9cqw; background: var(--pm-color-accent); color: var(--pm-color-on-accent); font-size: 1.9cqw; font-weight: 600; }
    .ob__btn span { grid-area: 1 / 1; }
  `, `
    <i class="ob__line"></i><i class="ob__fill"></i>
    ${steps.map((st, i) => `<div class="ob__node" style="top:${y0 + gap * i}cqh">${i + 1}${check}</div><div class="ob__name" style="top:${y0 + gap * i}cqh">${esc(st.title)}</div>`).join('')}
    <div class="ob__card">
      ${steps.map((st, i) => `<div class="ob__page"><span class="ob__count">${i + 1} / ${n}</span><span class="ob__title">${esc(st.title)}</span>${st.body ? `<span class="ob__body">${esc(st.body)}</span>` : ''}</div>`).join('')}
      <div class="ob__page"><span class="ob__count">${n} / ${n} ✓</span><span class="ob__title">${esc(finish)}</span></div>
      <div class="ob__btn"><span class="ob__next">${esc(next)}</span><span class="ob__start">${esc(start)}</span></div>
    </div>
    <div class="lf-pointer-layer">${POINTER}</div>`)
  const s = (k: number) => at(k) / 1000
  const tl = gsap.timeline()
  const a = atoms(gsap, tl)
  const nodes = [...f.querySelectorAll<HTMLElement>('.ob__node')], names = [...f.querySelectorAll<HTMLElement>('.ob__name')]
  const pages = [...f.querySelectorAll<HTMLElement>('.ob__page')]
  const btn = pick(f, '.ob__btn'), card = pick(f, '.ob__card'), layer = pick(f, '.lf-pointer-layer')
  const light = (i: number, t: number) => {
    tl.to(nodes[i]!, { backgroundColor: color('accent'), borderColor: color('accent'), color: color('on-accent'), duration: 0.15 }, t)
    tl.to(nodes[i]!, { keyframes: [{ scale: 1.18, duration: 0.15, ease: 'power2.out' }, { scale: 1, duration: 0.35, ease: 'back.out(3)' }] }, t)
    tl.to(names[i]!, { color: color('ink'), duration: 0.2 }, t)
  }
  const done = (i: number, t: number) => {
    tl.to(nodes[i]!, { color: 'transparent', duration: 0.1 }, t)
    tl.to(nodes[i]!.querySelector('svg'), { opacity: 1, duration: 0.15 }, t + 0.05)
  }
  const swap = (from: number, to: number, t: number) => {
    tl.to(pages[from]!, { autoAlpha: 0, xPercent: -8, duration: DUR.exit, ease: 'power2.in' }, t)
    tl.fromTo(pages[to]!, { autoAlpha: 0, xPercent: 8 }, { autoAlpha: 1, xPercent: 0, duration: DUR.enter, ease: 'expo.out', immediateRender: false }, t + 0.17)
  }
  // step 1: rail and card rise, the first node lights, the pointer reaches the button
  a.enter(['.ob__line', ...nodes, ...names], 0, { from: 'fade', stagger: 0.04, duration: 0.3 })
  a.enter(card, 0.1)
  pages.forEach((p, i) => { if (i > 0) gsap.set(p, { autoAlpha: 0 }) })
  gsap.set('.ob__start', { autoAlpha: 0 })
  light(0, 0.45)
  const bx = 38 + 46 - 3 - 6.5, by = 24 + 52 - 5 - 4.25
  gsap.set(layer, { xPercent: 92, yPercent: 96, autoAlpha: 0 })
  tl.to(layer, { autoAlpha: 1, duration: 0.2 }, 0.4)
  a.point(layer, Math.max(0.5, s(1) - 0.75), bx + 1.5, by + 1)
  // each press: the rail fills to the next node, the card turns the page
  for (let k = 1; k <= n; k++) {
    const t = s(k)
    a.click('.lf-pointer', '.lf-pointer__ring', btn, t)
    done(k - 1, t + 0.15)
    if (k < n) {
      tl.to('.ob__fill', { scaleY: (k * gap) / (y1 - y0), duration: 0.45, ease: 'power2.inOut' }, t + 0.15)
      swap(k - 1, k, t + 0.15)
      light(k, t + 0.6)
    } else {
      swap(k - 1, n, t + 0.15)
      tl.to('.ob__next', { autoAlpha: 0, yPercent: -30, duration: DUR.exit, ease: 'power2.in' }, t + 0.15)
      tl.fromTo('.ob__start', { autoAlpha: 0, yPercent: 30 }, { autoAlpha: 1, yPercent: 0, duration: DUR.enter, ease: 'expo.out', immediateRender: false }, t + 0.35)
      a.point(layer, t + 0.4, 90, 88)
    }
  }
  return tl
})
