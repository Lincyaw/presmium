// The product in the story: the teacher marks a paragraph and asks for an animation, the AI makes the change, and the
// one lesson is then taught in class, read on a website and sent as a video. The screens show captured states of the
// real studio, presentation and website; only the transitions between them are animated here.
import { brandMarkup, iconMarkup } from '@lincyaw/design'
import { asset, at, image, laptop, LAPTOP_SCREEN as S, line, nightRoom, onScreen, type Shot } from './film-kit.ts'

/** The camera on a point of the laptop's screen; zoomed in, it stays within the screen instead of showing the room. */
const cam = (x: number, y: number, s: number) => {
  const p = onScreen(S, x, y), half = 0.5 / s
  const keep = (v: number, from: number, size: number) => size >= 2 * half ? Math.min(Math.max(v, from + half), from + size - half) : v
  return { x: keep(p.x, S.x, S.w), y: keep(p.y, S.y, S.h), s }
}

// Capture coordinates (CSS pixels of 1600 × 900): the two lines of the picked paragraph, the comment button of the
// selection toolbar, the comment box and its save button, the AI Assistant's composer and send button.
const LINES = [[558.5, 356.8, 709.8, 24], [558.5, 380.8, 454.1, 24]] as const
const COMMENT_FRAMES = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32, 33]
const clipOf = ([x, y, w, h]: readonly number[], i: number) =>
  `<div class="a-sel a-sel${i + 1}" style="${at(x!, y!, w!, h!)}"><img src="${asset('studio-selected')}" alt="" style="left:${-x! / w! * 100}%;top:${-y! / h! * 100}%;width:${1600 / w! * 100}%;height:${900 / h! * 100}%"></div>`

/** 11–19 s. That night, at the laptop: the teacher picks the paragraph and writes what it should become. */
export const ask: Shot = {
  css: `
    .a-sel { position: absolute; overflow: hidden; }
    .a-sel img { position: absolute; max-width: none; }
    .pf .a-frame { position: absolute; left: ${609.5 / 16}%; top: ${413 / 9}%; width: ${352 / 16}%; height: auto; }
  `,
  stage: `${nightRoom()}<div class="pf-mug"></div>${laptop(`
    ${image('studio-before')}${LINES.map(clipOf).join('')}${image('studio-selected', 'pf-fill a-selected')}
    ${image('studio-comment', 'pf-fill a-comment')}${COMMENT_FRAMES.map(i => image(`comment-${String(i).padStart(2, '0')}`, `a-frame a-f${i}`)).join('')}
    ${image('studio-commented', 'pf-fill a-commented')}`)}`,
  over: `${line('这次换个讲法。', 'pf-line--night a-line1')}${line('想改哪儿，圈出来说一句。', 'a-line2')}`,
  play(k, gsap, tl) {
    k.camSet({ x: 0.5, y: 0.5, s: 1 })
    k.say('.a-line1', 0.25, 2.5)
    k.cam(0.7, cam(913, 381, 2.3), 0.9)
    // Drag across both lines; the real selection is uncovered under the pointer, then the toolbar appears.
    const [l1, l2] = LINES
    k.pointerAt(1.25, onScreen(S, 820, 520))
    k.point(1.3, onScreen(S, l1[0] + 2, l1[1] + 12), 0.35)
    k.wipe('.a-sel1', 1.7, 0.35)
    k.point(1.7, onScreen(S, l1[0] + l1[2], l1[1] + 12), 0.35, 'none')
    k.wipe('.a-sel2', 2.05, 0.25)
    k.point(2.05, onScreen(S, l2[0] + l2[2], l2[1] + 12), 0.25, 'none')
    k.show('.a-selected', 2.35)
    k.point(2.45, onScreen(S, 1091, 331), 0.4)
    k.click(2.9)
    // The comment box, typed into: each frame is the real box after two more characters.
    k.show('.a-comment', 2.95)
    k.cam(2.95, cam(850, 445, 2.4), 0.7)
    k.point(3.05, onScreen(S, 1010, 640), 0.5)
    COMMENT_FRAMES.forEach((i, j) => {
      const el = `.a-f${i}`
      k.show(el, j ? 3.15 + j * 0.125 : 2.95)
      if (j < COMMENT_FRAMES.length - 1) k.hide(el, 3.15 + (j + 1) * 0.125 + 0.01)
    })
    k.point(5.45, onScreen(S, 921.5, 518), 0.4)
    k.click(5.9)
    // Saved: the paragraph is marked and the comment sits beside it, waiting.
    k.show('.a-commented', 6.0)
    k.hide(`.a-f33`, 6.0)
    k.cam(6.0, cam(985, 345, 1.95), 0.8)
    k.pointerOff(6.05)
    k.say('.a-line2', 6.1)
  },
}

