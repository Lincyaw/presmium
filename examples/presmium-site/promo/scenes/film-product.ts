// The product in the story: the teacher marks a paragraph and asks for an animation, the AI makes the change, and the
// one lesson is then taught in class and read on a website. The screens show captured states of the real studio,
// presentation and website; only the transitions between them are animated here. Each of these is a part of the
// film's one continuous scene (`film.ts`): its `.pf-hero` is the chart the camera carries from one place to the next.
import { brandMarkup } from '@lincyaw/design'
import { asset, at, fit, image, laptop, LAPTOP_SCREEN as S, line, nightRoom, onScreen, type Shot } from './film-kit.ts'
import { bar, beat, DROP, FADE, T } from './timeline.ts'

/** A part's times: film seconds, less the film time the part starts at. */
const clock = (start: number) => (film: number) => film - start

/** The camera on a point of the laptop's screen; zoomed in, it stays within the screen instead of showing the room. */
const cam = (x: number, y: number, s: number) => {
  const p = onScreen(S, x, y), half = 0.5 / s
  const keep = (v: number, from: number, size: number) => size >= 2 * half ? Math.min(Math.max(v, from + half), from + size - half) : v
  return { x: keep(p.x, S.x, S.w), y: keep(p.y, S.y, S.h), s }
}

// Capture coordinates (CSS pixels of 1600 × 900): the two lines of the picked paragraph, the comment button of the
// selection toolbar, the comment box and its save button, the AI Assistant's composer and send button.
const LINES = [[558.5, 260.8, 723.6, 24], [558.5, 284.8, 688.7, 24], [558.5, 308.8, 329.8, 24]] as const
const COMMENT_FRAMES = [0, 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36, 39, 42, 45, 48, 50]
const clipOf = ([x, y, w, h]: readonly number[], i: number) =>
  `<div class="a-sel a-sel${i + 1}" style="${at(x!, y!, w!, h!)}"><img src="${asset('studio-selected')}" alt="" style="left:${-x! / w! * 100}%;top:${-y! / h! * 100}%;width:${1600 / w! * 100}%;height:${900 / h! * 100}%"></div>`
// The preview's own step buttons under the animation: button n is at x = 424 + 34(n − 1), y = 738.
const stepButton = (n: number) => onScreen(S, 424 + 34 * (n - 1), 738)

/**
 * 13.1–29.5 s. That night, at the laptop: the teacher picks the paragraph and writes what it should become, asks the
 * AI Assistant to apply it, waits through the build, and the comparison arrives on the drop. The preview's steps play
 * and the camera pushes into the chart.
 */
