// The story around the product: the student's question at night, the blackboard where it was not answered, the
// video the teacher sends after class, and the reply. One chat thread carries the question to its answer.
import { chat, image, line, message, nightRoom, phone, type Shot } from './film-kit.ts'
import { bar, beat, FADE, T } from './timeline.ts'

const QUESTION = 'Why does a bigger learning rate make training worse, not better?'
const OLD = [
  message({ who: 'wang', text: 'Is assignment 2 due Friday?' }),
  message({ who: 'me', text: 'Yes, by Friday night.' }),
].join('')

/** 0–8.7 s. A phone lights up on a dark desk on the bar; a student's question arrives in the course group on the next. */
export const question: Shot = {
  css: `
    .q-dark { position: absolute; inset: 0; z-index: 2; background: var(--pm-color-film-night); }
    .q-new .pf-bubble { font-weight: 600; }
  `,
  stage: `${nightRoom()}${phone(`${chat('11:40', `<div class="pf-time">11:40 PM</div>${OLD}
    <div class="pf-msg q-typing"><div class="pf-avatar pf-avatar--lin">S</div><div><div class="pf-who">Sam</div><div class="pf-bubble pf-typing"><i></i><i></i><i></i></div></div></div>
    ${message({ who: 'lin', text: QUESTION, className: 'q-new' })}`)}<div class="q-dark"></div>`)}`,
  pointer: 'none',
  play(k, gsap, tl) {
    k.camSet({ x: 0.5, y: 0.5, s: 1 })
    // A slow push while the room wakes and the question lands, then the frame holds still on the question.
    k.cam(0, { x: 0.5, y: 0.47, s: 1.1 }, bar(3), 'sine.inOut')
    gsap.set('.pf-glow', { autoAlpha: 0.35 })
    tl.to('.pf-glow', { autoAlpha: 1, duration: 1.4, ease: 'power1.out' }, 0)
    // The screen wakes and the phone buzzes once.
    tl.to('.q-dark', { autoAlpha: 0, duration: 0.25, ease: 'power1.out' }, T.wake)
    tl.to('.pf-phone', { keyframes: [{ xPercent: -1.2 }, { xPercent: 1.2 }, { xPercent: -0.9 }, { xPercent: 0.9 }, { xPercent: 0 }], duration: 0.32, ease: 'none' }, T.wake)
    // The student is typing, then the question lands where the dots were.
    gsap.set('.q-new', { display: 'none' })
    k.enter('.q-typing', T.typing, { yPercent: 40, scale: 0.9 }, 0.35)
    tl.to('.q-typing .pf-typing i', { yPercent: -60, duration: 0.13, stagger: 0.08, repeat: 5, yoyo: true, ease: 'sine.inOut' }, T.typing + 0.15)
    tl.set('.q-typing', { display: 'none' }, T.question)
    tl.set('.q-new', { display: 'flex' }, T.question)
    k.enter('.q-new', T.question, { yPercent: 25, scale: 0.94 }, 0.5)
    tl.to('.q-new .pf-bubble', { keyframes: [{ scale: 1.04, duration: 0.14, ease: 'power2.out' }, { scale: 1, duration: 0.35, ease: 'back.out(2.5)' }] }, T.question + 0.2)
  },
}

// The chalk drawings: the loss curve L(w) as a parabola, and the steps of a learning rate that is too large, each
// landing farther up the other wall of the valley. Points lie on the drawn curve: x = 380 + 840t, y = 240 + 1520t(1 − t).
const onCurve = (x: number) => { const t = (x - 380) / 840; return 240 + 1520 * t * (1 - t) }
const zigzag = (xs: number[], dy = 0) => xs.map((x, i) => `${i ? 'L' : 'M'}${x} ${onCurve(x) + dy}`).join(' ')
const dots = (xs: number[], cls: string, dy = 0) => xs.map(x => `<circle class="b-dot ${cls}" cx="${x}" cy="${onCurve(x) + dy}" r="9"/>`).join('')
const TRIES = [[560, 1040, 470, 1130], [575, 1030, 455, 1150, 405], [552, 1050, 462, 1140, 398]]