// The preview's own step buttons under the animation: button n is at x = 424 + 34(n − 1), y = 714.
const stepButton = (n: number) => onScreen(S, 424 + 34 * (n - 1), 714)

/** 19–26 s. The teacher asks the AI Assistant to work through the comment; the page comes back with the animation. */
export const done: Shot = {
  css: `
    .d-typed { position: absolute; overflow: hidden; }
    .d-typed img { position: absolute; max-width: none; }
    .d-sweep { position: absolute; left: 0; right: 0; top: 0; height: 40%; background: linear-gradient(180deg, transparent, color-mix(in srgb, var(--pm-color-sheen) 85%, transparent) 55%, transparent); }
  `,
  stage: `${nightRoom()}<div class="pf-mug"></div>${laptop(`
    ${image('studio-ai')}
    <div class="d-typed" style="${at(1216, 480, 357, 52)}"><img src="${asset('studio-ai-typed')}" alt="" style="left:${-1216 / 357 * 100}%;top:${-480 / 52 * 100}%;width:${1600 / 357 * 100}%;height:${900 / 52 * 100}%"></div>
    ${image('studio-ai-typed', 'pf-fill d-ready')}${image('studio-ai-working', 'pf-fill d-working')}
    ${image('studio-after', 'pf-fill d-after')}${[2, 3, 4].map(n => image(`studio-after-${n}`, `pf-fill d-after${n}`)).join('')}
    <div class="d-sweep"></div>`)}`,
  over: line('剩下的，交给 AI。'),
  play(k, gsap, tl) {
    k.camSet(cam(1390, 470, 2.4))
    k.pointerAt(0.15, onScreen(S, 1330, 640))
    k.point(0.2, onScreen(S, 1300, 506), 0.35)
    k.click(0.6)
    k.wipe('.d-typed', 0.7, 0.55)
    k.show('.d-ready', 1.3)
    k.point(1.3, onScreen(S, 1552, 561.5), 0.3)
    k.click(1.65)
    k.show('.d-working', 1.75)
    k.cam(1.75, cam(1400, 330, 1.9), 0.7)
    k.pointerOff(1.8)
    k.say('.pf-line', 1.9, 4.3)
    // The AI's revision arrives: a light passes down the page and the animation is there, recorded in the history.
    k.cam(2.45, { x: 0.5, y: 0.44, s: 1.25 }, 0.7)
    gsap.set('.d-sweep', { yPercent: -100, autoAlpha: 0 })
    tl.to('.d-sweep', { yPercent: 250, autoAlpha: 1, duration: 0.7, ease: 'power1.inOut' }, 2.6)
    tl.to('.d-sweep', { autoAlpha: 0, duration: 0.15 }, 3.15)
    k.show('.d-after', 2.85, 0.25)
    k.cam(3.4, cam(1450, 190, 2.6), 0.7)
    k.cam(4.4, cam(760, 500, 1.9), 0.8)
    // Pressing the preview's steps plays the comparison, a step at a time.
    k.pointerAt(4.75, onScreen(S, 640, 790))
    ;[2, 3, 4].forEach((n, i) => {
      const t = 4.8 + i * 0.55
      k.point(t, stepButton(n), i ? 0.25 : 0.3)
      k.click(t + 0.3)
      k.show(`.d-after${n}`, t + 0.38)
    })
    k.point(6.35, onScreen(S, 700, 790), 0.4)
  },
}

const icon = (name: 'slides' | 'website' | 'video') => `<span class="f-icon">${iconMarkup(name, '100%', 1.8)}</span>`
const FORMS = [
  ['slides', '上课放映', image('slide-8', 'f-thumb')],
  ['website', '做成网站', image('web-page', 'f-thumb f-top')],
  ['video', '导出视频', `${image('lesson-04', 'f-thumb')}<span class="f-play"></span>`],
] as const