export const studio: Shot = {
  css: `
    .a-sel { position: absolute; overflow: hidden; }
    .a-sel img { position: absolute; max-width: none; }
    .pf .a-frame { position: absolute; left: ${547.5 / 16}%; top: ${341 / 9}%; width: ${352 / 16}%; height: auto; }
    .d-typed { position: absolute; overflow: hidden; }
    .d-typed img { position: absolute; max-width: none; }
    .d-sweep { position: absolute; left: 0; right: 0; top: 0; height: 40%; background: linear-gradient(180deg, transparent, color-mix(in srgb, var(--pm-color-sheen) 85%, transparent) 55%, transparent); }
  `,
  stage: `${nightRoom()}<div class="pf-mug"></div>${laptop(`
    ${image('studio-before')}${LINES.map(clipOf).join('')}${image('studio-selected', 'pf-fill a-selected')}
    ${image('studio-comment', 'pf-fill a-comment')}${COMMENT_FRAMES.map(i => image(`comment-${String(i).padStart(2, '0')}`, `a-frame a-f${i}`)).join('')}
    ${image('studio-commented', 'pf-fill a-commented')}
    ${image('studio-ai', 'pf-fill d-ai')}
    <div class="d-typed" style="${at(1216, 494, 357, 52)}"><img src="${asset('studio-ai-typed')}" alt="" style="left:${-1216 / 357 * 100}%;top:${-494 / 52 * 100}%;width:${1600 / 357 * 100}%;height:${900 / 52 * 100}%"></div>
    ${image('studio-ai-typed', 'pf-fill d-ready')}${image('studio-ai-working', 'pf-fill d-working')}
    ${image('studio-after', 'pf-fill d-after')}${[2, 3, 4].map(n => image(`studio-after-${n}`, `pf-fill d-after${n}`)).join('')}
    <div class="d-sweep"></div><div class="pf-hero" style="${at(446.4, 337.6, 608, 288)}"></div>`)}`,
  over: `${line('This time, show it.', 'pf-line--night a-line1')}${line('Mark the spot. Say what you want.', 'a-line2')}${line('The AI does the rest.', 'd-line')}`,
  play(k, gsap, tl) {
    const t = clock(T.studio)
    k.camSet({ x: 0.5, y: 0.5, s: 1 })
    k.say('.a-line1', 0.25, 2.3)
    k.cam(0.7, cam(913, 290, 2.3), 0.9)
    // Drag across the lines; the real selection is uncovered under the pointer, then the toolbar appears.
    const [l1, l2, l3] = LINES
    k.pointerAt(1.2, onScreen(S, 820, 440))
    k.point(1.25, onScreen(S, l1[0] + 2, l1[1] + 12), 0.35)
    k.wipe('.a-sel1', 1.62, 0.26)
    k.point(1.62, onScreen(S, l1[0] + l1[2], l1[1] + 12), 0.26, 'none')
    k.wipe('.a-sel2', 1.88, 0.24)
    k.point(1.88, onScreen(S, l2[0] + l2[2], l2[1] + 12), 0.24, 'none')
    k.wipe('.a-sel3', 2.12, 0.16)
    k.point(2.12, onScreen(S, l3[0] + l3[2], l3[1] + 12), 0.16, 'none')
    k.show('.a-selected', 2.3)
    const comment = t(T.commentClick)
    k.point(comment - 0.4, onScreen(S, 1127, 235), 0.35)
    k.click(comment)
    // The comment box, typed into: each frame is the real box after three more characters.
    k.show('.a-comment', comment + 0.05)
    k.cam(comment + 0.05, cam(850, 360, 2.4), 0.7)
    k.point(comment + 0.15, onScreen(S, 1010, 560), 0.5)
    COMMENT_FRAMES.forEach((i, j) => {
      k.show(`.a-f${i}`, j ? comment + 0.25 + j * 0.125 : comment + 0.05)
      if (j < COMMENT_FRAMES.length - 1) k.hide(`.a-f${i}`, comment + 0.25 + (j + 1) * 0.125 + 0.01)
    })
    const save = t(T.saveClick)
    k.point(save - 0.45, onScreen(S, 858, 446), 0.4)
    k.click(save)
    // Saved: the paragraph is marked and the comment sits beside it, waiting.
    k.show('.a-commented', save + 0.08)
    k.hide('.a-f50', save + 0.08)
    k.cam(save + 0.08, cam(985, 290, 1.95), 0.8)
    k.say('.a-line2', save + 0.15, t(T.sendClick) - 0.3)
    // The AI Assistant opens from its button in the top bar.
    const assistant = t(T.assistantClick)
    k.point(save + 0.5, onScreen(S, 1424, 19), 0.6)
    k.click(assistant)
    k.show('.d-ai', assistant + 0.08)
    k.cam(assistant + 0.1, cam(1390, 480, 2.4), 0.6)
    const composer = t(T.composerClick)
    k.point(assistant + 0.2, onScreen(S, 1300, 520), 0.5)
    k.click(composer)
    k.wipe('.d-typed', composer + 0.1, 0.55)
    k.show('.d-ready', composer + 0.68)
    const send = t(T.sendClick)
    k.point(composer + 0.7, onScreen(S, 1552, 575), 0.3)
    k.click(send)
    k.show('.d-working', send + 0.08)
    k.pointerOff(send + 0.15)
    // The stop-down: the whole screen, still, through the build while the AI works.
    k.cam(send + 0.15, { x: 0.5, y: 0.44, s: 1.25 }, 0.9)
    k.say('.d-line', send + 0.3, t(DROP) - 0.35)
    // On the drop the page is back with the animation; a light passes down it once.
    const drop = t(DROP)
    k.show('.d-after', drop)
    gsap.set('.d-sweep', { yPercent: -100, autoAlpha: 0 })
    tl.to('.d-sweep', { yPercent: 250, autoAlpha: 1, duration: 0.55, ease: 'power1.out' }, drop)
    tl.to('.d-sweep', { autoAlpha: 0, duration: 0.15 }, drop + 0.45)
    k.cam(drop, cam(760, 560, 1.9), 0.5, 'expo.out')
    // Pressing the preview's steps plays the comparison, one step a beat.
    k.pointerAt(drop + 0.1, onScreen(S, 640, 810))
    T.previewClicks.forEach((press, i) => {
      k.point(t(press) - 0.32, stepButton(i + 2), 0.28)
      k.click(t(press))
      k.show(`.d-after${i + 2}`, t(press) + 0.06)
    })
    k.point(t(T.previewClicks[2]) + 0.25, onScreen(S, 700, 830), 0.35)
    k.pointerOff(t(T.pushToLesson) - 0.15)
  },
}