/** 8.7–13.1 s. The blackboard of the last lesson: the same overshoot drawn three times, erased twice, still unclear. */
export const board: Shot = {
  css: `
    .b-board { position: absolute; left: 3cqw; top: 4cqh; right: 3cqw; bottom: 13cqh; border-radius: 0.6cqw; background: var(--pm-color-film-board);
      box-shadow: inset 0 0 0 1.1cqw color-mix(in srgb, var(--pm-color-film-wood) 85%, var(--pm-color-film-night)), inset 0 0 8cqw color-mix(in srgb, var(--pm-color-film-night) 40%, transparent); }
    .b-wall { background: color-mix(in srgb, var(--pm-color-film-silver) 70%, var(--pm-color-film-paper)); }
    .b-tray { position: absolute; left: 2cqw; right: 2cqw; bottom: 10.5cqh; height: 2.6cqh; border-radius: 0.3cqw; background: color-mix(in srgb, var(--pm-color-film-wood) 75%, var(--pm-color-film-night)); }
    .b-svg { position: absolute; left: 3cqw; top: 4cqh; width: 94cqw; height: 83cqh; overflow: visible; }
    .b-chalk { fill: none; stroke: var(--pm-color-film-chalk); stroke-width: 6; stroke-linecap: round; stroke-linejoin: round; opacity: 0.9; }
    .b-axis { stroke-width: 4; opacity: 0.6; }
    .b-yellow { stroke: var(--pm-color-film-lamp); }
    .b-dot { fill: var(--pm-color-film-chalk); }
    .b-dot.b-yellow { fill: var(--pm-color-film-lamp); stroke: none; }
    .b-label { fill: var(--pm-color-film-chalk); font: 600 42px var(--pm-font-sans); opacity: 0.85; }
    .b-smudge { fill: none; stroke: color-mix(in srgb, var(--pm-color-film-chalk) 9%, transparent); stroke-width: 70; stroke-linecap: round; stroke-linejoin: round; }
    .b-eraser { position: absolute; left: 0; top: 0; width: 9cqw; height: 3.4cqw; }
    .b-eraser b { position: absolute; inset: 0 0 38% 0; border-radius: 0.5cqw 0.5cqw 0 0; background: var(--pm-color-film-wood); }
    .b-eraser i { position: absolute; inset: 62% 0 0 0; border-radius: 0 0 0.3cqw 0.3cqw; background: color-mix(in srgb, var(--pm-color-film-chalk) 70%, var(--pm-color-film-silver)); }
    .b-stick { position: absolute; left: 62cqw; bottom: 11.4cqh; width: 4cqw; height: 0.8cqw; border-radius: 0.4cqw; background: var(--pm-color-film-chalk); }
  `,
  stage: `<div class="pf-fill b-wall"></div><div class="b-board"></div><div class="b-tray"></div><div class="b-stick"></div>
    <svg class="b-svg" viewBox="0 0 1600 900" aria-hidden="true">
      <path class="b-chalk b-axis" d="M300 660 H1300 M800 160 V700"/>
      <text class="b-label" x="1310" y="676">w</text><text class="b-label" x="760" y="150">L</text>
      <path class="b-chalk b-curve" d="M380 240 Q800 1000 1220 240"/>
      <g class="b-try b-try1"><path class="b-chalk" d="${zigzag(TRIES[0]!)}"/>${dots(TRIES[0]!, '')}</g>
      <path class="b-smudge b-smudge1" d="M450 470 L1150 420 L470 380 L1170 330"/>
      <g class="b-try b-try2"><path class="b-chalk" d="${zigzag(TRIES[1]!, 8)}"/>${dots(TRIES[1]!, '', 8)}</g>
      <path class="b-smudge b-smudge2" d="M420 500 L1180 440 L430 390 L1190 330 L440 290"/>
      <g class="b-try b-try3"><path class="b-chalk b-yellow" d="${zigzag(TRIES[2]!, -6)}"/>${dots(TRIES[2]!, 'b-yellow', -6)}</g>
      <path class="b-chalk b-yellow b-mark" d="M1370 250 q40 -60 85 -10 q30 45 -40 80 v40 M1415 420 v4"/>
    </svg>
    <div class="b-eraser"><b></b><i></i></div>`,
  over: line('Drew it three times. Still didn\'t click.'),
  pointer: 'none',
  play(k, gsap, tl) {
    k.camSet({ x: 0.5, y: 0.5, s: 1.02 })
    k.cam(0, { x: 0.5, y: 0.48, s: 1.07 }, bar(2), 'sine.inOut')
    const draw = (target: string, t: number, duration: number) => { gsap.set(target, { drawSVG: 0 }); tl.to(target, { drawSVG: '100%', duration, ease: 'power2.inOut' }, t) }
    draw('.b-axis', 0, 0.35)
    draw('.b-curve', 0.15, 0.55)
    gsap.set('.b-label', { autoAlpha: 0 }); tl.to('.b-label', { autoAlpha: 0.85, duration: 0.3 }, 0.4)
    // Three tries at the same drawing. The eraser rubs out the first two and leaves their ghosts.
    const tries = [[0.7, 1.2], [1.65, 2.1], [2.5, 3.0]]
    tries.forEach(([from, to], i) => {
      const g = `.b-try${i + 1}`
      draw(`${g} path`, from!, to! - from!)
      gsap.set(`${g} circle`, { scale: 0, transformOrigin: '50% 50%' })
      tl.to(`${g} circle`, { scale: 1, duration: 0.18, stagger: (to! - from!) / 5, ease: 'back.out(3)' }, from! + 0.05)
    })
    gsap.set('.b-eraser', { left: '52cqw', top: '79cqh', rotation: 0 })
    gsap.set(['.b-smudge1', '.b-smudge2'], { drawSVG: 0 })
    const rub = (t: number, smudge: string, past: string, y: string) => {
      tl.to('.b-eraser', { left: '26cqw', top: y, rotation: -6, duration: 0.2, ease: 'power2.out' }, t)
      tl.to('.b-eraser', { keyframes: [{ left: '66cqw', rotation: 4 }, { left: '34cqw', rotation: -4 }, { left: '62cqw', rotation: 2 }], duration: 0.42, ease: 'sine.inOut' }, t + 0.2)
      tl.to(smudge, { drawSVG: '100%', duration: 0.42, ease: 'sine.inOut' }, t + 0.2)
      tl.to(past, { opacity: 0.22, duration: 0.3 }, t + 0.25)
    }
    rub(1.2, '.b-smudge1', '.b-try1', '40cqh')
    tl.to('.b-eraser', { left: '70cqw', top: '79cqh', rotation: 0, duration: 0.25, ease: 'power2.in' }, 1.82)
    rub(2.1, '.b-smudge2', '.b-try2', '36cqh')
    tl.to('.b-eraser', { left: '70cqw', top: '79cqh', rotation: 0, duration: 0.25, ease: 'power2.in' }, 2.72)
    draw('.b-mark', 3.05, 0.4)
    // The line comes early enough to be read twice before the cut.
    k.say('.pf-line', beat(2))
  },
}