/** 26–29 s. The one lesson becomes three things to use. */
export const forms: Shot = {
  css: `
    .f-doc { position: absolute; left: 39cqw; top: 22cqh; width: 22cqw; padding: 1.4cqw; border-radius: 1.2cqw; background: var(--pm-color-sheen);
      box-shadow: 0 2cqw 5cqw color-mix(in srgb, var(--pm-color-film-ink) 14%, transparent); }
    .f-doc h3 { margin: 0 0 1cqw; font-size: 1.5cqw; }
    .f-doc-img { width: 100%; border-radius: 0.4cqw; }
    .f-doc i { display: block; height: 0.7cqw; margin-top: 0.7cqw; border-radius: 99cqw; background: var(--pm-color-film-silver); }
    .f-card { position: absolute; top: 24cqh; width: 26cqw; border-radius: 1.2cqw; overflow: hidden; background: var(--pm-color-sheen);
      box-shadow: 0 0.4cqw 1cqw color-mix(in srgb, var(--pm-color-film-ink) 8%, transparent), 0 2.4cqw 5cqw color-mix(in srgb, var(--pm-color-film-ink) 14%, transparent); }
    .f-media { position: relative; aspect-ratio: 16 / 9; overflow: hidden; border-bottom: 0.1cqw solid var(--pm-color-film-silver); }
    .pf .f-thumb { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .f-top { object-position: 50% 0; }
    .f-play { position: absolute; left: 50%; top: 50%; width: 3.6cqw; height: 3.6cqw; margin: -1.8cqw 0 0 -1.8cqw; border-radius: 50%; background: color-mix(in srgb, var(--pm-color-film-ink) 62%, transparent); }
    .f-play::after { content: ''; position: absolute; left: 1.45cqw; top: 1.05cqw; border-left: 1.3cqw solid var(--pm-color-sheen); border-top: 0.75cqw solid transparent; border-bottom: 0.75cqw solid transparent; }
    .f-label { display: flex; align-items: center; gap: 0.9cqw; padding: 1.3cqw 1.5cqw; font-size: 2cqw; font-weight: 600; }
    .f-icon { width: 2.2cqw; height: 2.2cqw; color: var(--pm-color-film-violet); }
    .f-icon svg { display: block; width: 100%; height: 100%; }
  `,
  stage: `<div class="pf-fill pf-day"></div>
    <div class="f-doc"><h3>学习率，怎样改变一条预测线？</h3>${image('slide-8', 'f-doc-img')}<i></i><i style="width:70%"></i></div>
    ${FORMS.map(([name, label, media], i) => `<div class="f-card f-card${i}" style="left:${7 + i * 30}cqw"><div class="f-media">${media}</div><div class="f-label">${icon(name)}${label}</div></div>`).join('')}`,
  pointer: 'none',
  play(k, gsap, tl) {
    k.camSet({ x: 0.5, y: 0.5, s: 1 })
    k.cam(0, { x: 0.5, y: 0.5, s: 1.03 }, 3, 'sine.inOut')
    k.enter('.f-doc', 0.05, { scale: 0.9, yPercent: 6 }, 0.45)
    tl.to('.f-doc', { scale: 0.7, autoAlpha: 0, duration: 0.35, ease: 'power2.in' }, 0.8)
    ;[0, 1, 2].forEach(i => {
      gsap.set(`.f-card${i}`, { autoAlpha: 0, xPercent: (1 - i) * 115, scale: 0.6 })
      tl.to(`.f-card${i}`, { autoAlpha: 1, xPercent: 0, scale: 1, duration: 0.6, ease: 'power3.out' }, 0.85 + i * 0.07)
    })
  },
}