/** The slide's chart, as fractions of the slide: the same figure the studio previewed. */
const SLIDE_CHART = 'left:25%;top:37.78%;width:48.35%;height:40.27%'

/**
 * 29.2–41.5 s. Next morning, in class: the studio's chart becomes the slide's chart on the projector screen, the camera
 * pulls out to the room, and each press of the clicker is one step on the screen.
 */
export const lesson: Shot = {
  css: `
    .c-wall { background: linear-gradient(180deg, color-mix(in srgb, var(--pm-color-film-silver) 80%, var(--pm-color-film-paper)), var(--pm-color-film-silver)); }
    .c-screen { position: absolute; left: 12cqw; top: 4cqh; width: 76cqw; height: 76cqh; background: var(--pm-color-sheen); box-shadow: 0 0 0 0.4cqw color-mix(in srgb, var(--pm-color-film-dusk) 25%, var(--pm-color-film-silver)), 0 2cqw 6cqw color-mix(in srgb, var(--pm-color-film-ink) 14%, transparent); }
    .c-mask { position: absolute; left: 0; right: 0; top: 80%; bottom: 0; background: var(--pm-color-sheen); }
    .c-roller { position: absolute; left: 10.5cqw; top: 1.2cqh; width: 79cqw; height: 2.4cqh; border-radius: 99cqw; background: color-mix(in srgb, var(--pm-color-film-dusk) 60%, var(--pm-color-film-silver)); }
    .c-row { position: absolute; left: 0; right: 0; display: flex; justify-content: center; }
    .c-back { bottom: 17cqh; gap: 3.2cqw; }
    .c-front { bottom: 3cqh; gap: 5cqw; }
    .c-kid { position: relative; width: 9cqw; height: 11cqw; transform-origin: 50% 100%; --kid: var(--pm-color-film-dusk); }
    .c-kid b { position: absolute; left: 50%; top: 0; width: 4.4cqw; height: 4.4cqw; margin-left: -2.2cqw; border-radius: 50%; background: var(--kid); }
    .c-kid i { position: absolute; left: 0; right: 0; top: 3.7cqw; bottom: 0; border-radius: 3.4cqw 3.4cqw 0 0; background: var(--kid); }
    .c-back .c-kid { width: 6.5cqw; height: 8cqw; --kid: color-mix(in srgb, var(--pm-color-film-dusk) 55%, var(--pm-color-film-silver)); }
    .c-back .c-kid b { width: 3.2cqw; height: 3.2cqw; margin-left: -1.6cqw; }
    .c-back .c-kid i { top: 2.7cqw; }
    .c-oh { position: absolute; left: 27cqw; top: 64cqh; padding: 0.4cqw 1cqw; border-radius: 1cqw 1cqw 1cqw 0.2cqw; background: var(--pm-color-sheen); font-size: 1.7cqw; font-weight: 600;
      box-shadow: 0 0.4cqw 1.4cqw color-mix(in srgb, var(--pm-color-film-ink) 16%, transparent); }
    .c-hand { position: absolute; left: 69cqw; top: 66cqh; width: 9cqw; height: 26cqh; transform: rotate(-18deg); transform-origin: 50% 100%; }
    .c-sleeve { position: absolute; left: 2.2cqw; top: 6cqh; width: 4.8cqw; height: 24cqh; border-radius: 1.2cqw 1.2cqw 0 0; background: var(--pm-color-film-violet); }
    .c-fist { position: absolute; left: 1.9cqw; top: 2.7cqh; width: 5.4cqw; height: 6cqh; border-radius: 1.8cqw 1.8cqw 1.2cqw 1.2cqw; background: color-mix(in srgb, var(--pm-color-film-wood) 55%, var(--pm-color-film-lamp)); }
    .c-clicker { position: absolute; left: 3.3cqw; top: 0; width: 2.7cqw; height: 6.8cqh; border-radius: 1.2cqw 1.2cqw 0.6cqw 0.6cqw; background: var(--pm-color-film-ink); }
    .c-btn { position: absolute; left: 0.75cqw; top: 1cqh; width: 1.2cqw; height: 1.2cqw; border-radius: 50%; background: var(--pm-color-film-lamp); }
    .c-ring { position: absolute; left: -0.15cqw; top: -0.6cqh; width: 3cqw; height: 3cqw; border-radius: 50%; border: 0.2cqw solid var(--pm-color-film-lamp); }
  `,
  stage: `<div class="pf-fill c-wall"></div><div class="c-roller"></div>
    <div class="c-screen">${Array.from({ length: 9 }, (_, i) => image(`slide-${i}`, `pf-fill c-slide c-s${i}`)).join('')}<div class="c-mask"></div><div class="pf-hero" style="${SLIDE_CHART}"></div></div>
    <div class="c-row c-back">${Array.from({ length: 7 }, (_, i) => `<div class="c-kid c-b${i}"><b></b><i></i></div>`).join('')}</div>
    <div class="c-row c-front">${Array.from({ length: 5 }, (_, i) => `<div class="c-kid c-k${i}"><b></b><i></i></div>`).join('')}</div>
    <div class="c-oh">Oh, I see!</div>
    <div class="c-hand"><div class="c-sleeve"></div><div class="c-clicker"><div class="c-btn"></div><div class="c-ring"></div></div><div class="c-fist"></div></div>`,
  over: line('In class: one click, one step.'),
  pointer: 'none',
  play(k, gsap, tl) {
    const t = clock(T.lessonIn - FADE)
    // While the steps play the chart is about two thirds of the frame; the heads and the clicker are at its foot.
    const steps = fit(k.measure('.pf-hero'), { x: 0.5, y: 0.42, w: 0.66 })
    k.cam(FADE, steps, bar(14) - T.lessonIn, 'power2.inOut')
    k.say('.pf-line', t(bar(14)) + 0.05, t(beat(62)) - 0.45)
    const slides = Array.from({ length: 9 }, (_, i) => `.c-s${i}`)
    gsap.set(slides.filter((_, i) => i !== T.firstSlide), { autoAlpha: 0 })
    gsap.set('.c-ring', { autoAlpha: 0, scale: 0.4 })
    const press = (at: number, step: number) => {
      tl.to('.c-btn', { keyframes: [{ scale: 0.75, duration: 0.08 }, { scale: 1, duration: 0.2, ease: 'back.out(3)' }] }, at)
      tl.fromTo('.c-ring', { autoAlpha: 0.9, scale: 0.4 }, { autoAlpha: 0, scale: 1.6, duration: 0.45, ease: 'power2.out', immediateRender: false }, at)
      tl.to('.c-hand', { keyframes: [{ rotation: -21, duration: 0.08 }, { rotation: -18, duration: 0.2 }] }, at)
      k.show(slides[step]!, at + 0.06, 0.1)
      k.hide(slides[step - 1]!, at + 0.16)
    }
    // The studio's chart, the line swung past the data at learning rate 2.2: heads tilt. Then 0.35 from the same start.
    const tilt = t(beat(58)) + 0.35
    tl.to(['.c-k1', '.c-b2'], { rotation: 7, duration: 0.35, ease: 'power2.out' }, tilt)
    tl.to(['.c-k3', '.c-b5'], { rotation: -7, duration: 0.35, ease: 'power2.out' }, tilt + 0.1)
    T.clicker.forEach((at, i) => press(t(at), T.firstSlide + 1 + i))
    tl.to(['.c-k1', '.c-b2', '.c-k3', '.c-b5'], { rotation: 0, duration: 0.4, ease: 'power2.inOut' }, t(T.clicker[0]) - 0.5)
    // The payoff on the bar, then nothing moves.
    const aha = t(T.aha)
    k.enter('.c-oh', aha, { scale: 0.5, yPercent: 30 }, 0.4)
    tl.to(['.c-k0', '.c-k2', '.c-k4', '.c-b1', '.c-b3'], { keyframes: [{ yPercent: 4, duration: 0.12 }, { yPercent: 0, duration: 0.2 }], stagger: 0.05 }, aha)
  },
}