/** The thread on the next day: the question at the top, then whatever the shot adds. */
const nextDay = (rest: string) => chat('11:20', `<div class="pf-time">Yesterday 11:40 PM</div>${message({ who: 'lin', text: QUESTION })}<div class="pf-time">Today 11:20 AM</div>${rest}`)
const VIDEO_CARD = `<div class="pf-msg pf-msg--me v-sent"><div class="pf-avatar pf-avatar--me">L</div><div><div class="v-card">
  ${image('lesson-01', 'v-thumb')}<span class="v-play"></span><span class="v-len">0:22</span>
  <div class="v-name">How does the learning rate move a prediction line?</div></div></div></div>`
const VIDEO_CSS = `
  .v-card { position: relative; width: 14.6cqw; border-radius: 1cqw; overflow: hidden; background: var(--pm-color-sheen); box-shadow: 0 0.1cqw 0.3cqw color-mix(in srgb, var(--pm-color-film-ink) 10%, transparent); }
  .v-thumb { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; }
  .v-play { position: absolute; left: 50%; top: 4.1cqw; width: 2.8cqw; height: 2.8cqw; margin: -1.4cqw 0 0 -1.4cqw; border-radius: 50%; background: color-mix(in srgb, var(--pm-color-film-ink) 62%, transparent); }
  .v-play::after { content: ''; position: absolute; left: 1.1cqw; top: 0.8cqw; border-left: 1cqw solid var(--pm-color-sheen); border-top: 0.6cqw solid transparent; border-bottom: 0.6cqw solid transparent; }
  .v-len { position: absolute; right: 0.6cqw; top: 6.6cqw; font-size: 0.85cqw; color: var(--pm-color-sheen); }
  .v-name { padding: 0.6cqw 0.8cqw 0.7cqw; font-size: 1cqw; }
`

/** Lesson video frames, one per state of the comparison: 01–04 learning rate 2.2, 05–09 learning rate 0.35. */
const FRAMES = [1, 2, 3, 4, 5, 6, 7, 8, 9]
/** The lesson video lasts 21.6 s, 1.8 s a state; the training states start at 1.8 s. */
const progress = (frame: number) => (frame * 1.8 + 0.9) / 21.6


