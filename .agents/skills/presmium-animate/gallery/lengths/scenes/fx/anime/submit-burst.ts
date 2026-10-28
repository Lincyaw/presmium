import { animeScene } from '@lincyaw/addon-motion/scene'
import { frame } from '../../kit/frame.ts'
import { POINTER, POINTER_CSS } from '../../kit/atoms.ts'
import { burst } from '../../kit/anime-fx.ts'
import { uid } from '../../kit/fx/ids.ts'

// Submit burst, with Anime.js (one state, `submit`, 2 s): one button goes through a whole submission and keeps its
// identity. 0–0.4 s: the pointer, already on "发布", presses; the button dips and a ripple spreads from the
// pressed point, clipped to the button. 0.4–0.7 s: the label fades and the pill shrinks into a hollow ring (its
// `width` and `x` tween, `rx` stays half the height) while the pointer steps aside. 0.7–1.2 s: a progress arc (a
// drawable snake) spins on the ring, grows to close it and turns `ok`. 1.2–1.7 s: the ring floods with `ok` from its
// centre, the check draws, and a shock ring and twelve sparks (drawable snakes, seeded lengths, `stagger` with a
// seeded jitter) shoot out. 1.45–1.8 s: the circle springs back into the pill, the check slides to its left and
// "已发布" appears. 1.8–2 s: rest. The two labels are two text elements whose opacities swap (a non-numeric `tl.set`
// is not undone when seeking back); the spinner's turn is a fixed linear tween; the fill is a growing circle, since a
// colour tween from `surface` to `ok` passes through a muddy grey; the shock ring's radius, width and opacity have
// their own eases (on one `outExpo` the ring is gone after a few frames). The final spring is within half a percent
// by 1.78 s; its settling tail runs past 2 s, invisibly. Parameters: `label` (default 发布), `done` (default 已发布),
// `tone` (the button's colour token, default `accent`).
const CX = 640, CY = 360, W = 460, H = 136, R = H / 2, FONT = 54
const PRESS = { x: 744, y: 398 }