/** The course web page is 2385 CSS pixels tall at 1440 wide; it is already scrolled to the comparison. */
const PAGE = { width: 1440, height: 2385, scroll: 560, chart: [429.8, 873.4, 607, 284.4] as const }
const WEB_WIDTH = 68
const pagePx = (px: number) => px / PAGE.width * WEB_WIDTH

/** 41.2–45.8 s. After class the same chart is on the course website, and the camera pulls out to the browser. */
export const website: Shot = {
  css: `
    .w-win { left: 16cqw; top: 6cqh; width: ${WEB_WIDTH}cqw; height: calc(42.5cqw + 2.8cqw); }
    .w-win .pf-browser-bar { height: 2.8cqw; }
    .w-view { position: absolute; left: 0; right: 0; top: 2.8cqw; bottom: 0; overflow: hidden; }
    .w-doc { position: absolute; left: 0; top: ${-pagePx(PAGE.scroll)}cqw; width: 100%; height: ${pagePx(PAGE.height)}cqw; }
    .pf .w-page { position: absolute; left: 0; top: 0; width: 100%; height: auto; }
  `,
  stage: `<div class="pf-fill pf-day"></div><div class="pf-browser w-win"><div class="pf-browser-bar"><i></i><i></i><i></i><span>/course/learn/</span></div>
    <div class="w-view"><div class="w-doc">${image('web-page', 'w-page')}<div class="pf-hero" style="left:${PAGE.chart[0] / PAGE.width * 100}%;top:${PAGE.chart[1] / PAGE.height * 100}%;width:${PAGE.chart[2] / PAGE.width * 100}%;height:${PAGE.chart[3] / PAGE.height * 100}%"></div></div></div></div>`,
  over: line('After class, it\'s all online.'),
  pointer: 'none',
  play(k) {
    const t = clock(T.webIn - FADE)
    k.cam(FADE, { x: 0.5, y: 0.5, s: 1.06 }, bar(20) - T.webIn, 'power2.inOut')
    k.say('.pf-line', t(T.webIn) + 0.3, t(T.pushToVideo) - 0.1)
  },
}

