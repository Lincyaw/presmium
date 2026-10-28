import { gsapScene } from '@lincyaw/addon-motion/scene'
import { frame } from '../../kit/frame.ts'
import type { Point } from '../../kit/fx/paths.ts'
import { matchStart } from '../../kit/fx/sample.ts'

// Morph with anticipation, with GSAP MorphSVG: a play button becomes a done button. State `morph` (1 s).
// 0–0.12 s: the button is pressed (scale 0.94) and the icon crouches, shrinking to 0.85 and turning back 12°: the
// wind-up that gives the next move its force. 0.12–0.55 s: the icon turns half a circle and morphs from the play
// triangle into a check on one ease (back.out, overshooting the turn by about 7%), so it reads as one object
// changing, not parts moving; it grows back with a springier overshoot, and the button turns from the accent to
// the success colour. 0.4–0.75 s: a shockwave ring thins as it spreads and six sparks shoot out and fade, the
// reaction to the change. 0.75–1 s: rest on the upright check. The check is not symmetric under a half turn, so its target outline
// is drawn turned by 180°, and the turn brings it upright. Both outlines have six points, the triangle's start
// rotated to match the check's (`matchStart`), so the morph needs no shapeIndex search and never twists.
const C = 24   // the icon's 48×48 box, centred on (C, C)
const CHECK: Point[] = [[15.1, 20.9], [20.5, 26.3], [33.4, 13.4], [37.6, 17.6], [20.5, 34.7], [10.9, 25.1]]
// The play triangle as six points (corners and edge midpoints), its centroid a little right of centre: optically centred.
const TRIANGLE: Point[] = [[19, 13.5], [27.5, 19], [36, 24.5], [27.5, 30], [19, 35.5], [19, 24.5]]
const path = (points: readonly Point[]) => `M ${points.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(' L ')} Z`

export default gsapScene(({ root, gsap, color }) => {
  const turned = CHECK.map(([x, y]): Point => [2 * C - x, 2 * C - y])
  const from = path(matchStart(TRIANGLE, turned)), to = path(turned)
  const R = 92, CX = 640, CY = 360, S = 3   // button radius and centre, icon scale (the check spans 44% of the button)
  const sparks = Array.from({ length: 6 }, (_, i) => {
    const a = ((i * 60 - 90) * Math.PI) / 180, r0 = R + 30, r1 = R + 86
    return `<path class="ma__spark" d="M ${CX + r0 * Math.cos(a)} ${CY + r0 * Math.sin(a)} L ${CX + r1 * Math.cos(a)} ${CY + r1 * Math.sin(a)}" stroke="var(--pm-color-ok)" stroke-width="7" stroke-linecap="round" />`
  }).join('')
  frame(root, '', `<svg viewBox="0 0 1280 720" width="100%" height="100%">
    <circle class="ma__ring" cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="var(--pm-color-ok)" stroke-width="10" />
    ${sparks}
    <g class="ma__btn"><circle class="ma__disc" cx="${CX}" cy="${CY}" r="${R}" fill="var(--pm-color-accent)" />
      <g transform="translate(${CX - C * S} ${CY - C * S}) scale(${S})"><path class="ma__icon" d="${from}" fill="var(--pm-color-on-accent)" stroke="var(--pm-color-on-accent)" stroke-width="1.2" stroke-linejoin="round" /></g>
    </g>
  </svg>`)

  const tl = gsap.timeline()
  const origin = `${C} ${C}`
  gsap.set('.ma__btn', { svgOrigin: `${CX} ${CY}` })
  gsap.set('.ma__icon', { svgOrigin: origin })
  gsap.set('.ma__ring', { svgOrigin: `${CX} ${CY}`, autoAlpha: 0 })
  gsap.set('.ma__spark', { drawSVG: '0% 0%', autoAlpha: 0 })
  // The press and the wind-up.
  tl.to('.ma__btn', { keyframes: [{ scale: 0.94, duration: 0.12, ease: 'power2.out' }, { scale: 1, duration: 0.35, ease: 'back.out(3)' }] }, 0)
  tl.to('.ma__icon', { scale: 0.85, rotation: -12, duration: 0.12, ease: 'power2.in' }, 0)
  // The turn and the morph on one ease; the size on a springier one; the colour as it turns.
  tl.to('.ma__icon', { rotation: 180, morphSVG: { shape: to, shapeIndex: 0 }, duration: 0.43, ease: 'back.out(1.4)' }, 0.12)
  tl.to('.ma__icon', { scale: 1, duration: 0.43, ease: 'back.out(3)' }, 0.12)
  tl.to('.ma__disc', { fill: color('ok'), duration: 0.25, ease: 'power2.out' }, 0.22)
  // The reaction: a ring that thins as it spreads, and sparks that shoot out, thin and fade while still lines (drawn
  // down to nothing, a round cap would stay as a dot).
  tl.fromTo('.ma__ring', { autoAlpha: 0.8, scale: 1, attr: { 'stroke-width': 10 } },
    { autoAlpha: 0, scale: 1.75, attr: { 'stroke-width': 1.5 }, duration: 0.35, ease: 'power2.out', immediateRender: false }, 0.4)
  tl.set('.ma__spark', { autoAlpha: 1 }, 0.42)
  tl.to('.ma__spark', { keyframes: { drawSVG: ['0% 0%', '0% 100%', '65% 100%'], easeEach: 'power2.out' }, duration: 0.33 }, 0.42)
  tl.to('.ma__spark', { attr: { 'stroke-width': 3 }, autoAlpha: 0, duration: 0.15, ease: 'power1.in' }, 0.58)
  return tl
})
