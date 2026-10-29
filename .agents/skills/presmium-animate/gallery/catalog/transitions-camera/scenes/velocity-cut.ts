import { defineScene } from '@lincyaw/addon-motion/scene'
import { frame, pick } from '../../../lengths/scenes/kit/frame.ts'
import { axisBlur, beats, DEFS_CSS, in5, num, oneOf, out5, panel, PANEL_CSS, panelHtml, span } from './lib/stage.ts'

// Velocity cut, with defineScene: card A flies off and card B flies in along the same line, cut at the fastest moment.
// States `a`, `cut`, `b` (0.7 + 1.0 + 1.6 s). `cut` lasts T = 1 s, split at `split` = 0.33 (about 1:2 in time):
// 0–0.33 s, A accelerates 34 cqw (26 cqh vertically) on power4.in; at 0.33 s, its peak speed, the cards swap in
// one frame; 0.33–1 s, B starts on the far side of the same line and decelerates on power4.out, the mirror ease.
// B's distance is A's times the time ratio (34 × 0.67 / 0.33 ≈ 69 cqw), and power4.in ends at 4× its average
// speed as power4.out starts at 4× its own, so the speed on both sides of the cut is the same and the eye reads
// one motion. The blur along the line and the fade follow the speed: 0 at rest, 0.63 cqw (12 px of 1920) and 72%
// opacity at the cut on both sides, so the seam has nothing to give it away. `b`: B at rest. Use between two
// things that are not the same object (cause and effect, step and step) when a match cut has no shape to match.
// The source's blur was the same in every direction (CSS blur); here it is along the motion only. Adapted from
// HyperFrames cut-the-curve (and the louder whip-pan-cut).
const VEC = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] } as const
const DIST = { x: 34, y: 26 }      // cqw / cqh travelled by A
const SEAM_BLUR = 12 / 19.2        // cqw
const SEAM_OPACITY = 0.72

export default defineScene(ctx => {
  const { root, parameters, width } = ctx
  const a = panel(parameters.a, { kicker: '输入', title: '一张猫的照片', line: '224 × 224 像素' })
  const b = panel(parameters.b, { kicker: '输出', title: '猫 · 0.97', line: '分类器给出的概率' })
  const dir = oneOf(parameters.direction, ['left', 'right', 'up', 'down'] as const)
  const split = num(parameters.split, 0.33, 0.1, 0.9)
  const [vx, vy] = VEC[dir]
  const el = frame(root, `${PANEL_CSS}${DEFS_CSS}
    .vc { position: absolute; inset: 0; background: var(--pm-color-bg); }
    .vc__card { position: absolute; left: 22cqw; top: 20cqh; width: 56cqw; height: 60cqh; border-radius: 1.6cqw; overflow: hidden;
      border: 0.18cqw solid var(--pm-color-line-strong); box-shadow: 0 1.2cqw 3cqw color-mix(in oklab, var(--pm-color-shadow) 14%, transparent); }
    .vc__card .lf-title { font-size: 5cqw; }
  `, `<div class="vc"><div class="vc__card vc__a">${panelHtml(a, 'plain')}</div><div class="vc__card vc__b">${panelHtml(b, 'accent')}</div></div>`)
  const ca = pick(el, '.vc__a'), cb = pick(el, '.vc__b')
  const axis = vx ? 'x' : 'y'
  const blurA = axisBlur(el, ca, width, axis), blurB = axisBlur(el, cb, width, axis)
  const { at, len } = beats(ctx)
  const out = in5, inn = out5
  const T = len(1) || 1, cutAt = T * split, inDur = T - cutAt
  const d = vx ? DIST.x : DIST.y, unit = vx ? 'cqw' : 'cqh'
  const entry = (d * inDur) / cutAt
  const move = (node: HTMLElement, v: number) => { node.style.transform = vx ? `translateX(${(vx * v).toFixed(3)}${unit})` : `translateY(${(vy * v).toFixed(3)}${unit})` }

  return (ms: number) => {
    const t = ms / 1000
    const u = t - at(1)
    const before = u < cutAt
    ca.style.visibility = before ? 'visible' : 'hidden'
    cb.style.visibility = before ? 'hidden' : 'visible'
    if (before) {
      const p = span(u, 0, cutAt)
      move(ca, d * out(p))
      const k = p ** 3       // speed of power4.in relative to its end speed: 4p³ / 4
      blurA(SEAM_BLUR * k)
      ca.style.opacity = (1 - (1 - SEAM_OPACITY) * k).toFixed(3)
    } else {
      const p = span(u, cutAt, inDur)
      move(cb, -entry * (1 - inn(p)))
      const k = (1 - p) ** 3 // speed of power4.out relative to its start speed
      blurB(SEAM_BLUR * k)
      cb.style.opacity = (1 - (1 - SEAM_OPACITY) * k).toFixed(3)
    }
  }
})
