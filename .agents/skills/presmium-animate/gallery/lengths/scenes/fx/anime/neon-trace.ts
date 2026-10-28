import { animeScene } from '@lincyaw/addon-motion/scene'
import { frame } from '../../kit/frame.ts'
import { clock } from '../../kit/anime-fx.ts'
import { blurFilter } from '../../kit/fx/defs.ts'
import { samplePath } from '../../kit/fx/sample.ts'
import { uid } from '../../kit/fx/ids.ts'
import { clamp01 } from '../../kit/fx/time.ts'
import { isDark } from '../../kit/fx/theme.ts'

// Neon trace, with Anime.js drawables (one state, `trace`). 0–0.6 s: the strokes of the Presmium mark are traced
// by light-painting heads, started 60 ms apart (page 0–0.54 s, fold 0.06–0.44 s, play triangle 0.12–0.6 s); each
// stroke is three copies of one path: a wide blurred halo, the core and a thin hot streak in `sheen` riding the head.
// 0.6–0.9 s: the play triangle floods with colour from its centre (a clipped circle growing), and the halo cools to
// a lower glow. 0.9–1 s: rest.
// The streak is not a drawable tween but a clock: its head is the core's head (the same ease of the same
// progress) and its tail is the head's position 50 ms earlier, so it stretches with speed and shrinks into the end
// of the stroke; a drawable snake with keyframes ('0 0', '0.92 1', '1 1') splits its duration evenly and runs ahead
// of the core, and draw values past 1 wrap the dash round to the path's start (its pattern repeats every
// pathLength + 10). The halo is a blurred copy, never a blend mode, and is stronger
// on the dark page. Parameters: `paths` (SVG path data in a 120 × 120 box, traced in order) and `filled` (the
// indices of the closed paths that flood when traced), `tone` (a colour token, default `accent`).
const MARK = ['M 30 14 H 72 L 94 36 V 106 H 30 Z', 'M 72 14 V 36 H 94', 'M 52 52 L 76 67 L 52 82 Z']
const START = 0, GAP = 60, TRACE = [540, 380, 480], FILL = 600, FILL_LENGTH = 300

export default animeScene(({ root, anime, color, parameters }) => {
  const paths = (parameters.paths as string[] | undefined) ?? MARK
  const filled = (parameters.filled as number[] | undefined) ?? [paths.length - 1]
  const tone = color((parameters.tone as string | undefined) ?? 'accent'), sheen = color('sheen')
  const dark = isDark(color('bg'))
  const blur = uid('nt-blur'), clips = paths.map(() => uid('nt-clip'))
  const box = { x: -20, y: -20, w: 160, h: 160 }
  // Each flood grows from the shape's centroid to its farthest point (path geometry, measured on a detached path).
  const floods = filled.map(i => {
    const pts = samplePath(paths[i]!, 64)
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length
    return { i, cx, cy, r: Math.max(...pts.map(p => Math.hypot(p[0] - cx, p[1] - cy))) + 2 }
  })
  frame(root, '', `<svg viewBox="0 0 1280 720" width="100%" height="100%">
    <defs>${blurFilter(blur, 4, 4, box)}${filled.map(i => `<clipPath id="${clips[i]}"><path d="${paths[i]}" /></clipPath>`).join('')}</defs>
    <g transform="translate(640 360) scale(3.9) translate(-62 -60)" fill="none" stroke-linecap="round" stroke-linejoin="round">
      ${floods.map(f => `<circle class="nt__flood" data-i="${f.i}" cx="${f.cx}" cy="${f.cy}" r="0" fill="${tone}" clip-path="url(#${clips[f.i]})" />`).join('')}
      <g class="nt__halo" filter="url(#${blur})">${paths.map((d, i) => `<path class="nt__h" data-i="${i}" d="${d}" stroke="${tone}" stroke-width="15" />`).join('')}</g>
      ${paths.map((d, i) => `<path class="nt__c" data-i="${i}" d="${d}" stroke="${tone}" stroke-width="7" />`).join('')}
      ${paths.map((d, i) => `<path class="nt__t" data-i="${i}" d="${d}" stroke="${sheen}" stroke-width="2.6" />`).join('')}
    </g>
  </svg>`)
  const tl = anime.createTimeline({ autoplay: false })
  const ease = anime.eases.inOutCubic
  paths.forEach((_, i) => {
    const start = START + i * GAP, length = TRACE[i] ?? TRACE.at(-1)!
    tl.add(anime.svg.createDrawable(`.nt__h[data-i="${i}"], .nt__c[data-i="${i}"]`), { draw: ['0 0', '0 1'], duration: length, ease: 'inOutCubic' }, start)
    const [tip] = anime.svg.createDrawable(`.nt__t[data-i="${i}"]`)
    const lag = 50 / length
    clock(tl, start, length, p => {
      const head = ease(p), tail = ease(clamp01((p - lag) / (1 - lag)))
      tip!.setAttribute('draw', `${tail.toFixed(4)} ${head.toFixed(4)}`)
    })
  })
  // The flood: a circle clipped to the shape grows from the centre until it covers the corners.
  for (const f of floods) tl.add(`.nt__flood[data-i="${f.i}"]`, { r: [0, f.r], duration: FILL_LENGTH, ease: 'inOutQuad' }, FILL)
  // The glow is brightest while the light is moving and cools once the mark has formed.
  const peak = dark ? 0.85 : 0.5, rest = dark ? 0.5 : 0.28
  tl.add('.nt__halo', { opacity: [peak, rest], duration: FILL_LENGTH, ease: 'inOutSine' }, FILL)
  return tl
})