/** 29–39 s. Next morning, in class: each press of the clicker is one step on the screen. */
export const lesson: Shot = {
  css: `
    .c-wall { background: linear-gradient(180deg, color-mix(in srgb, var(--pm-color-film-silver) 80%, var(--pm-color-film-paper)), var(--pm-color-film-silver)); }
    .c-screen { position: absolute; left: 20cqw; top: 7cqh; width: 60cqw; height: 60cqh; background: var(--pm-color-sheen); box-shadow: 0 0 0 0.5cqw color-mix(in srgb, var(--pm-color-film-dusk) 25%, var(--pm-color-film-silver)), 0 2cqw 6cqw color-mix(in srgb, var(--pm-color-film-ink) 14%, transparent); }
    .c-roller { position: absolute; left: 18.5cqw; top: 3.4cqh; width: 63cqw; height: 2.6cqh; border-radius: 99cqw; background: color-mix(in srgb, var(--pm-color-film-dusk) 60%, var(--pm-color-film-silver)); }
    .c-row { position: absolute; left: 0; right: 0; display: flex; justify-content: center; }
    .c-back { bottom: 6cqh; gap: 5cqw; }
    .c-front { bottom: -4cqh; gap: 7cqw; }
    .c-kid { position: relative; width: 11cqw; height: 13cqw; transform-origin: 50% 100%; --kid: var(--pm-color-film-dusk); }
    .c-kid b { position: absolute; left: 50%; top: 0; width: 5.2cqw; height: 5.2cqw; margin-left: -2.6cqw; border-radius: 50%; background: var(--kid); }
    .c-kid i { position: absolute; left: 0; right: 0; top: 4.4cqw; bottom: 0; border-radius: 4cqw 4cqw 0 0; background: var(--kid); }
    .c-back .c-kid { width: 8.5cqw; height: 10cqw; --kid: color-mix(in srgb, var(--pm-color-film-dusk) 55%, var(--pm-color-film-silver)); }
    .c-back .c-kid b { width: 4cqw; height: 4cqw; margin-left: -2cqw; }
    .c-back .c-kid i { top: 3.4cqw; }
    .c-oh { position: absolute; left: 31cqw; top: 66cqh; padding: 0.5cqw 1.2cqw; border-radius: 1.2cqw 1.2cqw 1.2cqw 0.2cqw; background: var(--pm-color-sheen); font-size: 1.7cqw; font-weight: 600;
      box-shadow: 0 0.4cqw 1.4cqw color-mix(in srgb, var(--pm-color-film-ink) 16%, transparent); }
    .c-hand { position: absolute; left: 84cqw; top: 70cqh; width: 12cqw; height: 34cqh; transform: rotate(-18deg); transform-origin: 50% 100%; }
    .c-sleeve { position: absolute; left: 3cqw; top: 8cqh; width: 6.4cqw; height: 30cqh; border-radius: 1.6cqw 1.6cqw 0 0; background: var(--pm-color-film-violet); }
    .c-fist { position: absolute; left: 2.6cqw; top: 3.6cqh; width: 7.2cqw; height: 8cqh; border-radius: 2.4cqw 2.4cqw 1.6cqw 1.6cqw; background: color-mix(in srgb, var(--pm-color-film-wood) 55%, var(--pm-color-film-lamp)); }
    .c-clicker { position: absolute; left: 4.4cqw; top: 0; width: 3.6cqw; height: 9cqh; border-radius: 1.6cqw 1.6cqw 0.8cqw 0.8cqw; background: var(--pm-color-film-ink); }
    .c-btn { position: absolute; left: 1cqw; top: 1.3cqh; width: 1.6cqw; height: 1.6cqw; border-radius: 50%; background: var(--pm-color-film-lamp); }
    .c-ring { position: absolute; left: -0.2cqw; top: -0.8cqh; width: 4cqw; height: 4cqw; border-radius: 50%; border: 0.25cqw solid var(--pm-color-film-lamp); }
  `,
  stage: `<div class="pf-fill c-wall"></div><div class="c-roller"></div>
    <div class="c-screen">${Array.from({ length: 9 }, (_, i) => image(`slide-${i}`, `pf-fill c-slide c-s${i}`)).join('')}</div>
    <div class="c-row c-back">${Array.from({ length: 6 }, (_, i) => `<div class="c-kid c-b${i}"><b></b><i></i></div>`).join('')}</div>
    <div class="c-row c-front">${Array.from({ length: 5 }, (_, i) => `<div class="c-kid c-k${i}"><b></b><i></i></div>`).join('')}</div>
    <div class="c-oh">哦——</div>
    <div class="c-hand"><div class="c-sleeve"></div><div class="c-clicker"><div class="c-btn"></div><div class="c-ring"></div></div><div class="c-fist"></div></div>`,
  over: line('上课，按一下走一步。'),
  pointer: 'none',
  play(k, gsap, tl) {
    k.camSet({ x: 0.5, y: 0.5, s: 1 })
    k.cam(0.6, { x: 0.5, y: 0.4, s: 1.3 }, 1.3)
    k.say('.pf-line', 0.4, 3.3)
    const slides = Array.from({ length: 9 }, (_, i) => `.c-s${i}`)
    gsap.set(slides.slice(1), { autoAlpha: 0 })
    gsap.set('.c-ring', { autoAlpha: 0, scale: 0.4 })
    const press = (t: number, step: number) => {
      tl.to('.c-btn', { keyframes: [{ scale: 0.75, duration: 0.08 }, { scale: 1, duration: 0.2, ease: 'back.out(3)' }] }, t)
      tl.fromTo('.c-ring', { autoAlpha: 0.9, scale: 0.4 }, { autoAlpha: 0, scale: 1.6, duration: 0.45, ease: 'power2.out', immediateRender: false }, t)
      tl.to('.c-hand', { keyframes: [{ rotation: -21, duration: 0.08 }, { rotation: -18, duration: 0.2 }] }, t)
      k.show(slides[step]!, t + 0.1, 0.12)
      if (step > 0) k.hide(slides[step - 1]!, t + 0.22)
    }
    // Learning rate 2.2: the line swings past the data, farther each step, and the loss climbs.
    ;[1.5, 2.4, 3.3].forEach((t, i) => press(t, i + 1))
    tl.to(['.c-k1', '.c-b2'], { rotation: 7, duration: 0.35, ease: 'power2.out' }, 3.9)
    tl.to(['.c-k3', '.c-b4'], { rotation: -7, duration: 0.35, ease: 'power2.out' }, 4.0)
    tl.to(['.c-k1', '.c-b2', '.c-k3', '.c-b4'], { rotation: 0, duration: 0.4, ease: 'power2.inOut' }, 4.9)
    // Back to the same start with 0.35: the line settles onto the data.
    ;[5.0, 5.6, 6.2, 6.8, 7.4].forEach((t, i) => press(t, i + 4))
    k.cam(7.5, { x: 0.52, y: 0.52, s: 1.04 }, 1.4)
    tl.to(['.c-k0', '.c-k2', '.c-k4', '.c-b1', '.c-b3'], { keyframes: [{ yPercent: 4, duration: 0.15 }, { yPercent: 0, duration: 0.25 }, { yPercent: 4, duration: 0.15 }, { yPercent: 0, duration: 0.25 }], stagger: 0.06 }, 7.8)
    k.enter('.c-oh', 8.0, { scale: 0.5, yPercent: 30 }, 0.4)
  },
}

