// The product in the story: the teacher marks a paragraph and asks for an animation, the AI makes the change, and the
// one lesson is then taught in class and read on a website. The screens show captured states of the real studio,
// presentation and website; only the transitions between them are animated here. Each of these is a part of the
// film's one continuous scene (`film.ts`): its `.pf-hero` is the chart the camera carries from one place to the next.
import { brandMarkup } from '@lincyaw/design'
import { asset, at, fit, image, laptop, LAPTOP_DESK_CSS, LAPTOP_SCREEN as S, laptopDesk, line, onScreen, type Shot } from './film-kit.ts'
import { bar, beat, DROP, FADE, T } from './timeline.ts'

/** A part's times: film seconds, less the film time the part starts at. */
const clock = (start: number) => (film: number) => film - start

/** The camera on a point of the laptop's screen; zoomed in, it stays within the screen instead of showing the room. */
const cam = (x: number, y: number, s: number) => {
  const p = onScreen(S, x, y), half = 0.5 / s
  const keep = (v: number, from: number, size: number) => size >= 2 * half ? Math.min(Math.max(v, from + half), from + size - half) : v
  return { x: keep(p.x, S.x, S.w), y: keep(p.y, S.y, S.h), s }
}

// Capture coordinates (CSS pixels of 1600 × 900): the three lines of the picked paragraph, the comment button of the
// selection toolbar, the comment box and its save button, the AI Assistant's composer and send button.
const LINES = [[558.5, 469.3, 666.9, 24], [558.5, 493.3, 717.6, 24], [558.5, 517.3, 140.6, 24]] as const
/** The comment box after every third character of its 54. */
const COMMENT_FRAMES = Array.from({ length: 19 }, (_, i) => i * 3)
const clipOf = ([x, y, w, h]: readonly number[], i: number) =>
  `<div class="a-sel a-sel${i + 1}" style="${at(x!, y!, w!, h!)}"><img src="${asset('studio-selected')}" alt="" style="left:${-x! / w! * 100}%;top:${-y! / h! * 100}%;width:${1600 / w! * 100}%;height:${900 / h! * 100}%"></div>`
// The preview's own step buttons under the animation: button n is at x = 423.5 + 34(n − 1), y = 703.
const stepButton = (n: number) => onScreen(S, 423.5 + 34 * (n - 1), 703)
/** The figure in the preview after the AI's change: the turning circles and the error chart. */
const PREVIEW_FIGURE = at(408.5, 287.3, 704, 396)
/** After the change the canvas scrolls from where the draft stood to the new figure: a capture at each stop. */
const SCROLL_FRAMES = [0, 1, 2, 3]

/**
 * 13.1–29.5 s. That night, at the laptop on the desk: the teacher picks the paragraph and writes what it should become,
 * asks the AI Assistant to apply it, waits through the build, and the turning circles arrive on the drop. Three
 * presses of the preview's steps draw the note with 2, 4 and 8 circles, and the camera pushes into the figure.
 */
