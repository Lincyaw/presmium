import { defineScene } from '@lincyaw/addon-motion/scene'
import { frame, pick } from '../../../lengths/scenes/kit/frame.ts'
import { ease, mix } from '../../../lengths/scenes/kit/fx/time.ts'
import { beats, panel, PANEL_CSS, panelHtml, span } from './lib/stage.ts'

// Card flip, with defineScene: a card turns over to show its back, panel A on the front and panel B on the back, the way a
// flash card turns from question to answer. States `front`, `flip`, `back` (1.2 + 1.0 + 1.6 s). `flip`: 0–0.15 s, the
// card winds up, turning 8° the wrong way (power2.out); 0.15–0.75 s, it turns over on power2.inOut (the source's
// 0.6 s) to 183°, lifting toward the viewer on the way (scale up to 106% at the half turn, the shadow growing and
// softening with the height: one height value drives both); 0.75–1 s, it settles back 3° to rest (power2.out), the
// click of a card landing. The far face is hidden by backface-visibility, so the swap happens exactly edge-on.
// `back`: B holds. Use for question and answer, term and definition, claim and evidence: the two faces belong to
// one object. Adapted from HyperFrames transitions-3d.
const WIND = 0.15, TURN = 0.6, SETTLE = 0.25

export default defineScene(ctx => {
  const { root, parameters } = ctx
  const a = panel(parameters.a, { kicker: '问题', title: '为什么除以 √d？', line: '注意力分数的缩放' })
  const b = panel(parameters.b, { kicker: '答案', title: '防止点积过大', line: '否则 softmax 会饱和，梯度消失' })
  const el = frame(root, `${PANEL_CSS}
    .fl { position: absolute; inset: 0; background: var(--pm-color-bg); perspective: 140cqw; }
    .fl__shadow { position: absolute; left: 22cqw; right: 22cqw; top: 84cqh; height: 6cqh; border-radius: 50%;
      background: radial-gradient(closest-side, color-mix(in oklab, var(--pm-color-shadow) 22%, transparent), transparent); }
    .fl__card { position: absolute; left: 20cqw; top: 14cqh; width: 60cqw; height: 66cqh; transform-style: preserve-3d; }
    .fl__face { position: absolute; inset: 0; border-radius: 1.6cqw; overflow: hidden; backface-visibility: hidden;
      border: 0.18cqw solid var(--pm-color-line-strong); }
    .fl__back { transform: rotateY(180deg); border-color: var(--pm-color-accent); }
    .fl__face .lf-title { font-size: 5cqw; }
    .fl__face .lf-lead { font-size: 2.6cqw; }
  `, `<div class="fl"><div class="fl__shadow"></div><div class="fl__card">
      <div class="fl__face fl__front">${panelHtml(a, 'plain')}</div><div class="fl__face fl__back">${panelHtml(b, 'accent')}</div></div></div>`)
  const card = pick(el, '.fl__card'), shadow = pick(el, '.fl__shadow')
  const { at } = beats(ctx)
  const wind = ease.out3, turn = ease.inOut3, settle = ease.out3

  return (ms: number) => {
    const t = ms / 1000
    const t0 = at(1)
    let angle: number
    if (t < t0 + WIND) angle = -8 * wind(span(t, t0, WIND))
    else if (t < t0 + WIND + TURN) angle = mix(-8, 183, turn(span(t, t0 + WIND, TURN)))
    else angle = mix(183, 180, settle(span(t, t0 + WIND + TURN, SETTLE)))
    // Height: zero at rest, highest when the card is edge-on.
    const lift = Math.sin((Math.max(0, Math.min(180, angle)) / 180) * Math.PI)
    card.style.transform = `rotateY(${angle.toFixed(3)}deg) scale(${(1 + 0.06 * lift).toFixed(4)})`
    shadow.style.transform = `scale(${(1 + 0.15 * lift).toFixed(4)}, ${(1 + 0.4 * lift).toFixed(4)})`
    shadow.style.opacity = (0.8 - 0.35 * lift).toFixed(3)
  }
})
