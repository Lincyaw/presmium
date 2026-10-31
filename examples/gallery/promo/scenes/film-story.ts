// The story around the product: the student's question at night, the blackboard where it was not answered, the
// video the teacher sends after class, and the reply. One chat thread carries the question to its answer.
import { chat, DESK_CSS, image, line, message, nightDesk, phone, type Shot } from './film-kit.ts'
import { bar, beat, FADE, T } from './timeline.ts'

const QUESTION = 'How can a bunch of spinning circles draw any shape?'
const OLD = [
  message({ who: 'wang', text: 'Is assignment 2 due Friday?' }),
  message({ who: 'me', text: 'Yes, by Friday night.' }),
].join('')

/**
 * 0–8.7 s. A phone lying on the desk under the lamp lights up on the bar; a student's question arrives in the course
 * group on the next.
 */
export const question: Shot = {
  css: `${DESK_CSS}
    .q-shade { position: absolute; inset: 0; background: var(--pm-color-film-night); }
    .q-dark { position: absolute; inset: 0; z-index: 2; background: var(--pm-color-film-night); }
    .q-new .pf-bubble { font-weight: 600; }
  `,
  stage: `${nightDesk()}<div class="q-shade"></div><div class="pf-lie">${phone(`${chat('11:40', `<div class="pf-time">11:40 PM</div>${OLD}
    <div class="pf-msg q-typing"><div class="pf-avatar pf-avatar--lin">S</div><div><div class="pf-who">Sam</div><div class="pf-bubble pf-typing"><i></i><i></i><i></i></div></div></div>
    ${message({ who: 'lin', text: QUESTION, className: 'q-new' })}`)}<div class="q-dark"></div>`)}</div>`,
  pointer: 'none',
  play(k, gsap, tl) {
    k.camSet({ x: 0.5, y: 0.5, s: 1 })
    // A slow push towards the phone while the room comes up and the question lands, then the frame holds still.
    k.cam(0, { x: 0.45, y: 0.48, s: 1.12 }, bar(3), 'sine.inOut')
    gsap.set('.q-shade', { autoAlpha: 0.6 })
    tl.to('.q-shade', { autoAlpha: 0.12, duration: 1.4, ease: 'power1.out' }, 0)
    // The lamp flickers once, barely.
    tl.to('.pf-lampglow', { keyframes: [{ autoAlpha: 0.7, duration: 0.05 }, { autoAlpha: 1, duration: 0.09 }, { autoAlpha: 0.82, duration: 0.05 }, { autoAlpha: 1, duration: 0.22 }], ease: 'none' }, beat(5) + 0.2)
    // The screen wakes, lights the desk around it, and the phone buzzes once.
    gsap.set('.pf-screenlight', { autoAlpha: 0 })
    tl.to('.pf-screenlight', { autoAlpha: 1, duration: 0.25, ease: 'power1.out' }, T.wake)
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

// The chalk drawing: a square wave, and the sums of its Fourier series that were meant to build it,
// (4/π)(sin x + sin 3x/3 + sin 5x/5 + …), over two periods. Board coordinates are those of the frame, 1600 × 900.
const X0 = 250, X1 = 1350, MID = 400, UNIT = 150
const toX = (t: number) => X0 + t / (4 * Math.PI) * (X1 - X0)
const partial = (terms: number) => (t: number) => 4 / Math.PI * Array.from({ length: terms }, (_, k) => Math.sin((2 * k + 1) * t) / (2 * k + 1)).reduce((a, b) => a + b, 0)
const wave = (terms: number) => Array.from({ length: 321 }, (_, i) => {
  const t = i / 320 * 4 * Math.PI
  return `${i ? 'L' : 'M'}${toX(t).toFixed(1)} ${(MID - UNIT * partial(terms)(t)).toFixed(1)}`
}).join(' ')
const SQUARE = `M${X0} ${MID} V${MID - UNIT} H${toX(Math.PI)} V${MID + UNIT} H${toX(2 * Math.PI)} V${MID - UNIT} H${toX(3 * Math.PI)} V${MID + UNIT} H${X1} V${MID}`
const SUMS = ['sin x', 'sin x + sin 3x/3', 'sin x + sin 3x/3 + sin 5x/5']

/**
 * 8.7–13.1 s. The blackboard of the last lesson, photographed: the square wave and the sums meant to build it, drawn
 * three times, erased twice, and still unclear.
 */
export const board: Shot = {
  css: `
    .b-svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
    .b-chalk { fill: none; stroke: var(--pm-color-film-chalk); stroke-width: 7; stroke-linecap: round; stroke-linejoin: round; opacity: 0.88; }
    .b-axis { stroke-width: 5; opacity: 0.6; }
    .b-square { stroke-width: 6; opacity: 0.75; }
    .b-yellow { stroke: var(--pm-color-film-lamp); }
    .b-label { fill: var(--pm-color-film-chalk); font: 600 52px var(--pm-font-sans); letter-spacing: 0.02em; opacity: 0.9; }
    .b-smudge { fill: none; stroke: color-mix(in srgb, var(--pm-color-film-chalk) 7%, transparent); stroke-width: 110; stroke-linecap: round; stroke-linejoin: round; }
    .b-eraser { position: absolute; left: 0; top: 0; width: 10cqw; height: 3.6cqw; border-radius: 0.5cqw; transform-origin: 50% 50%;
      box-shadow: 0 0.5cqw 0.9cqw color-mix(in srgb, var(--pm-color-film-night) 45%, transparent); }
    .b-eraser b { position: absolute; inset: 0 0 34% 0; border-radius: 0.5cqw 0.5cqw 0.15cqw 0.15cqw;
      background: linear-gradient(180deg, color-mix(in srgb, var(--pm-color-film-wood) 82%, var(--pm-color-sheen)), var(--pm-color-film-wood) 45%, color-mix(in srgb, var(--pm-color-film-wood) 70%, var(--pm-color-film-night))); }
    .b-eraser i { position: absolute; inset: 66% 0 0 0; border-radius: 0 0 0.3cqw 0.3cqw;
      background: linear-gradient(180deg, color-mix(in srgb, var(--pm-color-film-ink) 75%, var(--pm-color-film-silver)), color-mix(in srgb, var(--pm-color-film-chalk) 55%, var(--pm-color-film-ink))); }
  `,
  stage: `${image('photo-chalkboard', 'pf-fill pf-photo')}
    <svg class="b-svg" viewBox="0 0 1600 900" aria-hidden="true">
      <defs>
        <filter id="b-chalk-grain" x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="7" result="noise"/>
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="6" xChannelSelector="R" yChannelSelector="G" result="rough"/>
          <feColorMatrix in="noise" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  3.2 0 0 0 -0.75" result="speckle"/>
          <feComposite in="rough" in2="speckle" operator="in"/>
        </filter>
        <filter id="b-chalk-haze" x="-10%" y="-20%" width="120%" height="140%"><feGaussianBlur stdDeviation="14"/></filter>
      </defs>
      <g filter="url(#b-chalk-grain)">
        <path class="b-chalk b-axis" d="M${X0 - 30} ${MID} H${X1 + 70} M${X0} ${MID + 230} V${MID - 240}"/>
        <path class="b-chalk b-square" d="${SQUARE}"/>
        ${SUMS.map((sum, i) => `<g class="b-try b-try${i + 1}"><path class="b-chalk${i === 2 ? ' b-yellow' : ''}" d="${wave(i + 1)}"/><text class="b-label" x="${X0 + 20}" y="${MID - UNIT - 80}">${sum}</text></g>`).join('')}
        <path class="b-chalk b-yellow b-mark" d="M1420 170 q45 -65 95 -12 q34 50 -44 88 v44 M1471 360 v4"/>
      </g>
      <g filter="url(#b-chalk-haze)">
        <path class="b-smudge b-smudge1" d="M240 230 L1340 190 L260 380 L1360 330 L270 540 L1350 500"/>
        <path class="b-smudge b-smudge2" d="M250 200 L1360 240 L240 400 L1340 360 L280 560 L1360 520"/>
      </g>
    </svg>
    <div class="b-eraser"><b></b><i></i></div>`,
  over: line('Drew it three times. Still didn\'t click.'),
  pointer: 'none',
  play(k, gsap, tl) {
    k.camSet({ x: 0.5, y: 0.5, s: 1.02 })
    k.cam(0, { x: 0.5, y: 0.48, s: 1.07 }, bar(2), 'sine.inOut')
    const draw = (target: string, t: number, duration: number) => { gsap.set(target, { drawSVG: 0 }); tl.to(target, { drawSVG: '100%', duration, ease: 'power2.inOut' }, t) }
    draw('.b-axis', 0, 0.35)
    draw('.b-square', 0.15, 0.55)
    // Three tries at the same sum, one more term each time. The eraser rubs out the first two and leaves their ghosts.
    const tries = [[0.7, 1.2], [1.65, 2.1], [2.5, 3.0]]
    tries.forEach(([from, to], i) => {
      const g = `.b-try${i + 1}`
      draw(`${g} path`, from!, to! - from!)
      k.wipe(`${g} text`, from!, (to! - from!) * 0.8)
    })
    gsap.set('.b-eraser', { left: '52cqw', top: '80cqh', rotation: 0 })
    gsap.set(['.b-smudge1', '.b-smudge2'], { drawSVG: 0 })
    const rub = (t: number, smudge: string, past: string, y: number) => {
      tl.to('.b-eraser', { left: '18cqw', top: `${y}cqh`, rotation: -6, duration: 0.2, ease: 'power2.out' }, t)
      tl.to('.b-eraser', { keyframes: [{ left: '74cqw', top: `${y + 6}cqh`, rotation: 4 }, { left: '20cqw', top: `${y + 14}cqh`, rotation: -4 }, { left: '72cqw', top: `${y + 22}cqh`, rotation: 2 }], duration: 0.42, ease: 'sine.inOut' }, t + 0.2)
      tl.to(smudge, { drawSVG: '100%', duration: 0.42, ease: 'sine.inOut' }, t + 0.2)
      tl.to(past, { opacity: 0.16, duration: 0.3 }, t + 0.25)
    }
    rub(1.2, '.b-smudge1', '.b-try1', 20)
    tl.to('.b-eraser', { left: '70cqw', top: '80cqh', rotation: 0, duration: 0.25, ease: 'power2.in' }, 1.82)
    rub(2.1, '.b-smudge2', '.b-try2', 18)
    tl.to('.b-eraser', { left: '70cqw', top: '80cqh', rotation: 0, duration: 0.25, ease: 'power2.in' }, 2.72)
    draw('.b-mark', 3.05, 0.4)
    // The line comes early enough to be read twice before the cut.
    k.say('.pf-line', beat(2))
  },
}

/** The thread the next evening, at the same desk: the question at the top, then whatever the shot adds. */
const nextDay = (rest: string) => chat('9:05', `<div class="pf-time">Yesterday 11:40 PM</div>${message({ who: 'lin', text: QUESTION })}<div class="pf-time">Today 9:05 PM</div>${rest}`)
const VIDEO_TITLE = 'How can turning circles draw a musical note?'
const VIDEO_CARD = `<div class="pf-msg pf-msg--me v-sent"><div class="pf-avatar pf-avatar--me">L</div><div><div class="v-card">
  ${image('lesson-64', 'v-thumb')}<span class="v-play"></span><span class="v-len">1:22</span>
  <div class="v-name">${VIDEO_TITLE}</div></div></div></div>`
const VIDEO_CSS = `
  .v-card { position: relative; width: 14.6cqw; border-radius: 1cqw; overflow: hidden; background: var(--pm-color-sheen); box-shadow: 0 0.1cqw 0.3cqw color-mix(in srgb, var(--pm-color-film-ink) 10%, transparent); }
  .v-thumb { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; }
  .v-play { position: absolute; left: 50%; top: 4.1cqw; width: 2.8cqw; height: 2.8cqw; margin: -1.4cqw 0 0 -1.4cqw; border-radius: 50%; background: color-mix(in srgb, var(--pm-color-film-ink) 62%, transparent); }
  .v-play::after { content: ''; position: absolute; left: 1.1cqw; top: 0.8cqw; border-left: 1cqw solid var(--pm-color-sheen); border-top: 0.6cqw solid transparent; border-bottom: 0.6cqw solid transparent; }
  .v-len { position: absolute; right: 0.6cqw; top: 6.6cqw; font-size: 0.85cqw; color: var(--pm-color-sheen); }
  .v-name { padding: 0.6cqw 0.8cqw 0.7cqw; font-size: 1cqw; }
`

/**
 * Frames of the exported lesson video (`learn`, in English) in its fit section, where each state of N circles lasts
 * 6.5 s: 5 s of drawing, then the finished curve. The finished curves of N = 64, 32, 16 and 8, and the start of the
 * N = 8 state played on at 12 frames a second (`p00`–`p17`), from the moment the scrubber lets go.
 */
const LENGTH = 81.83
const FINISHED = { 64: 55, 32: 48.7, 16: 42.2, 8: 35.7 } as const
const PLAY_FROM = 29.8, PLAY_FPS = 12, PLAYED = 18
const FRAMES = [...Object.keys(FINISHED).map(n => `lesson-${n.padStart(2, '0')}`), ...Array.from({ length: PLAYED }, (_, i) => `lesson-p${String(i).padStart(2, '0')}`)]
const progress = (seconds: number) => seconds / LENGTH
const clockText = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')} / 1:22`

/** The video frame's figure, as fractions of the frame: the same figure as the website's and the slide's. */
const VIDEO_FIGURE = 'left:18.83%;top:37.5%;width:62.4%;height:62.4%'

/**
 * 45.6–54.5 s. The website's figure becomes the lesson video playing on the teacher's phone, on the same desk the next
 * evening; the camera pulls back to the phone, a finger drags the video back to N = 8 and it plays on, the player
 * closes into its card in the class chat, and the student who asked writes the answer in their own words.
 */
export const video: Shot = {
  css: `${VIDEO_CSS}${DESK_CSS}
    .v-shade { position: absolute; inset: 0; background: var(--pm-color-film-night); opacity: 0.12; }
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
  stage: `${nightDesk()}<div class="v-shade"></div>${phone(`${nextDay(`${VIDEO_CARD}
    <div class="pf-msg r-typing"><div class="pf-avatar pf-avatar--lin">S</div><div><div class="pf-who">Sam</div><div class="pf-bubble pf-typing"><i></i><i></i><i></i></div></div></div>
    ${message({ who: 'lin', text: 'Got it! Each circle adds a finer detail, so more circles get closer to the shape.', className: 'r-new' })}`)}
    <div class="v-player"><div class="v-close">✕</div><div class="v-title">${VIDEO_TITLE}</div>
      <div class="v-screen">${FRAMES.map(name => image(name, `v-frame v-${name}`)).join('')}<div class="pf-hero" style="${VIDEO_FIGURE}"></div></div>
      <div class="v-bar"><div class="v-done"></div><div class="v-knob"></div></div><div class="v-clock">${clockText(FINISHED[64])}</div></div>`)}`,
  over: `${line('Or send it as a video.', 'v-line1')}${line('Missed a step? Drag it back.', 'v-line2')}`,
  pointer: 'finger',
  play(k, gsap, tl, root) {
    const t = (film: number) => film - (T.videoIn - FADE)
    // Measured as laid out: the card's thumbnail, the player and its picture, the scrubber, the close button.
    const thumb = k.measure('.v-sent .v-thumb'), player = k.measure('.v-player'), screen = k.measure('.v-screen')
    const scrub = k.measure('.v-bar'), close = k.measure('.v-close')
    const knob = (seconds: number) => ({ x: scrub.x + scrub.w * progress(seconds), y: scrub.y + scrub.h / 2 })
    const grab = t(T.scrubGrab), tap = t(T.closeTap)
    // Before the grab the video rests on its finished N = 64 curve, the frame the website showed, until that state ends.
    const rest = FINISHED[64] + 0.8
    const end = knob(rest)
    // Pull back from the figure to the phone: the whole player, its close button and its scrubber above the words. It
    // decelerates into the framing so the scrubber is above the line before the words come in.
    k.cam(FADE, { x: 0.42, y: 0.54, s: 1.2 }, beat(86) - T.videoIn, 'power3.out')
    k.say('.v-line1', t(T.videoIn) + 0.6, t(T.scrubGrab) - 0.35)
    k.say('.v-line2', t(T.scrubGrab) - 0.1, t(T.closeTap) - 0.1)
    const clock = root.querySelector('.v-clock')!
    const frames = [...root.querySelectorAll<HTMLElement>('.v-frame')]
    const showFrame = (name: string, seconds: number, at: number) => {
      frames.forEach(frame => tl.set(frame, { autoAlpha: frame.classList.contains(`v-${name}`) ? 1 : 0 }, at))
      tl.set(clock, { text: clockText(seconds) }, at)
    }
    gsap.set(frames, { autoAlpha: 0 }); gsap.set('.v-lesson-64', { autoAlpha: 1 })
    gsap.set('.v-done', { scaleX: progress(FINISHED[64]) }); gsap.set('.v-knob', { left: `${progress(FINISHED[64]) * 100}%` })
    tl.to('.v-done', { scaleX: progress(rest), duration: grab, ease: 'none' }, 0)
    tl.to('.v-knob', { left: `${progress(rest) * 100}%`, duration: grab, ease: 'none' }, 0)
    // A fingertip takes the knob and drags it back to where eight circles begin; the finished curves run backwards
    // under it.
    k.pointerAt(grab - 0.35, { x: end.x + 0.02, y: end.y + 0.04 })
    k.point(grab - 0.3, end, 0.28)
    k.click(grab)
    tl.to('.v-knob', { scale: 1.5, duration: 0.1 }, grab)
    k.point(grab + 0.1, knob(PLAY_FROM), 0.7, 'power2.inOut')
    tl.to('.v-done', { scaleX: progress(PLAY_FROM), duration: 0.7, ease: 'power2.inOut' }, grab + 0.1)
    tl.to('.v-knob', { left: `${progress(PLAY_FROM) * 100}%`, duration: 0.7, ease: 'power2.inOut' }, grab + 0.1)
    ;([32, 16, 8] as const).forEach((n, i) => showFrame(`lesson-${String(n).padStart(2, '0')}`, FINISHED[n], grab + 0.2 + i * 0.16))
    tl.to('.v-knob', { scale: 1, duration: 0.2 }, grab + 0.85)
    // It plays on from there: the circles for N = 8 grow and the chain starts to turn, frame by frame.
    const play = grab + 0.8
    const played = Math.min(PLAYED, Math.ceil((tap + 0.06 - play) * PLAY_FPS))
    for (let i = 0; i < played; i++) showFrame(`lesson-p${String(i).padStart(2, '0')}`, PLAY_FROM + i / PLAY_FPS, play + i / PLAY_FPS)
    tl.to('.v-done', { scaleX: progress(PLAY_FROM + (tap - play)), duration: tap - play, ease: 'none' }, play)
    tl.to('.v-knob', { left: `${progress(PLAY_FROM + (tap - play)) * 100}%`, duration: tap - play, ease: 'none' }, play)
    // A tap on ✕ closes the player back into its card: the picture shrinks onto the thumbnail it grew from.
    k.point(t(T.playOn[1]), { x: close.x + close.w / 2, y: close.y + close.h / 2 }, 0.4)
    k.click(tap)
    k.pointerOff(tap + 0.2)
    const s = thumb.w / screen.w
    const dx = thumb.x - player.x - s * (screen.x - player.x), dy = thumb.y - player.y - s * (screen.y - player.y)
    tl.to('.v-player', { scale: s, xPercent: dx / player.w * 100, yPercent: dy / player.h * 100, duration: 0.4, ease: 'power3.in' }, tap + 0.06)
    tl.to('.v-player', { autoAlpha: 0, duration: 0.1, ease: 'none' }, tap + 0.38)
    k.cam(tap + 0.2, { x: 0.42, y: 0.6, s: 1.3 }, 0.8)
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
