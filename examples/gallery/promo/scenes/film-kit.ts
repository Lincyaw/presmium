// What every shot of the film shares: a 16:9 frame in container units (1cqw is 1% of the frame's width), a camera,
// the pointer, the one line of words a shot may show, and the places it is set in: photographs of a desk at night, a
// blackboard and a lecture hall (`promo/assets/photos.md`), and drawn devices on them: a laptop, a phone and a browser
// window. Real application pixels go inside the devices' screens.
import { gsapScene } from '@lincyaw/addon-motion/scene'

type GsapBuild = Parameters<typeof gsapScene>[0]
export type Gsap = Parameters<GsapBuild>[0]['gsap']
export type Timeline = ReturnType<Gsap['timeline']>

/** A captured state of the application or the lesson, under `promo/assets/`. */
export const asset = (name: string) => new URL(`../assets/${name}.webp`, import.meta.url).href
export const image = (name: string, className = 'pf-fill') => `<img class="${className}" src="${asset(name)}" alt="" draggable="false">`

/** A place in the frame, as fractions of its width and height. */
export interface Spot { x: number, y: number }
/** A rectangle of the frame in fractions; screens are 16:9 like the frame, so their `w` and `h` are equal. */
export interface Box extends Spot { w: number, h: number }

/** The captures are 1600 × 900 CSS pixels: a point of one, placed on a screen of the frame. */
export const onScreen = (screen: Box, x: number, y: number): Spot => ({ x: screen.x + x / 1600 * screen.w, y: screen.y + y / 900 * screen.h })
/** An overlay at capture pixels, positioned inside its screen. */
export const at = (x: number, y: number, w: number, h: number) => `left:${x / 16}%;top:${y / 9}%;width:${w / 16}%;height:${h / 9}%`

