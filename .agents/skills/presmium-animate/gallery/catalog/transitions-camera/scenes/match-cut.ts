import { defineScene } from '@lincyaw/addon-motion/scene'
import { frame, pick } from '../../../lengths/scenes/kit/frame.ts'
import { ease, mix } from '../../../lengths/scenes/kit/fx/time.ts'
import { beats, esc, in5, out5, panel, sineInOut, span } from './lib/stage.ts'

// Match cut, with defineScene: a circle in scene A grows into a hard cut, and scene B opens on a circle of exactly the
// same size and place, so the shape carries the eye across two different scenes. States `push`, `land`, `hold`
// (1.4 + 0.9 + 1.6 s). `push`, 0–1.4 s: A's circle (its title inside, its line below) eases from 54% to 64% of
// full size in 0.45 s (power3.out, the subject presenting itself), then accelerates to 100% on power4.in, fastest
// as the state ends. The cut is the state boundary: in one frame A is gone and B is there, with no crossfade. `land`:
// B's circle, filled in the accent with B's title, leaves the cut at that same speed and decelerates to 74% on
// power4.out in 0.65 s, the mirror of A's ease, so the move reads as one; 0.1 s after the cut, B's kicker and line
// rise 2.4 cqh and fade in (power3.out, 0.55 s, 0.08 s apart), once the circle is slow enough to read. `hold`: the
// circle floats 0.8 cqh up and back (sine.inOut), a hold that lives. Use for "this becomes that": an input and its
// output, a question and its answer, a symbol and what it stands for. Adapted from HyperFrames match-cut.
const APPROACH = 0.45
const SETTLE = 0.65
const COPY_DELAY = 0.1, COPY_IN = 0.55, COPY_STAGGER = 0.08

export default defineScene(ctx => {
  const { root, parameters } = ctx
  const a = panel(parameters.a, { title: '提问', line: '“这张图里是什么？”' })
  const b = panel(parameters.b, { kicker: '模型的回答', title: '一只猫', line: '置信度 97%' })
  const el = frame(root, `
    .mc__scene { position: absolute; inset: 0; }
    .mc__a { background: var(--pm-color-surface); }
    .mc__b { background: var(--pm-color-accent-soft); }
    .mc__circle { position: absolute; left: 50%; top: 42%; width: 60cqh; height: 60cqh; margin: -30cqh 0 0 -30cqh; border-radius: 50%;
      display: flex; align-items: center; justify-content: center; text-align: center; }
    .mc__a .mc__circle { background: var(--pm-color-accent-soft); border: 0.3cqw solid var(--pm-color-accent); color: var(--pm-color-accent); }
    .mc__b .mc__circle { background: var(--pm-color-accent); color: var(--pm-color-on-accent); }
    .mc__circle .lf-title { font-size: 5.4cqw; }
    .mc__copy { position: absolute; left: 0; right: 0; top: 78cqh; display: flex; flex-direction: column; align-items: center; gap: 1.6cqh; }
    .mc__line { font-weight: 400; color: var(--pm-color-muted); }
  `, `<div class="mc__scene mc__a"><div class="mc__circle mc__ca"><div class="lf-title">${esc(a.title)}</div></div>
      ${a.line ? `<div class="mc__copy"><div class="lf-lead mc__line">${esc(a.line)}</div></div>` : ''}</div>
    <div class="mc__scene mc__b"><div class="mc__circle mc__cb"><div class="lf-title">${esc(b.title)}</div></div>
      <div class="mc__copy">${b.kicker ? `<div class="lf-chip mc__rise">${esc(b.kicker)}</div>` : ''}${b.line ? `<div class="lf-lead mc__line mc__rise">${esc(b.line)}</div>` : ''}</div></div>`)
  const sa = pick(el, '.mc__a'), sb = pick(el, '.mc__b'), ca = pick(el, '.mc__ca'), cb = pick(el, '.mc__cb')
  const rises = [...el.querySelectorAll<HTMLElement>('.mc__rise')]
  const { at, len } = beats(ctx)
  const present = ease.out4, accel = in5, decel = out5
  const copy = ease.out4, breathe = sineInOut
  const cut = at(1)
  const approach = Math.min(APPROACH, cut)

  return (ms: number) => {
    const t = ms / 1000
    const isA = t < cut
    sa.style.visibility = isA ? 'visible' : 'hidden'
    sb.style.visibility = isA ? 'hidden' : 'visible'
    if (isA) {
      const s = t < approach ? mix(0.54, 0.64, present(span(t, 0, approach))) : mix(0.64, 1, accel(span(t, approach, cut - approach)))
      ca.style.transform = `scale(${s.toFixed(4)})`
      return
    }
    const s = mix(1, 0.74, decel(span(t, cut, SETTLE)))
    // Hold: up 0.8 cqh and back, one sine breath over the state.
    const h = span(t, at(2), len(2))
    const y = -0.8 * breathe(h < 0.5 ? h * 2 : 2 - h * 2)
    cb.style.transform = `translateY(${y.toFixed(3)}cqh) scale(${s.toFixed(4)})`
    rises.forEach((node, i) => {
      const r = copy(span(t, cut + COPY_DELAY + i * COPY_STAGGER, COPY_IN))
      node.style.opacity = r.toFixed(3)
      node.style.transform = `translateY(${(2.4 * (1 - r)).toFixed(3)}cqh)`
    })
  }
})