export const studio: Shot = {
  css: `${LAPTOP_DESK_CSS}
    .a-sel { position: absolute; overflow: hidden; }
    .a-sel img { position: absolute; max-width: none; }
    .pf .a-frame { position: absolute; left: ${453 / 16}%; top: ${549.5 / 9}%; width: ${352 / 16}%; height: auto; }
    .d-typed { position: absolute; overflow: hidden; }
    .d-typed img { position: absolute; max-width: none; }
    .d-sweep { position: absolute; left: 0; right: 0; top: 0; height: 40%; background: linear-gradient(180deg, transparent, color-mix(in srgb, var(--pm-color-sheen) 85%, transparent) 55%, transparent); }
  `,
  stage: `${laptopDesk()}${laptop(`
    ${image('studio-before')}${LINES.map(clipOf).join('')}${image('studio-selected', 'pf-fill a-selected')}
    ${image('studio-comment', 'pf-fill a-comment')}${COMMENT_FRAMES.map(i => image(`comment-${String(i).padStart(2, '0')}`, `a-frame a-f${i}`)).join('')}
    ${image('studio-commented', 'pf-fill a-commented')}
    ${image('studio-ai', 'pf-fill d-ai')}
    <div class="d-typed" style="${at(1216, 494, 357, 52)}"><img src="${asset('studio-ai-typed')}" alt="" style="left:${-1216 / 357 * 100}%;top:${-494 / 52 * 100}%;width:${1600 / 357 * 100}%;height:${900 / 52 * 100}%"></div>
    ${image('studio-ai-typed', 'pf-fill d-ready')}${image('studio-ai-working', 'pf-fill d-working')}
    ${SCROLL_FRAMES.map(i => image(`studio-after-s${i}`, `pf-fill d-scroll d-s${i}`)).join('')}${image('studio-after', 'pf-fill d-after')}${[2, 3, 4].map(n => image(`studio-after-${n}`, `pf-fill d-after${n}`)).join('')}
    <div class="d-sweep"></div><div class="pf-hero" style="${PREVIEW_FIGURE}"></div>`)}`,
  over: `${line('This time, show it.', 'pf-line--night a-line1')}${line('Mark the spot. Say what you want.', 'a-line2')}${line('The AI does the rest.', 'd-line')}`,
  play(k, gsap, tl) {
    const t = clock(T.studio)
    k.camSet({ x: 0.5, y: 0.5, s: 1 })
    k.say('.a-line1', 0.25, 2.3)
    k.cam(0.7, cam(920, 505, 2.2), 0.9)
    // Drag across the lines; the real selection is uncovered under the pointer, then the toolbar appears.
    const [l1, l2, l3] = LINES
    k.pointerAt(1.2, onScreen(S, 820, 650))
    k.point(1.25, onScreen(S, l1[0] + 2, l1[1] + 12), 0.35)
    k.wipe('.a-sel1', 1.62, 0.26)
    k.point(1.62, onScreen(S, l1[0] + l1[2], l1[1] + 12), 0.26, 'none')
    k.wipe('.a-sel2', 1.88, 0.24)
    k.point(1.88, onScreen(S, l2[0] + l2[2], l2[1] + 12), 0.24, 'none')
    k.wipe('.a-sel3', 2.12, 0.16)
    k.point(2.12, onScreen(S, l3[0] + l3[2], l3[1] + 12), 0.16, 'none')
    k.show('.a-selected', 2.3)
    const comment = t(T.commentClick)
    k.point(comment - 0.4, onScreen(S, 1127, 443.5), 0.35)
    k.click(comment)
    // The comment box, typed into: each frame is the real box after three more characters.
    k.show('.a-comment', comment + 0.05)
    k.cam(comment + 0.05, cam(700, 600, 2.4), 0.7)
    k.point(comment + 0.15, onScreen(S, 900, 740), 0.5)
    COMMENT_FRAMES.forEach((i, j) => {
      k.show(`.a-f${i}`, j ? comment + 0.25 + j * 0.125 : comment + 0.05)
      if (j < COMMENT_FRAMES.length - 1) k.hide(`.a-f${i}`, comment + 0.25 + (j + 1) * 0.125 + 0.01)
    })
    const save = t(T.saveClick)
    k.point(save - 0.45, onScreen(S, 763.5, 654.5), 0.4)
    k.click(save)
    // Saved: the paragraph is marked and the comment sits beside it, waiting.
    k.show('.a-commented', save + 0.08)
    k.hide(`.a-f${COMMENT_FRAMES.at(-1)}`, save + 0.08)
    k.cam(save + 0.08, cam(985, 400, 1.95), 0.8)
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
    // On the drop the page is back with the figure below the paragraph, scrolls to it, and a light passes down it once.
    const drop = t(DROP)
    SCROLL_FRAMES.forEach(i => k.show(`.d-s${i}`, drop + i * 0.08))
    k.show('.d-after', drop + SCROLL_FRAMES.length * 0.08)
    gsap.set('.d-sweep', { yPercent: -100, autoAlpha: 0 })
    tl.to('.d-sweep', { yPercent: 250, autoAlpha: 1, duration: 0.55, ease: 'power1.out' }, drop)
    tl.to('.d-sweep', { autoAlpha: 0, duration: 0.15 }, drop + 0.45)
    k.cam(drop, cam(760, 500, 1.9), 0.5, 'expo.out')
    // Pressing the preview's steps draws the note with 2, 4 and 8 circles, one step a beat.
    k.pointerAt(drop + 0.1, onScreen(S, 600, 780))
    T.previewClicks.forEach((press, i) => {
      k.point(t(press) - 0.32, stepButton(i + 2), 0.28)
      k.click(t(press))
      k.show(`.d-after${i + 2}`, t(press) + 0.06)
    })
    k.point(t(T.previewClicks[2]) + 0.25, onScreen(S, 640, 790), 0.35)
    k.pointerOff(t(T.pushToLesson) - 0.15)
  },
}