const BASE = `
  .pf { position: absolute; inset: 0; container-type: size; overflow: hidden; font-family: var(--pm-font-sans); color: var(--pm-color-film-ink); background: var(--pm-color-film-paper); line-height: 1.35; }
  .pf * { box-sizing: border-box; }
  .pf img { display: block; user-select: none; max-width: none; }
  .pf-stage { position: absolute; inset: 0; transform-origin: 0 0; }
  .pf-layer { position: absolute; inset: 0; overflow: hidden; }
  .pf-hero { position: absolute; pointer-events: none; }
  .pf .pf-fill { position: absolute; inset: 0; width: 100%; height: 100%; }
  .pf .pf-photo { object-fit: cover; }
  .pf-abs { position: absolute; }
  .pf-line { position: absolute; left: 0; right: 0; bottom: 6cqh; display: flex; justify-content: center; pointer-events: none; }
  .pf-line span { font-size: 2.95cqw; font-weight: 600; letter-spacing: 0.005em; padding: 0.75cqw 2.3cqw; border-radius: 99cqw; white-space: nowrap;
    background: color-mix(in srgb, var(--pm-color-film-paper) 94%, transparent); box-shadow: 0 0.4cqw 2.4cqw color-mix(in srgb, var(--pm-color-film-ink) 16%, transparent); }
  .pf-line--night span { background: color-mix(in srgb, var(--pm-color-film-night) 78%, transparent); color: var(--pm-color-film-chalk); box-shadow: none; }

  .pf-pointer-layer { position: absolute; inset: 0; pointer-events: none; }
  .pf-pointer { position: absolute; left: 0; top: 0; width: 1.25cqw; height: 1.25cqw; transform-origin: 0 0; }
  .pf-pointer svg { position: absolute; left: -0.12cqw; top: -0.08cqw; width: 100%; height: 100%; overflow: visible; filter: drop-shadow(0 0.15cqw 0.25cqw color-mix(in srgb, var(--pm-color-film-ink) 30%, transparent)); }
  .pf-pointer i { position: absolute; left: -1.3cqw; top: -1.3cqw; width: 2.6cqw; height: 2.6cqw; border-radius: 50%; border: 0.2cqw solid var(--pm-color-film-violet); }
  .pf-finger { position: absolute; left: -1.4cqw; top: -1.4cqw; width: 2.8cqw; height: 2.8cqw; border-radius: 50%; background: color-mix(in srgb, var(--pm-color-film-ink) 22%, transparent); border: 0.18cqw solid color-mix(in srgb, var(--pm-color-sheen) 80%, transparent); }

  .pf-day { background: radial-gradient(60cqw 50cqh at 18% 22%, color-mix(in srgb, var(--pm-color-film-lilac) 34%, transparent), transparent),
    radial-gradient(55cqw 55cqh at 85% 85%, color-mix(in srgb, var(--pm-color-film-silver) 90%, transparent), transparent), var(--pm-color-film-paper); }

  .pf-laptop { position: absolute; left: 16.6cqw; top: 9.5cqh; width: 66.8cqw; height: 68.5cqh; border-radius: 1.5cqw 1.5cqw 0.6cqw 0.6cqw; background: var(--pm-color-film-ink);
    box-shadow: 0 0 7cqw color-mix(in srgb, var(--pm-color-film-silver) 22%, transparent); }
  .pf-laptop::before { content: ''; position: absolute; left: 50%; top: 0.75cqh; width: 0.5cqw; height: 0.5cqw; margin-left: -0.25cqw; border-radius: 50%; background: color-mix(in srgb, var(--pm-color-film-silver) 30%, var(--pm-color-film-ink)); }
  .pf-base { position: absolute; left: 11cqw; width: 78cqw; top: 77.6cqh; height: 3.2cqh; border-radius: 0 0 2cqw 2cqw; background: linear-gradient(180deg, var(--pm-color-film-silver), color-mix(in srgb, var(--pm-color-film-silver) 60%, var(--pm-color-film-dusk))); }
  .pf-base::before { content: ''; position: absolute; left: 50%; top: 0; width: 10cqw; height: 1cqh; margin-left: -5cqw; border-radius: 0 0 0.6cqw 0.6cqw; background: color-mix(in srgb, var(--pm-color-film-silver) 70%, var(--pm-color-film-dusk)); }
  .pf-screen { position: absolute; overflow: hidden; background: var(--pm-color-sheen); }

  .pf-phone { position: absolute; left: 30cqw; top: 9cqh; width: 24cqw; height: 47cqw; border-radius: 3.6cqw; padding: 0.8cqw;
    background: linear-gradient(135deg, color-mix(in srgb, var(--pm-color-film-silver) 34%, var(--pm-color-film-ink)), var(--pm-color-film-ink) 22%, var(--pm-color-film-ink) 70%, color-mix(in srgb, var(--pm-color-film-lamp) 30%, var(--pm-color-film-ink)));
    box-shadow: inset 0 0 0 0.16cqw color-mix(in srgb, var(--pm-color-film-silver) 26%, transparent), -1.2cqw 1.8cqw 1.4cqw color-mix(in srgb, var(--pm-color-film-night) 55%, transparent), -3cqw 4cqw 6cqw color-mix(in srgb, var(--pm-color-film-night) 45%, transparent); }
  .pf-phone::after { content: ''; position: absolute; inset: 0.8cqw; z-index: 4; border-radius: 2.8cqw; pointer-events: none;
    background: linear-gradient(118deg, color-mix(in srgb, var(--pm-color-sheen) 9%, transparent), transparent 34%, transparent 72%, color-mix(in srgb, var(--pm-color-film-lamp) 7%, transparent)); }
  .pf-phone-screen { position: relative; width: 100%; height: 100%; border-radius: 2.8cqw; overflow: hidden; background: var(--pm-color-film-paper); }
  .pf-phone-screen::before { content: ''; position: absolute; z-index: 3; left: 50%; top: 0.7cqw; width: 6cqw; height: 1.5cqw; margin-left: -3cqw; border-radius: 99cqw; background: var(--pm-color-film-ink); }

  .pf-chat { position: absolute; inset: 0; display: flex; flex-direction: column; font-size: 1.55cqw; }
  .pf-status { height: 3.2cqw; flex: none; display: flex; align-items: center; justify-content: space-between; padding: 0.9cqw 2.2cqw 0; font-size: 1.05cqw; font-weight: 600; }
  .pf-status span:last-child { width: 2cqw; height: 0.95cqw; border-radius: 0.25cqw; border: 0.14cqw solid currentColor; position: relative; }
  .pf-status span:last-child::after { content: ''; position: absolute; inset: 0.14cqw; right: 0.5cqw; background: currentColor; border-radius: 0.1cqw; }
  .pf-head { flex: none; display: flex; align-items: center; gap: 0.8cqw; padding: 0.9cqw 1.4cqw; border-bottom: 0.1cqw solid var(--pm-color-film-silver); font-size: 1.2cqw; font-weight: 600; }
  .pf-head small { color: color-mix(in srgb, var(--pm-color-film-ink) 50%, transparent); font-weight: 400; }
  .pf-head b { font-size: 1.6cqw; font-weight: 400; color: color-mix(in srgb, var(--pm-color-film-ink) 60%, transparent); }
  .pf-thread { position: relative; flex: 1; overflow: hidden; }
  .pf-list { position: absolute; left: 0; right: 0; bottom: 0; display: flex; flex-direction: column; gap: 1.1cqw; padding: 1.2cqw 1.1cqw; }
  .pf-time { align-self: center; font-size: 0.9cqw; color: color-mix(in srgb, var(--pm-color-film-ink) 45%, transparent); }
  .pf-msg { display: flex; gap: 0.7cqw; align-items: flex-start; }
  .pf-msg--me { flex-direction: row-reverse; }
  .pf-avatar { flex: none; width: 2.6cqw; height: 2.6cqw; border-radius: 0.7cqw; display: grid; place-items: center; font-size: 1.1cqw; font-weight: 600; color: var(--pm-color-sheen); background: var(--pm-color-film-dusk); }
  .pf-avatar--lin { background: var(--pm-color-film-violet); }
  .pf-avatar--wang { background: color-mix(in srgb, var(--pm-color-film-wood) 80%, var(--pm-color-film-night)); }
  .pf-avatar--me { background: var(--pm-color-film-board); }
  .pf-who { font-size: 0.85cqw; color: color-mix(in srgb, var(--pm-color-film-ink) 50%, transparent); margin-bottom: 0.25cqw; }
  .pf-msg--me .pf-who { display: none; }
  .pf-bubble { max-width: 16.5cqw; padding: 0.7cqw 1cqw; border-radius: 0.3cqw 1.1cqw 1.1cqw 1.1cqw; background: var(--pm-color-sheen); line-height: 1.45;
    box-shadow: 0 0.1cqw 0.3cqw color-mix(in srgb, var(--pm-color-film-ink) 8%, transparent); }
  .pf-msg--me .pf-bubble { border-radius: 1.1cqw 0.3cqw 1.1cqw 1.1cqw; background: color-mix(in srgb, var(--pm-color-film-lilac) 42%, var(--pm-color-sheen)); }
  .pf-typing { display: flex; gap: 0.35cqw; padding: 1cqw 1.1cqw; }
  .pf-typing i { width: 0.55cqw; height: 0.55cqw; border-radius: 50%; background: color-mix(in srgb, var(--pm-color-film-ink) 40%, transparent); }
  .pf-input { flex: none; display: flex; align-items: center; gap: 0.7cqw; padding: 0.9cqw 1.2cqw 2.2cqw; border-top: 0.1cqw solid var(--pm-color-film-silver); }
  .pf-input span { flex: 1; height: 2.6cqw; border-radius: 99cqw; background: var(--pm-color-sheen); }
  .pf-input b { width: 2.2cqw; height: 2.2cqw; border-radius: 50%; border: 0.16cqw solid color-mix(in srgb, var(--pm-color-film-ink) 45%, transparent); }

  .pf-browser { position: absolute; border-radius: 1.1cqw; overflow: hidden; background: var(--pm-color-sheen);
    box-shadow: 0 0.4cqw 1cqw color-mix(in srgb, var(--pm-color-film-ink) 8%, transparent), 0 3cqw 7cqw color-mix(in srgb, var(--pm-color-film-ink) 16%, transparent); }
  .pf-browser-bar { position: absolute; left: 0; right: 0; top: 0; display: flex; align-items: center; gap: 0.55cqw; padding: 0 1.2cqw; background: var(--pm-color-film-silver); }
  .pf-browser-bar i { width: 0.8cqw; height: 0.8cqw; border-radius: 50%; background: color-mix(in srgb, var(--pm-color-film-ink) 22%, var(--pm-color-film-silver)); }
  .pf-browser-bar span { margin-left: 1.6cqw; flex: 0 1 30cqw; padding: 0.35cqw 1.2cqw; border-radius: 99cqw; background: var(--pm-color-sheen); font-size: 1cqw; color: color-mix(in srgb, var(--pm-color-film-ink) 62%, transparent); }
`