export default animeScene(({ root, anime, color, parameters }) => {
  const label = (parameters.label as string | undefined) ?? '发布'
  const done = (parameters.done as string | undefined) ?? '已发布'
  const tone = color((parameters.tone as string | undefined) ?? 'accent'), ok = color('ok'), on = color('on-accent')
  const surface = color('surface'), line = color('line'), sheen = color('sheen')
  const clip = uid('sb-clip')
  const sparks = burst(12, 4)
  frame(root, POINTER_CSS, `<svg viewBox="0 0 1280 720" width="100%" height="100%" style="position: absolute; inset: 0; font-family: var(--pm-font-sans)">
    <defs><clipPath id="${clip}"><rect x="${CX - W / 2}" y="${CY - R}" width="${W}" height="${H}" rx="${R}" /></clipPath></defs>
    <g class="sb__fx" fill="none" stroke="${ok}" stroke-linecap="round">
      <circle class="sb__shock" cx="${CX}" cy="${CY}" r="${R + 8}" stroke-width="16" opacity="0" />
      ${sparks.map((s, i) => {
        const r0 = R + 38, r1 = r0 + 44 + 56 * s.length
        const c = Math.cos(s.angle), n = Math.sin(s.angle)
        return `<path class="sb__spark" d="M ${CX + c * r0} ${CY + n * r0} L ${CX + c * r1} ${CY + n * r1}" stroke-width="${i % 2 ? 6 : 8}" />`
      }).join('')}
    </g>
    <g class="sb__btn" style="transform-box: fill-box; transform-origin: center">
      <rect class="sb__body" x="${CX - W / 2}" y="${CY - R}" width="${W}" height="${H}" rx="${R}" fill="${tone}" stroke="${line}" stroke-width="0" />
      <circle class="sb__ripple" cx="${PRESS.x}" cy="${PRESS.y}" r="0" fill="${sheen}" opacity="0" clip-path="url(#${clip})" />
      <circle class="sb__flood" cx="${CX}" cy="${CY}" r="0" fill="${ok}" />
      <text class="sb__label" x="${CX}" y="${CY + FONT * 0.36}" text-anchor="middle" font-size="${FONT}" font-weight="600" fill="${on}">${label}</text>
      <g transform="translate(${CX} ${CY})"><g class="sb__spin" style="transform-box: view-box; transform-origin: 0 0">
        <circle class="sb__arc" r="${R}" fill="none" stroke="${tone}" stroke-width="8" stroke-linecap="round" transform="rotate(-90)" />
      </g></g>
      <g transform="translate(${CX} ${CY})"><g class="sb__mark">
        <path class="sb__check" d="M -27 1 L -9 19 L 27 -18" fill="none" stroke="${on}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" />
      </g></g>
      <text class="sb__done" x="${CX + 50}" y="${CY + FONT * 0.36}" text-anchor="middle" font-size="${FONT}" font-weight="600" fill="${on}" opacity="0">${done}</text>
    </g>
  </svg><div class="lf-pointer-layer">${POINTER}</div>`)
  const tl = anime.createTimeline({ autoplay: false })
  // press: the pointer and the button dip together; the ripple starts where the tip is.
  tl.add('.lf-pointer-layer', { translateX: [`${(PRESS.x / 1280) * 100}%`, `${(PRESS.x / 1280) * 100}%`], translateY: [`${(PRESS.y / 720) * 100}%`, `${(PRESS.y / 720) * 100}%`], duration: 1 }, 0)
  tl.add('.lf-pointer', { scale: [{ from: 1, to: 0.82, duration: 90, ease: 'outQuad' }, { to: 1, duration: 200, ease: 'outQuad' }] }, 0)
  tl.add('.lf-pointer__ring', { scale: [0.2, 1.4], opacity: [{ from: 0, to: 0.6, duration: 1 }, { to: 0, duration: 400, ease: 'outQuad' }], duration: 400, ease: 'outCubic' }, 60)
  tl.add('.sb__btn', { scale: [{ from: 1, to: 0.95, duration: 100, ease: 'outQuad' }, { to: 1, duration: 260, ease: 'outBack(2)' }] }, 0)
  tl.add('.sb__ripple', { r: [0, 420], duration: 340, ease: 'outQuad' }, 60)
  tl.add('.sb__ripple', { opacity: [{ from: 0, to: 0.38, duration: 1 }, { to: 0, duration: 340, ease: 'inQuad' }] }, 60)
  // shrink: the label goes, the pill becomes a ring of its own height; the pointer steps aside.
  tl.add('.sb__label', { opacity: [1, 0], duration: 120, ease: 'outQuad' }, 380)
  tl.add('.sb__body', { width: [W, H], x: [CX - W / 2, CX - R], duration: 300, ease: 'inOutCubic' }, 400)
  tl.add('.sb__body', { fill: [tone, surface], duration: 240, ease: 'outQuad' }, 430)
  tl.add('.sb__body', { strokeWidth: [0, 8], duration: 200, ease: 'outQuad' }, 500)
  tl.add('.lf-pointer-layer', { translateX: `${(PRESS.x / 1280) * 100 + 7}%`, translateY: `${(PRESS.y / 720) * 100 + 13}%`, duration: 500, ease: 'inOutCubic' }, 380)
  // spin: a snake runs round the ring, then grows to close it.
  tl.add('.sb__spin', { rotate: [0, 760], duration: 560, ease: 'linear' }, 680)
  const [arc] = anime.svg.createDrawable('.sb__arc')
  tl.add(arc!, { draw: [{ from: '0 0', to: '0 0.3', duration: 160, ease: 'outQuad' }, { to: '0 0.3', duration: 210 }, { to: '0 1', duration: 170, ease: 'inOutCubic' }] }, 680)
  // done: the closing arc and its track turn `ok`, the ring fills, the check draws and the burst goes off.
  const fill = 1210
  tl.add('.sb__arc', { stroke: [tone, ok], duration: 90, ease: 'outQuad' }, fill - 90)
  tl.add('.sb__body', { stroke: [line, ok], duration: 90, ease: 'outQuad' }, fill - 90)
  // The ring floods from its centre (a colour tween would pass through a muddy mix); the pill under it turns `ok`
  // once covered, so it carries the colour when it grows again.
  tl.add('.sb__flood', { r: [0, R], duration: 150, ease: 'outCubic' }, fill)
  tl.add('.sb__body', { fill: ok, duration: 1 }, fill + 150)
  tl.add('.sb__arc', { opacity: [1, 0], duration: 1 }, fill + 150)
  tl.add(anime.svg.createDrawable('.sb__check'), { draw: ['0 0', '0 1'], duration: 220, ease: 'outCubic' }, fill + 60)
  tl.add('.sb__shock', {
    r: { from: R + 8, to: R + 190, ease: 'outExpo' }, strokeWidth: { from: 16, to: 0, ease: 'outCubic' },
    opacity: [{ from: 0, to: 1, duration: 1 }, { to: 0, duration: 459, ease: 'inQuad' }], duration: 460,
  }, fill)
  tl.add(anime.svg.createDrawable('.sb__spark'), { draw: ['0 0', '0 0.6', '1 1'], duration: 420, ease: 'outCubic', delay: anime.stagger(8, { jitter: 6, seed: 4 }) }, fill + 20)
  // expand: back into a pill on a spring, carrying the check to its left; the new label arrives.
  const back = anime.spring({ bounce: 0.35, duration: 300 })
  tl.add('.sb__body', { width: W, x: CX - W / 2, ease: back }, 1450)
  tl.add('.sb__mark', { translateX: [0, -103], ease: back }, 1450)
  tl.add('.sb__done', { opacity: [0, 1], translateX: [-18, 0], duration: 260, ease: 'outCubic' }, 1540)
  return tl
})
