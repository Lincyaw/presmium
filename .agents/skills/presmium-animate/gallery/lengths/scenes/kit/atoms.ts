// The one-second atoms as GSAP functions: every longer GSAP piece of this gallery is built by calling them at the
// times of its beats, so a 30-second film moves with the same durations and eases as the 1-second atom it shows.
// Each atom sets its start state when the timeline is built (`gsap.set`) and tweens with `to` at its time, so a
// later beat shows nothing of its atom before it starts, and seeking back restores the start state.
import type { gsap as Gsap } from 'gsap'

type Timeline = ReturnType<typeof Gsap.timeline>
type Targets = Parameters<Timeline['to']>[0]

/** Seconds. Entering takes longer than leaving; a move between two places takes longest. */
export const DUR = { press: 0.12, exit: 0.25, enter: 0.45, emphasis: 0.55, move: 0.6, draw: 0.6, stagger: 0.07 }

/** Things arrive decelerating, leave accelerating, and move between two places with both. */
export const EASE = { enter: 'expo.out', exit: 'power2.in', move: 'power3.inOut', pop: 'back.out(2.2)', draw: 'power2.inOut', count: 'power3.out' }

export interface EnterOptions { from?: 'below' | 'above' | 'left' | 'scale' | 'fade', stagger?: number, duration?: number }

const START: Record<NonNullable<EnterOptions['from']>, gsap.TweenVars> = {
  below: { yPercent: 40 },
  above: { yPercent: -40 },
  left: { xPercent: -12 },
  scale: { scale: 0.6 },
  fade: {},
}

/** The resting value of each property an entrance starts away from, and only those: an element's other transforms stay. */
const rest = (start: gsap.TweenVars): gsap.TweenVars => Object.fromEntries(Object.keys(start).map(key => [key, key === 'scale' ? 1 : 0]))

export function atoms(gsap: typeof Gsap, tl: Timeline) {
  /** Hidden until `t`, then rises (or scales) into place; a list arrives one by one. */
  function enter(targets: Targets, t: number, { from = 'below', stagger = DUR.stagger, duration = DUR.enter }: EnterOptions = {}) {
    gsap.set(targets, { autoAlpha: 0, ...START[from] })
    tl.to(targets, { autoAlpha: 1, ...rest(START[from]), duration, stagger, ease: from === 'scale' ? EASE.pop : EASE.enter }, t)
  }

  /** Leaves at `t`, faster than it came, slightly upwards. */
  function exit(targets: Targets, t: number, { duration = DUR.exit } = {}) {
    tl.to(targets, { autoAlpha: 0, yPercent: -20, duration, ease: EASE.exit }, t)
  }

  /** One thing gives way to the next in the same place: the exit and the entrance overlap by a third. */
  function replace(before: Targets, after: Targets, t: number) {
    exit(before, t)
    enter(after, t + DUR.exit * 0.66)
  }

  /** A punch on something already shown: it grows past its size and settles, taking the accent color. */
  function emphasize(target: Targets, t: number, { color, scale = 1.14 }: { color?: string, scale?: number } = {}) {
    tl.to(target, { keyframes: [{ scale, duration: 0.15, ease: 'power2.out' }, { scale: 1, duration: 0.4, ease: 'back.out(3)' }] }, t)
    if (color) tl.to(target, { color, duration: 0.2 }, t)
  }

  /** A number runs from its shown value to `to`, slowing down as it lands. */
  function count(target: HTMLElement, t: number, from: number, to: number, { duration = 0.8, decimals = 0, prefix = '', suffix = '' } = {}) {
    const text = (v: number) => `${prefix}${v.toFixed(decimals)}${suffix}`
    target.textContent = text(from)
    const value = { v: from }
    // Callbacks do not fire while a scene is sought; a modifier runs on every render, from the tween's progress.
    tl.to(value, { v: to, duration, ease: EASE.count, modifiers: { v: (v: number) => { target.textContent = text(+v); return v } } }, t)
  }

  /** An SVG line or outline draws from its start to its end. */
  function draw(path: Targets, t: number, { duration = DUR.draw, stagger = 0 } = {}) {
    gsap.set(path, { drawSVG: 0 })
    tl.to(path, { drawSVG: '100%', duration, stagger, ease: EASE.draw }, t)
  }

  /** A wipe uncovers the element from left to right. */
  function reveal(target: Targets, t: number, { duration = 0.5 } = {}) {
    gsap.set(target, { clipPath: 'inset(0% 100% 0% 0%)' })
    tl.to(target, { clipPath: 'inset(0% 0% 0% 0%)', duration, ease: EASE.move }, t)
  }

  /** Text typed at `cps` characters a second; spaces are kept, so code keeps its indentation. */
  function type(target: Targets, value: string, t: number, { cps = 14 } = {}) {
    tl.to(target, { text: { value, preserveSpaces: true }, duration: value.length / cps, ease: 'none' }, t)
    return t + value.length / cps
  }

  /** The cursor layer (an element covering the frame, holding the pointer at its top left) glides to (x%, y%) of the frame. */
  function point(layer: Targets, t: number, x: number, y: number, { duration = DUR.move } = {}) {
    tl.to(layer, { xPercent: x, yPercent: y, duration, ease: EASE.move }, t)
  }

  /** A press: the pointer dips, the pressed control dips with it, and a ring spreads from the tip. */
  function click(pointer: Targets, ring: Targets, control: Targets | undefined, t: number) {
    gsap.set(ring, { scale: 0, autoAlpha: 0 })
    tl.to(pointer, { keyframes: [{ scale: 0.82, duration: DUR.press, ease: 'power2.out' }, { scale: 1, duration: 0.2, ease: 'power2.out' }] }, t)
    if (control) tl.to(control, { keyframes: [{ scale: 0.95, duration: DUR.press, ease: 'power2.out' }, { scale: 1, duration: 0.25, ease: EASE.pop }] }, t)
    tl.fromTo(ring, { scale: 0, autoAlpha: 0.6 }, { scale: 1, autoAlpha: 0, duration: 0.5, ease: 'power2.out', immediateRender: false }, t)
  }

  return { enter, exit, replace, emphasize, count, draw, reveal, type, point, click }
}

/** The pointer and its ring, to put inside a frame-sized layer whose `xPercent`/`yPercent` place the tip. */
export const POINTER = `<div class="lf-pointer"><div class="lf-pointer__ring"></div><svg class="lf-pointer__arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 2 L20 12 L12 13.6 L8.2 21 Z" fill="var(--pm-color-pointer-fill)" stroke="var(--pm-color-pointer-stroke)" stroke-width="1.6" stroke-linejoin="round" /></svg></div>`

export const POINTER_CSS = `
  .lf-pointer-layer { position: absolute; inset: 0; pointer-events: none; }
  .lf-pointer { position: absolute; left: 0; top: 0; width: 2.6cqw; height: 2.6cqw; transform-origin: 0 0; }
  .lf-pointer__arrow { position: absolute; left: -0.3cqw; top: -0.2cqw; width: 100%; height: 100%; overflow: visible; }
  .lf-pointer__ring { position: absolute; left: -2.6cqw; top: -2.6cqw; width: 5.2cqw; height: 5.2cqw; border-radius: 50%; border: 0.3cqw solid var(--pm-color-accent); }
`