/** The Presmium pointer: the arrow, and the ring a press sends out. */
const POINTER = `<div class="pf-pointer-layer"><div class="pf-pointer"><i></i><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 2 L20 12 L12 13.6 L8.2 21 Z" fill="var(--pm-color-pointer-fill)" stroke="var(--pm-color-pointer-stroke)" stroke-width="1.6" stroke-linejoin="round"/></svg></div></div>`
/** A fingertip on a phone screen, for the same presses. */
const FINGER = `<div class="pf-pointer-layer"><div class="pf-pointer"><i></i><div class="pf-finger"></div></div></div>`

/**
 * The teacher's desk at night, photographed: the desk lamp on the right, the background a little out of focus. The lamp
 * glows over it, and a phone's screen throws its light on the desk once it is on.
 */
export const DESK_CSS = `
  .pf-lampglow { position: absolute; left: 44cqw; top: -22cqh; width: 50cqw; height: 88cqh; border-radius: 50%; mix-blend-mode: screen; pointer-events: none;
    background: radial-gradient(closest-side, color-mix(in srgb, var(--pm-color-film-lamp) 30%, transparent), transparent); }
  .pf-screenlight { position: absolute; left: 14cqw; top: 2cqh; width: 56cqw; height: 100cqh; border-radius: 50%; mix-blend-mode: screen; pointer-events: none;
    background: radial-gradient(closest-side, color-mix(in srgb, var(--pm-color-film-silver) 22%, transparent), transparent); }
  .pf-lie { position: absolute; inset: 0; transform-origin: 42% 60%; transform: perspective(110cqw) rotateX(9deg) rotateZ(-3deg); }
`
export const nightDesk = () => `${image('photo-night-desk', 'pf-fill pf-photo')}<div class="pf-lampglow"></div><div class="pf-screenlight"></div>`