/** The video frame's chart, as fractions of the frame: the same figure as the website's and the slide's. */
const VIDEO_CHART = 'left:25%;top:37.78%;width:48.28%;height:40.14%'

/**
 * 45.6–54.5 s. The website's chart becomes the lesson video playing on the teacher's phone; the camera pulls back to
 * the phone, a finger drags the video back to a step, the player closes into its card in the class chat, and the
 * student who asked writes the answer in their own words.
 */
export const video: Shot = {
  css: `${VIDEO_CSS}
    .v-player { position: absolute; inset: 0; z-index: 2; background: var(--pm-color-film-night); display: flex; flex-direction: column; justify-content: center; color: var(--pm-color-sheen); transform-origin: 0 0; }
    .v-screen { position: relative; width: 100%; aspect-ratio: 16 / 9; background: var(--pm-color-sheen); }
    .v-frame { position: absolute; inset: 0; width: 100%; height: 100%; }
    .v-close { position: absolute; left: 1.2cqw; top: 4.4cqw; width: 2.4cqw; height: 2.4cqw; display: grid; place-items: center; font-size: 1.5cqw; line-height: 1; }
    .v-title { position: absolute; left: 4.2cqw; right: 1.6cqw; top: 4.85cqw; font-size: 1.1cqw; font-weight: 600; }
    .v-bar { position: absolute; left: 1.6cqw; right: 1.6cqw; bottom: 9cqw; height: 0.35cqw; border-radius: 99cqw; background: color-mix(in srgb, var(--pm-color-sheen) 30%, transparent); }
    .v-done { position: absolute; left: 0; top: 0; bottom: 0; width: 100%; border-radius: 99cqw; background: var(--pm-color-film-lilac); transform-origin: 0 50%; }
    .v-knob { position: absolute; top: 50%; left: 0; width: 1.3cqw; height: 1.3cqw; margin: -0.65cqw 0 0 -0.65cqw; border-radius: 50%; background: var(--pm-color-sheen); }
    .v-clock { position: absolute; left: 1.6cqw; bottom: 6.4cqw; font-size: 0.95cqw; color: color-mix(in srgb, var(--pm-color-sheen) 75%, transparent); }
    .r-new .pf-bubble { font-weight: 600; }
  `,
  stage: `<div class="pf-fill pf-day"></div>${phone(`${nextDay(`${VIDEO_CARD}
    <div class="pf-msg r-typing"><div class="pf-avatar pf-avatar--lin">S</div><div><div class="pf-who">Sam</div><div class="pf-bubble pf-typing"><i></i><i></i><i></i></div></div></div>
    ${message({ who: 'lin', text: 'Got it! The steps were too big, so it kept overshooting.', className: 'r-new' })}`)}
    <div class="v-player"><div class="v-close">✕</div><div class="v-title">How does the learning rate move a prediction line?</div>
      <div class="v-screen">${FRAMES.map(n => image(`lesson-${String(n).padStart(2, '0')}`, `v-frame v-f${n}`)).join('')}<div class="pf-hero" style="${VIDEO_CHART}"></div></div>
      <div class="v-bar"><div class="v-done"></div><div class="v-knob"></div></div><div class="v-clock">0:18 / 0:22</div></div>`)}`,
  over: `${line('Or send it as a video.', 'v-line1')}${line('Missed a step? Drag it back.', 'v-line2')}`,
  pointer: 'finger',
  play(k, gsap, tl, root) {
    const t = (film: number) => film - (T.videoIn - FADE)
    // Measured as laid out: the card's thumbnail, the player and its picture, the scrubber, the close button.
    const thumb = k.measure('.v-sent .v-thumb'), player = k.measure('.v-player'), screen = k.measure('.v-screen')
    const scrub = k.measure('.v-bar'), close = k.measure('.v-close')
    const knob = (n: number) => ({ x: scrub.x + scrub.w * progress(n), y: scrub.y + scrub.h / 2 })
    const end = { x: scrub.x + scrub.w * (progress(9) + 0.06), y: scrub.y + scrub.h / 2 }
    // Pull back from the chart to the phone: the whole player, its close button and its scrubber above the words.
    k.cam(FADE, { x: 0.5, y: 0.54, s: 1.2 }, beat(86) - T.videoIn, 'power2.inOut')
    k.say('.v-line1', t(T.videoIn) + 0.6, t(T.scrubGrab) - 0.35)
    k.say('.v-line2', t(T.scrubGrab) - 0.1, t(T.closeTap) - 0.1)
    // Near its end, the video shows the last state, the one the website showed, and plays out its last seconds.
    const clock = root.querySelector('.v-clock')!
    const frames = [...root.querySelectorAll<HTMLElement>('.v-frame')]
    const showFrame = (n: number, at: number) => {
      frames.forEach((frame, i) => tl.set(frame, { autoAlpha: i + 1 === n ? 1 : 0 }, at))
      tl.set(clock, { text: `0:${String(Math.round(progress(n) * 21.6)).padStart(2, '0')} / 0:22` }, at)
    }
    gsap.set(frames, { autoAlpha: 0 }); gsap.set(frames[8]!, { autoAlpha: 1 })
    gsap.set('.v-done', { scaleX: progress(9) }); gsap.set('.v-knob', { left: `${progress(9) * 100}%` })
    tl.to('.v-done', { scaleX: progress(9) + 0.06, duration: t(T.scrubGrab), ease: 'none' }, 0)
    tl.to('.v-knob', { left: `${(progress(9) + 0.06) * 100}%`, duration: t(T.scrubGrab), ease: 'none' }, 0)
    // A fingertip takes the knob and drags it back to the second step; the frames run backwards under it.
    const grab = t(T.scrubGrab)
    k.pointerAt(grab - 0.35, { x: end.x + 0.02, y: end.y + 0.04 })
    k.point(grab - 0.3, end, 0.28)
    k.click(grab)
    tl.to('.v-knob', { scale: 1.5, duration: 0.1 }, grab)
    k.point(grab + 0.1, knob(2), 0.7, 'power2.inOut')
    tl.to('.v-done', { scaleX: progress(2), duration: 0.7, ease: 'power2.inOut' }, grab + 0.1)
    tl.to('.v-knob', { left: `${progress(2) * 100}%`, duration: 0.7, ease: 'power2.inOut' }, grab + 0.1)
    ;[8, 7, 6, 5, 4, 3, 2].forEach((n, i) => showFrame(n, grab + 0.15 + i * 0.09))
    tl.to('.v-knob', { scale: 1, duration: 0.2 }, grab + 0.85)
    // It plays on from there, a state a beat.
    T.playOn.forEach((at, i) => showFrame(3 + i, t(at)))
    tl.to('.v-done', { scaleX: progress(4) + 0.02, duration: t(T.closeTap) - grab - 0.8, ease: 'none' }, grab + 0.8)
    tl.to('.v-knob', { left: `${(progress(4) + 0.02) * 100}%`, duration: t(T.closeTap) - grab - 0.8, ease: 'none' }, grab + 0.8)
    // A tap on ✕ closes the player back into its card: the picture shrinks onto the thumbnail it grew from.
    const tap = t(T.closeTap)
    k.point(t(T.playOn[1]), { x: close.x + close.w / 2, y: close.y + close.h / 2 }, 0.4)
    k.click(tap)
    k.pointerOff(tap + 0.2)
    const s = thumb.w / screen.w
    const dx = thumb.x - player.x - s * (screen.x - player.x), dy = thumb.y - player.y - s * (screen.y - player.y)
    tl.to('.v-player', { scale: s, xPercent: dx / player.w * 100, yPercent: dy / player.h * 100, duration: 0.4, ease: 'power3.in' }, tap + 0.06)
    tl.to('.v-player', { autoAlpha: 0, duration: 0.1, ease: 'none' }, tap + 0.38)
    k.cam(tap + 0.2, { x: 0.5, y: 0.6, s: 1.3 }, 0.8)
    // Back in the thread: the student who asked writes the answer in their own words.
    gsap.set('.r-new', { display: 'none' })
    k.enter('.r-typing', t(T.typingReply), { yPercent: 40, scale: 0.9 }, 0.25)
    tl.to('.r-typing .pf-typing i', { yPercent: -60, duration: 0.1, stagger: 0.06, repeat: 1, yoyo: true, ease: 'sine.inOut' }, t(T.typingReply) + 0.1)
    tl.set('.r-typing', { display: 'none' }, t(T.reply))
    tl.set('.r-new', { display: 'flex' }, t(T.reply))
    k.enter('.r-new', t(T.reply), { yPercent: 25, scale: 0.94 }, 0.45)
    tl.to('.r-new .pf-bubble', { keyframes: [{ scale: 1.05, duration: 0.14, ease: 'power2.out' }, { scale: 1, duration: 0.35, ease: 'back.out(2.5)' }] }, t(T.reply) + 0.15)
  },
}
