import { gsapScene } from '@lincyaw/addon-motion/scene'
import { frame } from '../../kit/frame.ts'
import { blurFilter, glowFilter } from '../../kit/fx/defs.ts'
import { uid } from '../../kit/fx/ids.ts'
import { isDark } from '../../kit/fx/theme.ts'
import { invertEase } from '../../kit/fx/time.ts'

// Comet stroke, with GSAP: a bright head with a tapering tail of light runs along the link from A to B, and B
// answers when it arrives. State `link` (1 s). 0–0.06 s: A gives a small kick back, the launch. 0.04–0.53 s: the
// comet leaves A and speeds up along the link (power1.inOut), drawing a faint line behind it, so the route stays.
// 0.53 s: the head hits B near its top speed; the tail pours in behind it (its last faint end by 0.9 s). 0.53–0.9 s:
// B lights up and recoils 3% away from the hit and springs back, and a ring spreads from its outline: cause first,
// then effect. 0.9–1 s: rest, the link with its arrow and the lit B. The tail is ten copies of the path in the
// accent and a white-hot core of three, each a segment ending at the head: the shorter the wider and the more
// opaque, so the copies stack into a taper that fades towards its end. Every segment, the faint line and the head
// follow one progress u from 0 to 1 + TAIL (DrawSVG with `nowrap` clips a segment that runs past either end; the
// head's ease is the same ease scaled and stopped at 1), so head and tail stay locked on any path. The glow is
// weaker on the light page, where an accent haze reads as a smudge rather than light.
const TAIL = 0.55                    // the tail's length, as a share of the link
/** `n` copies, head end first: [share of the tail, stroke width, opacity]. */
const taper = (n: number, length: number, wide: number, thin: number, opacity: number) => Array.from({ length: n }, (_, i): [number, number, number] => {
  const s = (i + 1) / n
  return [s * length, thin + (wide - thin) * (1 - s) ** 1.2, opacity * (0.3 + 0.7 * (1 - s))]
})
const TAIL_COPIES = taper(10, 1, 15, 2.5, 0.42)
const CORE_COPIES = taper(3, 0.42, 5, 1.5, 1)