/**
 * The same desk with the laptop standing on it, facing the camera: the photograph larger and further out of focus, set
 * so the lamp burns just right of the screen, the lamp's glow, the screen's light on the desk in front, and the
 * laptop's shadow under its base.
 */
export const LAPTOP_DESK_CSS = `
  .pf .pf-deskwide { position: absolute; left: -1.6cqw; top: -12cqh; width: 130cqw; height: 73.125cqw; object-fit: cover; filter: blur(0.3cqw) brightness(0.85); }
  .pf-laptopglow { position: absolute; left: 66cqw; top: -18cqh; width: 44cqw; height: 80cqh; border-radius: 50%; mix-blend-mode: screen; pointer-events: none;
    background: radial-gradient(closest-side, color-mix(in srgb, var(--pm-color-film-lamp) 30%, transparent), transparent); }
  .pf-laptoplight { position: absolute; left: 6cqw; top: 58cqh; width: 88cqw; height: 50cqh; border-radius: 50%; mix-blend-mode: screen; pointer-events: none;
    background: radial-gradient(closest-side, color-mix(in srgb, var(--pm-color-film-silver) 26%, transparent), transparent); }
  .pf-laptopshadow { position: absolute; left: 8cqw; width: 84cqw; top: 77cqh; height: 8cqh; border-radius: 50%;
    background: radial-gradient(closest-side, color-mix(in srgb, var(--pm-color-film-night) 80%, transparent), transparent); }
`
export const laptopDesk = () => `${image('photo-night-desk', 'pf-deskwide')}<div class="pf-laptopglow"></div><div class="pf-laptoplight"></div><div class="pf-laptopshadow"></div>`

