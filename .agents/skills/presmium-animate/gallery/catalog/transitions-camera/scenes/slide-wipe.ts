import { defineScene } from '@lincyaw/addon-motion/scene'
import { frame, pick } from '../../../lengths/scenes/kit/frame.ts'
import { ease, mix, speed } from '../../../lengths/scenes/kit/fx/time.ts'
import { axisBlur, beats, DEFS_CSS, inOut4, oneOf, panel, PANEL_CSS, panelHtml, span } from './lib/stage.ts'

// Wipe, slide and push, with defineScene: panel B replaces panel A along one direction. States `a`, `move`, `b`
// (0.8 + 0.9 + 1.6 s). Three modes, each with its source's measured timing:
// - `wipe` (0.9 s, power3.inOut): B is uncovered by a clip edge that runs across the frame from the side B comes
//   from; B's content slides the last 3.1 cqw and settles from 104% while the edge passes, and A drifts 3.6 cqw the
//   same way, shrinks to 96% and goes out of focus (0.26 cqw), so it reads as falling behind. An accent seam rides
//   the edge while it moves (in over 0.1 s, out over the last 0.15 s).
// - `slide` (0.74 s, power3.inOut): B slides over A on a shadow, A recedes 28% the same way at 94% under a dimming
//   veil (parallax: the far layer moves less); B's content rises 2.2 cqh into place 0.46 s in, after B has nearly
//   landed, so the words do not move while they are read.
// - `push` (0.5 s, power3.inOut): A and B on one strip, a full frame; a blur along the motion follows the speed
//   (peak 0.6 cqw at the fastest, middle frame) and is gone at both ends.
// `b`: B holds. Direction `left` means B comes in from the right and things move left (the reading direction,
// "next"); `right` is "back"; `up` and `down` for vertical decks. Adapted from HyperFrames directional-wipe,
// page-slide and transitions-push.
const MODES = { wipe: { dur: 0.9 }, slide: { dur: 0.74 }, push: { dur: 0.5 } } as const
const VEC = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] } as const

export default defineScene(ctx => {
  const { root, parameters, width } = ctx
  const a = panel(parameters.a, { kicker: '第 1 步', title: '读入一句话', line: '“猫坐在垫子上”' })
  const b = panel(parameters.b, { kicker: '第 2 步', title: '切成词元', line: '猫 · 坐 · 在 · 垫子 · 上' })
  const mode = oneOf(parameters.mode, ['wipe', 'slide', 'push'] as const)
  const dir = oneOf(parameters.direction, ['left', 'right', 'up', 'down'] as const)
  const [vx, vy] = VEC[dir]
  const el = frame(root, `${PANEL_CSS}${DEFS_CSS}
    .sw__layer { position: absolute; inset: 0; }
    .sw__veil { position: absolute; inset: 0; background: var(--pm-color-bg); opacity: 0; }
    .sw__b--slide { box-shadow: 0 0 5cqw color-mix(in oklab, var(--pm-color-shadow) 22%, transparent); }
    .sw__seam { position: absolute; background: var(--pm-color-accent); opacity: 0; }
  `, `<div class="sw__layer sw__move"><div class="sw__layer sw__a">${panelHtml(a, 'plain')}<div class="sw__veil"></div></div>
     <div class="sw__layer sw__b ${mode === 'slide' ? 'sw__b--slide' : ''}">${panelHtml(b, 'accent')}</div></div><div class="sw__seam"></div>`)
  const move = pick(el, '.sw__move'), la = pick(el, '.sw__a'), lb = pick(el, '.sw__b'), veil = pick(el, '.sw__veil'), seam = pick(el, '.sw__seam')
  const bodyA = pick(la, '.tp__body'), bodyB = pick(lb, '.tp__body')
  const blur = axisBlur(el, move, width, vx ? 'x' : 'y')
  const { at, len } = beats(ctx)
  const travel = inOut4, rise = ease.out3
  const dur = Math.min(MODES[mode].dur, len(1) || MODES[mode].dur)
  // Seam: a hairline across the frame, perpendicular to the motion.
  Object.assign(seam.style, vx ? { top: '0', bottom: '0', width: '0.3cqw', marginLeft: '-0.15cqw' } : { left: '0', right: '0', height: '0.3cqh', marginTop: '-0.15cqh' })
  const tr = (x: number, y: number, s = 1) => `translate(${x.toFixed(3)}cqw, ${y.toFixed(3)}cqh) scale(${s.toFixed(4)})`

  return (ms: number) => {
    const t = ms / 1000
    const p = span(t, at(1), dur), e = travel(p)
    lb.style.visibility = p > 0 ? 'visible' : 'hidden'
    if (mode === 'wipe') {
      const left = 100 * (1 - e)
      const edges = { left: [0, 0, 0, left], right: [0, left, 0, 0], up: [left, 0, 0, 0], down: [0, 0, left, 0] }[dir]
      lb.style.clipPath = `inset(${edges.map(v => `${v.toFixed(3)}%`).join(' ')})`
      bodyB.style.transform = tr(-vx * 3.1 * (1 - e), -vy * 3.1 * (1 - e), mix(1.04, 1, e))
      bodyA.style.transform = tr(vx * 3.6 * e, vy * 3.6 * e, mix(1, 0.96, e))
      bodyA.style.filter = e > 0.01 ? `blur(${(0.26 * e).toFixed(3)}cqw)` : ''
      const pos = { left: 100 * (1 - e), right: 100 * e, up: 100 * (1 - e), down: 100 * e }[dir]
      if (vx) seam.style.left = `${pos}%`; else seam.style.top = `${pos}%`
      seam.style.opacity = String(p > 0 && p < 1 ? span(t, at(1), 0.1) * (1 - span(t, at(1) + dur - 0.15, 0.15)) : 0)
    } else if (mode === 'slide') {
      lb.style.transform = tr(-vx * 100 * (1 - e), -vy * 100 * (1 - e))
      la.style.transform = tr(vx * 28 * e, vy * 28 * e, mix(1, 0.94, e))
      veil.style.opacity = (0.4 * e).toFixed(3)
      const r = rise(span(t, at(1) + 0.46, 0.28))
      bodyB.style.transform = tr(0, 2.2 * (1 - r))
      bodyB.style.opacity = String(p > 0 ? r : 0)
    } else {
      la.style.transform = tr(vx * 100 * e, vy * 100 * e)
      lb.style.transform = tr(-vx * 100 * (1 - e), -vy * 100 * (1 - e))
      blur(p > 0 && p < 1 ? (0.6 * speed(travel, p)) / speed(travel, 0.5) : 0)
    }
  }
})