export default gsapScene(({ root, gsap, color, parameters }) => {
  const from = (parameters.from as string | undefined) ?? '文稿'
  const to = (parameters.to as string | undefined) ?? '网页'
  const d = (parameters.path as string | undefined) ?? 'M 470 360 C 600 360 680 360 812 360'
  const glow = uid('cm-glow'), halo = uid('cm-halo')
  const alpha = isDark(color('bg')) ? 0.5 : 0.3
  frame(root, '', `<svg viewBox="0 0 1280 720" width="100%" height="100%" style="font-family: var(--pm-font-sans)">
    <defs>${blurFilter(glow, 12, 12)}${glowFilter(halo, color('accent'), 10)}</defs>
    <g class="cm__a" style="transform-box: fill-box; transform-origin: center">
      <rect x="200" y="290" width="260" height="140" rx="20" fill="var(--pm-color-surface)" stroke="var(--pm-color-accent)" stroke-width="4" />
      <text x="330" y="375" text-anchor="middle" font-size="44" font-weight="600" fill="var(--pm-color-ink)">${from}</text>
    </g>
    <path class="cm__route" d="${d}" fill="none" stroke="var(--pm-color-accent)" stroke-opacity="0.4" stroke-width="2.5" stroke-linecap="round" />
    <path class="cm__arrow" d="M 800 347 L 815 360 L 800 373" fill="none" stroke="var(--pm-color-accent)" stroke-opacity="0.45" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
    <rect class="cm__ring" x="820" y="290" width="260" height="140" rx="20" fill="none" stroke="var(--pm-color-accent)" stroke-width="6" />
    <g class="cm__b" style="transform-box: fill-box; transform-origin: center">
      <rect class="cm__box" x="820" y="290" width="260" height="140" rx="20" fill="var(--pm-color-surface)" stroke="var(--pm-color-line-strong)" stroke-width="4" />
      <text x="950" y="375" text-anchor="middle" font-size="44" font-weight="600" fill="var(--pm-color-ink)">${to}</text>
    </g>
    <path class="cm__seg cm__glow" d="${d}" fill="none" stroke="var(--pm-color-accent)" stroke-opacity="${alpha}" stroke-width="34" stroke-linecap="round" filter="url(#${glow})" />
    ${TAIL_COPIES.map(([, w, o]) => `<path class="cm__seg cm__tail" d="${d}" fill="none" stroke="var(--pm-color-accent)" stroke-opacity="${o.toFixed(3)}" stroke-width="${w.toFixed(2)}" stroke-linecap="round" />`).join('')}
    ${CORE_COPIES.map(([, w, o]) => `<path class="cm__seg cm__core" d="${d}" fill="none" stroke="var(--pm-color-sheen)" stroke-opacity="${o.toFixed(3)}" stroke-width="${w.toFixed(2)}" stroke-linecap="round" />`).join('')}
    <circle class="cm__head" r="7" fill="var(--pm-color-sheen)" filter="url(#${halo})" />
  </svg>`)

  const tl = gsap.timeline()
  const E = gsap.parseEase('power1.inOut')
  // u runs a little past 1 + TAIL, so at the end even the longest segment has left the link (no cap dot at B).
  const T0 = 0.04, D = 0.86, span = 1 + TAIL + 0.02
  const arrive = T0 + D * invertEase(E, 1 / span)
  const pct = (v: number) => `${(v * 100).toFixed(3)}%`
  /** A segment `l` long (share of the link) that ends at u: from [-l, 0] to [span - l, span], clipped to the link. */
  const travel = (el: Element, l: number) => tl.fromTo(el,
    { drawSVG: `${pct(-l)} 0% nowrap` },
    { drawSVG: `${pct(span - l)} ${pct(span)} nowrap`, duration: D, ease: E }, T0)
  root.querySelectorAll('.cm__tail').forEach((el, i) => travel(el, TAIL_COPIES[i]![0] * TAIL))
  root.querySelectorAll('.cm__core').forEach((el, i) => travel(el, CORE_COPIES[i]![0] * TAIL))
  travel(root.querySelector('.cm__glow')!, 0.6 * TAIL)
  // The faint line ends at the head too: its start stays at A.
  tl.fromTo('.cm__route', { drawSVG: '0% 0% nowrap' }, { drawSVG: `0% ${pct(span)} nowrap`, duration: D, ease: E }, T0)
  // Hidden before the launch and after the drain: a zero-length dash with a round cap would leave a dot.
  gsap.set(['.cm__head', '.cm__seg', '.cm__route'], { autoAlpha: 0 })
  tl.set(['.cm__head', '.cm__seg', '.cm__route'], { autoAlpha: 1 }, T0)
  tl.set('.cm__seg', { autoAlpha: 0 }, T0 + D)
  // The head rides the same u, stopped at B: the segments' ease scaled and clipped at 1.
  gsap.set('.cm__head', { motionPath: { path: d, end: 0 }, transformOrigin: '50% 50%' })
  tl.to('.cm__head', { motionPath: { path: d }, duration: D, ease: (p: number) => Math.min(1, span * E(p)) }, T0)
  tl.to('.cm__head', { scale: 2.2, autoAlpha: 0, duration: 0.18, ease: 'power2.out' }, arrive)
  // The launch: A kicks back a little as the comet leaves.
  tl.to('.cm__a', { keyframes: [{ x: -6, duration: 0.06, ease: 'power2.out' }, { x: 0, duration: 0.3, ease: 'back.out(2)' }] }, 0)
  // The hit: B lights up, recoils 3% of its width away from the link and springs back; a ring spreads from it.
  gsap.set('.cm__arrow', { autoAlpha: 0 })
  gsap.set('.cm__ring', { autoAlpha: 0 })
  tl.to('.cm__arrow', { autoAlpha: 1, duration: 0.15, ease: 'power1.out' }, arrive)
  tl.to('.cm__box', { fill: color('accent-soft'), stroke: color('accent'), duration: 0.25, ease: 'power2.out' }, arrive)
  tl.to('.cm__b', { keyframes: [{ x: 8, duration: 0.06, ease: 'power2.out' }, { x: 0, duration: 0.3, ease: 'back.out(3)' }] }, arrive)
  // The ring grows by the same margin on every side (its box, not a scale, so the stroke stays even).
  tl.fromTo('.cm__ring', { autoAlpha: 0.9, attr: { x: 820, y: 290, width: 260, height: 140, rx: 20, 'stroke-width': 8 } },
    { autoAlpha: 0, attr: { x: 786, y: 256, width: 328, height: 208, rx: 54, 'stroke-width': 1 }, duration: 0.36, ease: 'power2.out', immediateRender: false }, arrive)
  return tl
})