/** A laptop whose screen is `{ x: .18, y: .12, w: .64, h: .64 }` of the frame. */
export const LAPTOP_SCREEN: Box = { x: 0.18, y: 0.12, w: 0.64, h: 0.64 }
export const laptop = (screen: string) => `<div class="pf-laptop"></div><div class="pf-base"></div><div class="pf-screen" style="left:18cqw;top:12cqh;width:64cqw;height:64cqh">${screen}</div>`

/** A phone on the desk, left of the lamp; its screen holds a chat (or anything else). */
export const phone = (screen: string) => `<div class="pf-phone"><div class="pf-phone-screen">${screen}</div></div>`

export interface Message { who: 'lin' | 'wang' | 'me', text: string, className?: string }
const NAMES = { lin: ['S', 'Sam'], wang: ['J', 'Jordan'], me: ['L', 'Dr. Lee'] } as const
export const message = ({ who, text, className = '' }: Message) =>
  `<div class="pf-msg ${who === 'me' ? 'pf-msg--me' : ''} ${className}"><div class="pf-avatar pf-avatar--${who}">${NAMES[who][0]}</div><div><div class="pf-who">${NAMES[who][1]}</div><div class="pf-bubble">${text}</div></div></div>`
/** The course group chat on the teacher's phone. */
export const chat = (clock: string, items: string) => `<div class="pf-chat">
  <div class="pf-status"><span>${clock}</span><span></span></div>
  <div class="pf-head"><b>‹</b>Signals &amp; Fourier · class chat<small>(46)</small></div>
  <div class="pf-thread"><div class="pf-list">${items}</div></div>
  <div class="pf-input"><span></span><b></b></div>
</div>`

/** The words of a shot, in the one place words go. */
export const line = (text: string, className = '') => `<div class="pf-line ${className}"><span>${text}</span></div>`

const pointerMarkup = (pointer: Shot['pointer'] = 'arrow') => pointer === 'arrow' ? POINTER : pointer === 'finger' ? FINGER : ''

/** Fills `root` with the frame: a camera stage holding the picture, the pointer above it, and the shot's lines. */
export function frame(root: HTMLElement, shot: Shot) {
  root.innerHTML = `<div class="pf"><style>${BASE}${shot.css}</style><div class="pf-stage">${shot.stage}${pointerMarkup(shot.pointer)}</div>${shot.over ?? ''}</div>`
  return root.firstElementChild as HTMLElement
}

/** Waits until every image of the frame is decoded and the fonts are in, so no exported frame shows a gap. */
export async function ready(root: HTMLElement) {
  await Promise.all([...root.querySelectorAll('img')].map(img => img.decode()))
  await document.fonts.ready
}

