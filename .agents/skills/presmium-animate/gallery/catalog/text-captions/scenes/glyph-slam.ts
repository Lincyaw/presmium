import { gsapScene } from '@lincyaw/addon-motion/scene'
import { frame } from '../../../lengths/scenes/kit/frame.ts'
import { mulberry32, range } from '../../../lengths/scenes/kit/fx/random.ts'
import { shake } from '../../../lengths/scenes/kit/fx/time.ts'
import { esc, pieces } from './lib/text.ts'

// Glyph slam, with GSAP: one heavy word lands with an impact. Two ways in, by `mode`:
//   gather — the characters hang scattered across the frame (a seeded scatter, the same on every build), drift
//            a little, then fly home one after another and lock together;
//   slam   — the whole word falls from in front of the camera, twice its size and blurred, and hits the page.
// State `slam` (1.4 s). gather: 0–0.35 s the scattered glyphs, muted and small, drift 2% (the setup is seen);
// 0.35–1.05 s they fly home 50 ms apart on back.out(1.3), an overshoot of about 6% for the hero of the frame,
// turning upright and taking the ink as they come. slam: 0.15–0.5 s the word falls on power3.in (it accelerates
// into the impact), blur falling with the scale. Then the impact, within one or two frames: the word squashes
// 6% and springs back, the frame shakes for three frames (a fading sum of sines, seekable), and an accent rule
// under the word shoots out from its centre: the reaction is about a third of the size of the move.
// State `hold` (2 s): nothing moves; the shake has ended and the filters are removed.
// The word should be short (2–6 characters): one claim, read at a glance.
// Adapted from HyperFrames headline-slam, char-slam-explode and caption-kinetic-slam.
export default gsapScene(({ root, gsap, width, height, color, parameters }) => {
  const text = (parameters.text as string | undefined) ?? '梯度消失'
  const mode = (parameters.mode as string | undefined) === 'slam' ? 'slam' : 'gather'
  const glyphs = pieces(text, 'char')
  frame(root, `
    .gs { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1.2cqh; }
    .gs__word { display: flex; align-items: baseline; font: 600 13cqw/1.1 var(--pm-font-sans); letter-spacing: 0.02em; white-space: pre; }
    .gs__g { display: inline-block; will-change: transform; }
    .gs__rule { width: 60%; height: 0.7cqh; border-radius: 1cqh; background: var(--pm-color-accent); transform-origin: 50% 50%; }
  `, `<div class="gs"><div class="gs__word">${glyphs.map(g => g.space ? esc(g.text) : `<span class="gs__g">${esc(g.text)}</span>`).join('')}</div><div class="gs__rule"></div></div>`)

  const tl = gsap.timeline()
  const cqw = width / 100, cqh = height / 100
  const word = root.querySelector<HTMLElement>('.gs__word')!
  const stage = root.querySelector<HTMLElement>('.gs')!
  const rule = root.querySelector<HTMLElement>('.gs__rule')!
  const chars = [...root.querySelectorAll<HTMLElement>('.gs__g')]
  let impact: number
  if (mode === 'gather') {
    const rng = mulberry32(0x5eed)
    chars.forEach((g, i) => {
      // Spread from the word's centre outwards, so each glyph starts on its own side.
      const side = chars.length > 1 ? (i / (chars.length - 1)) * 2 - 1 : 0
      const x = (side * 22 + range(rng, -8, 8)) * cqw, y = range(rng, -28, 28) * cqh
      const r = range(rng, -40, 40), s = range(rng, 0.45, 0.7)
      gsap.set(g, { x, y, rotation: r, scale: s, color: color('muted') })
      tl.to(g, { x: x * 0.98 + side * 0.4 * cqw, y: y * 0.98, rotation: r * 0.96, duration: 0.35, ease: 'none' }, 0)
    })
    const each = 0.05, fly = 0.6
    tl.to(chars, { x: 0, y: 0, rotation: 0, scale: 1, duration: fly, ease: 'back.out(1.3)', stagger: each }, 0.35)
    tl.to(chars, { color: color('ink'), duration: 0.3, ease: 'power1.out', stagger: each }, 0.45)
    impact = 0.35 + each * (chars.length - 1) + fly * 0.62
  } else {
    gsap.set(word, { scale: 2.2, autoAlpha: 0, filter: 'blur(1.2cqw)' })
    tl.to(word, { scale: 1, filter: 'blur(0cqw)', duration: 0.35, ease: 'power3.in' }, 0.15)
    tl.to(word, { autoAlpha: 1, duration: 0.12, ease: 'power1.out' }, 0.15)
    tl.set(word, { filter: 'none' }, 0.52)
    impact = 0.5
  }
  // The impact: a squash on the word, three frames of shake, the rule shoots out.
  tl.to(word, { keyframes: [
    { scaleY: 0.94, scaleX: 1.04, duration: 0.06, ease: 'power2.out' },
    { scaleY: 1, scaleX: 1, duration: 0.35, ease: 'back.out(3)' },
  ], transformOrigin: '50% 100%' }, impact)
  const jolt = { t: 0 }
  tl.to(jolt, { t: 0.12, duration: 0.12, ease: 'none', modifiers: { t: (v: number | string) => {
    const [dx, dy] = shake(Number(v), 0.5, 0.12, 3)
    stage.style.transform = `translate(${dx * cqw}px, ${dy * cqw}px)`
    return v
  } } }, impact)
  gsap.set(rule, { scaleX: 0 })
  tl.to(rule, { scaleX: 1, duration: 0.45, ease: 'expo.out' }, impact + 0.03)
  return tl
})