/** 39–44.5 s. After class the lesson is a page of the course website; a student scrolls to the animation. */
export const website: Shot = {
  css: `
    .w-win { left: 16cqw; top: 6cqh; width: 68cqw; height: calc(42.5cqw + 2.8cqw); }
    .w-win .pf-browser-bar { height: 2.8cqw; }
    .w-view { position: absolute; left: 0; right: 0; top: 2.8cqw; bottom: 0; overflow: hidden; }
    .pf .w-page { position: absolute; left: 0; top: 0; width: 100%; height: auto; }
  `,
  stage: `<div class="pf-fill pf-day"></div><div class="pf-browser w-win"><div class="pf-browser-bar"><i></i><i></i><i></i><span>/course/learn/</span></div>
    <div class="w-view">${image('web-page', 'w-page')}</div></div>`,
  over: line('课后打开网站，随时翻看。'),
  pointer: 'none',
  play(k, gsap, tl) {
    k.camSet({ x: 0.5, y: 0.5, s: 1 })
    k.cam(0.4, { x: 0.5, y: 0.5, s: 1.08 }, 5, 'sine.inOut')
    k.enter('.w-win', 0, { yPercent: 6 }, 0.5)
    k.say('.pf-line', 0.6)
    // The page is 2245 CSS pixels tall; scroll until the comparison's heading is near the top.
    tl.to('.w-page', { yPercent: -530 / 2245 * 100, duration: 1.4, ease: 'power2.inOut' }, 0.9)
  },
}

/** 54–60 s. The name, the promise, and where it stands. */
export const brand: Shot = {
  css: `
    .br-name { position: absolute; left: 0; right: 0; top: 30cqh; display: flex; align-items: center; justify-content: center; gap: 1.8cqw; }
    .br-mark { width: 6.4cqw; height: 6.4cqw; }
    .br-mark svg { display: block; width: 100%; height: 100%; }
    .br-word { font-size: 5.6cqw; font-weight: 700; letter-spacing: -0.01em; }
    .br-promise { position: absolute; left: 0; right: 0; top: 52cqh; text-align: center; font-size: 3.4cqw; font-weight: 600; letter-spacing: 0.06em; }
    .br-note { position: absolute; left: 0; right: 0; top: 66cqh; text-align: center; font-size: 1.6cqw; color: color-mix(in srgb, var(--pm-color-film-ink) 55%, transparent); letter-spacing: 0.08em; }
  `,
  stage: `<div class="pf-fill pf-day"></div><div class="br-name"><span class="br-mark">${brandMarkup()}</span><span class="br-word">Presmium</span></div>
    <div class="br-promise">难讲的课，也能讲明白。</div><div class="br-note">开源 · 免费使用</div>`,
  pointer: 'none',
  play(k) {
    k.camSet({ x: 0.5, y: 0.5, s: 1 })
    k.cam(0, { x: 0.5, y: 0.5, s: 1.025 }, 6, 'sine.inOut')
    k.enter('.br-mark', 0.15, { scale: 0.5 }, 0.55)
    k.enter('.br-word', 0.4, { xPercent: -6 }, 0.55)
    k.enter('.br-promise', 1.0, { yPercent: 40 }, 0.6)
    k.enter('.br-note', 1.6, { yPercent: 30 }, 0.5)
  },
}