/** The verbs every shot uses, bound to its timeline. Times are seconds from the start of the shot. */
export function kit(gsap: Gsap, tl: Timeline, root: HTMLElement, film: Element = root.firstElementChild!) {
  const stage = root.querySelector('.pf-stage')!
  const layer = root.querySelector('.pf-pointer-layer')
  const camVars = (c: Spot & { s: number }) => ({ xPercent: (0.5 - c.x * c.s) * 100, yPercent: (0.5 - c.y * c.s) * 100, scale: c.s })
  const frameBox = film.getBoundingClientRect()
  if (layer) gsap.set(layer, { autoAlpha: 0 })
  return {
    /** Where an element is laid out, in frame fractions; call it before the shot moves the camera or the element. */
    measure: (selector: string): Box => {
      const r = root.querySelector(selector)!.getBoundingClientRect()
      return { x: (r.left - frameBox.left) / frameBox.width, y: (r.top - frameBox.top) / frameBox.height, w: r.width / frameBox.width, h: r.height / frameBox.height }
    },
    /** The camera centred on `c` (frame fractions) at zoom `c.s`. */
    camSet: (c: Spot & { s: number }) => gsap.set(stage, camVars(c)),
    cam: (t: number, c: Spot & { s: number }, duration = 0.9, ease = 'power2.inOut') => tl.to(stage, { ...camVars(c), duration, ease }, t),
    /** The pointer appears at a place of the frame; it is hidden until then. */
    pointerAt: (t: number, p: Spot) => { tl.set(layer, { xPercent: p.x * 100, yPercent: p.y * 100 }, t); tl.to(layer, { autoAlpha: 1, duration: 0.2 }, t) },
    point: (t: number, p: Spot, duration = 0.5, ease = 'power3.inOut') => tl.to(layer, { xPercent: p.x * 100, yPercent: p.y * 100, duration, ease }, t),
    pointerOff: (t: number) => tl.to(layer, { autoAlpha: 0, duration: 0.2 }, t),
    /** A press: the pointer dips and a ring spreads from its tip. */
    click: (t: number) => {
      const ring = root.querySelector('.pf-pointer i')!, tip = root.querySelector('.pf-pointer')!
      gsap.set(ring, { scale: 0, autoAlpha: 0 })
      tl.to(tip, { keyframes: [{ scale: 0.82, duration: 0.1, ease: 'power2.out' }, { scale: 1, duration: 0.2, ease: 'power2.out' }] }, t)
      tl.fromTo(ring, { scale: 0.2, autoAlpha: 0.7 }, { scale: 1, autoAlpha: 0, duration: 0.5, ease: 'power2.out', immediateRender: false }, t)
    },
    /** Something hidden until `t`, then shown at once (a cut) or over `duration`. */
    show: (target: gsap.TweenTarget, t: number, duration = 0) => { gsap.set(target, { autoAlpha: 0 }); tl.to(target, { autoAlpha: 1, duration, ease: 'none' }, t) },
    hide: (target: gsap.TweenTarget, t: number, duration = 0) => tl.to(target, { autoAlpha: 0, duration, ease: 'none' }, t),
    /** Rises into place out of nothing; things arrive decelerating. */
    enter: (target: gsap.TweenTarget, t: number, from: gsap.TweenVars = { yPercent: 30 }, duration = 0.45) => {
      gsap.set(target, { autoAlpha: 0, ...from })
      tl.to(target, { autoAlpha: 1, ...Object.fromEntries(Object.keys(from).map(k => [k, k === 'scale' ? 1 : 0])), duration, ease: 'expo.out' }, t)
    },
    /** One line of words: it rises in at `from` and, if `to` is given, leaves faster than it came. */
    say: (target: gsap.TweenTarget, from: number, to?: number) => {
      gsap.set(target, { autoAlpha: 0, yPercent: 40 })
      tl.to(target, { autoAlpha: 1, yPercent: 0, duration: 0.45, ease: 'expo.out' }, from)
      if (to !== undefined) tl.to(target, { autoAlpha: 0, yPercent: -20, duration: 0.25, ease: 'power2.in' }, to)
    },
    /** A wipe that uncovers its target from left to right, like text being written. */
    wipe: (target: gsap.TweenTarget, t: number, duration: number, ease = 'none') => {
      gsap.set(target, { clipPath: 'inset(0% 100% 0% 0%)' })
      tl.to(target, { clipPath: 'inset(0% 0% 0% 0%)', duration, ease }, t)
    },
  }
}
export type Kit = ReturnType<typeof kit>

/** One shot of the film: its own CSS, the picture on the camera stage, the words over it, and its timeline. */
export interface Shot {
  css: string
  stage: string
  over?: string
  pointer?: 'arrow' | 'finger' | 'none'
  play(k: Kit, gsap: Gsap, tl: Timeline, root: HTMLElement): void
}

/** A camera: the frame point it centres on and its zoom. */
export type Camera = Spot & { s: number }
/** Where a box should stand on screen: its centre and its width, in frame fractions. */
export type Place = Spot & { w: number }

