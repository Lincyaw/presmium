import { animeScene } from '@lincyaw/addon-motion/scene'
import { frame } from '../../kit/frame.ts'
import { ICONS } from '../../kit/icons.ts'
import { uid } from '../../kit/fx/ids.ts'

// Gooey split, with Anime.js springs on an SVG goo filter (one state, `split`): one document becomes three forms
// without a word. 0–0.2 s: an accent drop holding a page icon gathers itself (it narrows and grows taller, the
// anticipation) while the page fades. 0.2–0.5 s: two drops pull slowly out of it to the left and right while the
// centre gives up its volume; the filter (blur, then a steep alpha threshold, then the crisp source on top) makes
// the overlapping circles read as one liquid, so the drop stretches and pinches into two thin necks. 0.5–0.9 s: the
// necks snap and the three drops spring apart and settle (about 12% overshoot at 0.7 s). 0.52–0.92 s: the web,
// slides and video icons pop up inside the drops, riding them (the same tween moves a drop and its icon).
// 0.9–1 s: rest. A spring started from a standstill rushes through the moment the necks break, so the slow stretch
// comes first (an eased keyframe) and the spring only takes the snap. Only centres and radii move, so every frame is
// exact; the threshold acts on alpha, so the token fill works in both themes; it is steep (alpha × 48), since a
// gentler one leaves the thinning necks blurred. The blur is sized to the drops (σ ≈ 0.3 r), the filter region
// is fixed in user units around the farthest overshoot. The spring's settling tail runs past 1 s, invisibly (under
// a user unit). Parameters: `icons` (three names from `kit/icons.ts`, default web, slides, video), `tone` (a colour
// token, default `accent`).
const R0 = 150, R1 = 100, D = 340, STRETCH = 226, SIGMA = 30
const SOURCE = `<svg class="lf-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 6 H29 L37 14 V42 H13 Z M29 6 V14 H37 M19 23 H31 M19 30 H31 M19 37 H26" /></svg>`

/** An icon's markup placed as a square of `size` centred on the origin of its group. */
const place = (icon: string, size: number) => icon.replace('<svg ', `<svg x="${-size / 2}" y="${-size / 2}" width="${size}" height="${size}" `)

export default animeScene(({ root, anime, color, parameters }) => {
  const names = (parameters.icons as (keyof typeof ICONS)[] | undefined) ?? ['web', 'slides', 'video']
  const tone = color((parameters.tone as string | undefined) ?? 'accent'), on = color('on-accent')
  const goo = uid('gs-goo')
  const sides = [-1, 0, 1]
  frame(root, '', `<svg viewBox="0 0 1280 720" width="100%" height="100%">
    <defs><filter id="${goo}" filterUnits="userSpaceOnUse" x="40" y="100" width="1200" height="520">
      <feGaussianBlur in="SourceGraphic" stdDeviation="${SIGMA}" result="b" />
      <feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 48 -21" result="goo" />
      <feComposite in="SourceGraphic" in2="goo" operator="atop" />
    </filter></defs>
    <g filter="url(#${goo})"><g transform="translate(640 360)"><g class="gs__body" style="transform-box: view-box; transform-origin: 0 0">
      ${sides.map(s => `<g class="gs__move" data-side="${s}"><circle class="${s ? 'gs__drop' : 'gs__core'}" r="${s ? 70 : R0}" fill="${tone}" /></g>`).join('')}
    </g></g></g>
    <g transform="translate(640 360)" style="color: ${on}">
      <g class="gs__source" style="transform-box: fill-box; transform-origin: center">${place(SOURCE, 120)}</g>
      ${sides.map((s, i) => `<g class="gs__move" data-side="${s}"><g class="gs__icon" style="transform-box: fill-box; transform-origin: center" opacity="0">${place(ICONS[names[i] ?? 'web'], 96)}</g></g>`).join('')}
    </g>
  </svg>`)
  const tl = anime.createTimeline({ autoplay: false })
  const snap = anime.spring({ bounce: 0.45, duration: 380 })
  // anticipation: the drop narrows along the coming split and grows taller; the page it holds fades.
  tl.add('.gs__body', { scaleX: [{ from: 1, to: 0.86, duration: 200, ease: 'inOutSine' }, { to: 1, duration: 280, ease: 'inOutSine' }],
    scaleY: [{ from: 1, to: 1.1, duration: 200, ease: 'inOutSine' }, { to: 1, duration: 280, ease: 'inOutSine' }] }, 0)
  tl.add('.gs__source', { opacity: [1, 0], scale: [1, 0.6], duration: 180, ease: 'inQuad' }, 40)
  // stretch: the outer drops (and their icons, the same tween) pull out slowly while the centre gives up its
  // volume, until two thin necks are all that join them; then they snap apart on a spring.
  for (const side of [-1, 1]) {
    tl.add(`.gs__move[data-side="${side}"]`, { translateX: [
      { from: 0, to: side * STRETCH, duration: 290, ease: 'inOutSine' },
      { to: side * D, ease: snap },
    ] }, 200)
  }
  tl.add('.gs__core', { r: [{ from: R0, to: 112, duration: 290, ease: 'inOutSine' }, { to: R1, ease: snap }] }, 200)
  tl.add('.gs__drop', { r: [70, R1], duration: 290, ease: 'outQuad' }, 200)
  // forms: each drop shows what it became, once the necks have broken.
  tl.add('.gs__icon', { opacity: [0, 1], scale: [0.4, 1], duration: 300, delay: anime.stagger(50), ease: 'outBack(2)' }, 520)
  return tl
})