/** The slide is the figure, edge to edge: the same figure the studio previewed. */
const SLIDE_FIGURE = 'left:0;top:0;width:100%;height:100%'
/** The slides of the fit section, N = 1, 2, 4 … 64, each at its finished frame. */
const SLIDES = 7

/**
 * The projected picture in the lecture-hall photograph, in frame percentages: the screen faces the camera nearly
 * square on, so the 16:9 slides sit on it as an axis-aligned box. The heads and the pendant lamp in front of it are cut
 * from the same photograph (`photo-lecture-front`) and lie over the slides.
 */
const PROJECTION = 'left:23.743cqw;top:20.4cqh;width:42.163cqw;height:42.152cqh'

/**
 * 29.2–41.5 s. Next morning, in class: the studio's chart becomes the slide's chart on the projection screen, the
 * camera pulls out to the room, and each press of the clicker is one step on the screen.
 */
export const lesson: Shot = {
  css: `
    .c-screen { position: absolute; ${PROJECTION}; background: var(--pm-color-sheen); filter: brightness(0.97) sepia(0.06); }
    .c-oh { position: absolute; left: 41cqw; top: 62.5cqh; padding: 0.45cqw 1.1cqw; border-radius: 1.1cqw 1.1cqw 1.1cqw 0.2cqw; background: var(--pm-color-sheen); font-size: 1.9cqw; font-weight: 600;
      box-shadow: 0 0.4cqw 1.4cqw color-mix(in srgb, var(--pm-color-film-night) 40%, transparent); }
  `,
  stage: `${image('photo-lecture-hall', 'pf-fill pf-photo')}
    <div class="c-screen">${Array.from({ length: SLIDES }, (_, i) => image(`slide-${i}`, `pf-fill c-slide c-s${i}`)).join('')}<div class="pf-hero" style="${SLIDE_FIGURE}"></div></div>
    ${image('photo-lecture-front', 'pf-fill pf-photo')}
    <div class="c-oh">Oh, I see!</div>`,
  over: line('In class: one click, one step.'),
  pointer: 'none',
  play(k, gsap, tl) {
    const t = clock(T.lessonIn - FADE)
    // While the steps play the screen is about two thirds of the frame, with the audience's heads below it.
    const steps = fit(k.measure('.pf-hero'), { x: 0.5, y: 0.4, w: 0.64 })
    k.cam(FADE, steps, bar(14) - T.lessonIn, 'power2.inOut')
    k.say('.pf-line', t(bar(14)) + 0.05, t(beat(62)) - 0.45)
    // The clicker is off screen; each press (and its sound, in the score) is one step on the slide.
    const slides = Array.from({ length: SLIDES }, (_, i) => `.c-s${i}`)
    gsap.set(slides.filter((_, i) => i !== T.firstSlide), { autoAlpha: 0 })
    T.clicker.forEach((at, i) => {
      const step = T.firstSlide + 1 + i
      k.show(slides[step]!, t(at) + 0.06, 0.1)
      k.hide(slides[step - 1]!, t(at) + 0.16)
    })
    // The payoff on the bar, then nothing moves.
    k.enter('.c-oh', t(T.aha), { scale: 0.5, yPercent: 30 }, 0.4)
  },
}

/** The course web page is 3693 CSS pixels tall at 1440 wide; it is already scrolled to the figure, set to N = 64. */
const PAGE = { width: 1440, height: 3693, scroll: 1190, chart: [392, 1605.2, 704, 396] as const }
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