/** 54.5–61.1 s. The promise, one word a beat; then the name, and where it stands, held. */
export const brand: Shot = {
  css: `
    .br-name { position: absolute; left: 0; right: 0; top: 26cqh; display: flex; align-items: center; justify-content: center; gap: 1.8cqw; }
    .br-mark { width: 6.4cqw; height: 6.4cqw; }
    .br-mark svg { display: block; width: 100%; height: 100%; }
    .br-word { font-size: 5.6cqw; font-weight: 700; letter-spacing: -0.01em; }
    .br-promise { position: absolute; left: 0; right: 0; top: 47cqh; display: flex; justify-content: center; gap: 1.1cqw; font-size: 4.4cqw; font-weight: 700; letter-spacing: -0.01em; }
    .br-promise span { display: inline-block; }
    .br-note { position: absolute; left: 0; right: 0; top: 66cqh; text-align: center; font-size: 1.9cqw; color: color-mix(in srgb, var(--pm-color-film-ink) 60%, transparent); letter-spacing: 0.02em; }
  `,
  stage: `<div class="pf-fill pf-day"></div><div class="br-name"><span class="br-mark">${brandMarkup()}</span><span class="br-word">Presmium</span></div>
    <div class="br-promise">${['Make', 'complex', 'things', 'clear.'].map(w => `<span>${w}</span>`).join('')}</div><div class="br-note">Open source · Free to use</div>`,
  pointer: 'none',
  play(k, gsap, tl) {
    const t = clock(T.brand)
    k.camSet({ x: 0.5, y: 0.5, s: 1 })
    // Each word is a hit: it is there on its beat, a little large, and settles at once.
    gsap.utils.toArray<HTMLElement>('.br-promise span').forEach((word, i) => {
      gsap.set(word, { autoAlpha: 0 })
      tl.set(word, { autoAlpha: 1 }, t(T.words[i]!))
      tl.fromTo(word, { scale: 1.14 }, { scale: 1, duration: 0.16, ease: 'power2.out', immediateRender: false }, t(T.words[i]!))
    })
    k.enter('.br-mark', t(T.mark), { scale: 0.5 }, 0.45)
    k.enter('.br-word', t(T.mark) + 0.08, { xPercent: -6 }, 0.45)
    k.enter('.br-note', t(T.note), { yPercent: 30 }, 0.45)
  },
}