/** The camera that shows `box` (laid out, in frame fractions) at `place` on screen: a hero framed to a size. */
export function fit(box: Box, place: Place): Camera {
  const s = place.w / box.w
  return { x: box.x + box.w / 2 - (place.x - 0.5) / s, y: box.y + box.h / 2 - (place.y - 0.5) / s, s }
}

/**
 * One shot of a chain. It has its own layer, camera stage, pointer and words, and its own timeline placed at `start`
 * (seconds on the scene's timeline; its `play` uses times from that start). `hero` marks the element a carry frames:
 * the thing that is the same on both sides of the handoff.
 */
export interface Part extends Shot { id: string, start: number, hero?: string }

/**
 * A handoff between two parts. The outgoing camera pushes in until the outgoing hero fills `place`; the incoming
 * layer starts with its own hero framed at exactly that place, crossfades in over `fade`, and is fully in at `at`,
 * where its own timeline pulls the camera out. The incoming part starts at `at - fade`.
 */
export interface Carry { from: string, to: string, at: number, push: number, fade: number, place: Place }

/** Beats that carry into each other: shots in their own layers, played on one timeline, handed over by carries. */
export interface Chain { parts: Part[], carries: Carry[] }

/** Fills `root` with the frame holding one layer per part, the later ones above. */
export function frameChain(root: HTMLElement, { parts }: Chain) {
  root.innerHTML = `<div class="pf"><style>${BASE}${parts.map(part => part.css).join('\n')}</style>${parts.map(part =>
    `<div class="pf-layer" data-part="${part.id}"><div class="pf-stage">${part.stage}${pointerMarkup(part.pointer)}</div>${part.over ?? ''}</div>`).join('')}</div>`
  return root.firstElementChild as HTMLElement
}

/** Builds every part's timeline inside its layer (selectors find only that layer's elements) and adds the carries. */
export function playChain(gsap: Gsap, tl: Timeline, root: HTMLElement, chain: Chain) {
  const film = root.firstElementChild!
  const layer = (id: string) => film.querySelector<HTMLElement>(`[data-part="${id}"]`)!
  const part = (id: string) => chain.parts.find(p => p.id === id)!
  // Heroes are measured as laid out, before any camera or part moves anything.
  const box = (el: Element): Box => {
    const f = film.getBoundingClientRect(), r = el.getBoundingClientRect()
    return { x: (r.left - f.left) / f.width, y: (r.top - f.top) / f.height, w: r.width / f.width, h: r.height / f.height }
  }
  const heroes = new Map(chain.parts.filter(p => p.hero).map(p => [p.id, box(layer(p.id).querySelector(p.hero!)!)]))
  const kits = new Map<string, Kit>()
  chain.parts.forEach((p, i) => {
    const el = layer(p.id)
    if (i > 0) gsap.set(el, { autoAlpha: 0 })
    gsap.context(() => {
      const child = gsap.timeline()
      const k = kit(gsap, child, el, film)
      kits.set(p.id, k)
      p.play(k, gsap, child, el)
      tl.add(child, p.start)
    }, el)
  })
  for (const c of chain.carries) {
    const from = part(c.from), to = part(c.to)
    if (Math.abs(to.start - (c.at - c.fade)) > 1e-6) throw new Error(`part ${to.id} must start when the carry from ${from.id} begins to fade`)
    // The push lands before the fade, so the two framings match while one layer replaces the other.
    kits.get(from.id)!.cam(c.at - c.fade - c.push - from.start, fit(heroes.get(from.id)!, c.place), c.push, 'power3.inOut')
    kits.get(to.id)!.camSet(fit(heroes.get(to.id)!, c.place))
    tl.fromTo(layer(to.id), { autoAlpha: 0 }, { autoAlpha: 1, duration: c.fade, ease: 'none', immediateRender: false }, c.at - c.fade)
    tl.set(layer(from.id), { autoAlpha: 0 }, c.at)
  }
}
