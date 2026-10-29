import { defineScene } from '@lincyaw/addon-motion/scene'
import { frame, pick } from '../../../lengths/scenes/kit/frame.ts'
import { mix } from '../../../lengths/scenes/kit/fx/time.ts'
import { beats, oneOf, panel, PANEL_CSS, panelHtml, sineInOut, span } from './lib/stage.ts'

// Push in, with defineScene: one slow camera push toward a statement, so a still frame gains weight while it is read.
// States `push`, `hold` (0.8 + 3.2 s). `push`, 0.8 s: the camera eases into motion on sine.inOut, reaching 24% of
// the total push, so the move starts without a jolt; a vignette in the page colour closes in at the same time,
// keeping the eye on the centre. `hold`: the push creeps on linearly to its final scale (1.08, 1.12 or 1.18 for
// `intensity` subtle, standard, bold) for as long as the state lasts: a longer hold moves the same distance more
// slowly, so the words never move faster than they can be read. No exit: the next state or section cuts. Use on a
// title card, a definition or a quotation that the narration dwells on; the gallery's "hold that lives" at camera
// scale. Adapted from HyperFrames push-in (and drift-hold).
const IN = 0.8
const FINAL = { subtle: 1.08, standard: 1.12, bold: 1.18 } as const

export default defineScene(ctx => {
  const { root, parameters } = ctx
  const a = panel(parameters.a, { kicker: '定义', title: '梯度指向上升最快的方向', line: '所以沿负梯度走，损失下降最快' })
  const final = FINAL[oneOf(parameters.intensity, ['standard', 'subtle', 'bold'] as const)]
  const el = frame(root, `${PANEL_CSS}
    .pi__cam { position: absolute; inset: 0; transform-origin: 50% 50%; }
    .pi__vignette { position: absolute; inset: 0; pointer-events: none; opacity: 0;
      background: radial-gradient(ellipse 70% 70% at 50% 50%, transparent 55%, var(--pm-color-bg) 100%); }
    .pi .lf-title { white-space: normal; max-width: 80cqw; }
  `, `<div class="pi"><div class="pi__cam">${panelHtml(a, 'plain')}</div><div class="pi__vignette"></div></div>`)
  const cam = pick(el, '.pi__cam'), vignette = pick(el, '.pi__vignette')
  const { at, len } = beats(ctx)
  const glide = sineInOut
  const inDur = Math.min(IN, len(0) || IN)
  const inScale = 1 + (final - 1) * 0.24

  return (ms: number) => {
    const t = ms / 1000
    const p = glide(span(t, 0, inDur))
    const s = t < at(1) ? mix(1, inScale, p) : mix(inScale, final, span(t, at(1), len(1)))
    cam.style.transform = `scale(${s.toFixed(5)})`
    vignette.style.opacity = (0.9 * p).toFixed(3)
  }
})
