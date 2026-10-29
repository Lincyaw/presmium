import { defineScene } from '@lincyaw/addon-motion/scene'
import { frame, pick } from '../../../lengths/scenes/kit/frame.ts'
import { ease, mix } from '../../../lengths/scenes/kit/fx/time.ts'
import { beats, panel, PANEL_CSS, panelHtml, sineInOut, span } from './lib/stage.ts'

// Rack focus, with defineScene: two cards at different depths, and the focus moves once from the near one to the far one.
// States `near`, `rack`, `far` (1.0 + 0.7 + 1.6 s). One value, the focal plane φ (0 on card A, near; 1 on card B,
// far), drives every readout of each card from its distance to the plane, |depth − φ|: blur (0 to 0.48 cqw), scale
// (104.5% in focus to 93% out of it), brightness (a veil up to 45%) and the accent outline that marks the sharp
// card; so blur, size and light change together and read as one lens. `near`: the stage fades in over 0.32 s
// (power2.out), A sharp, B soft and dim behind it. `rack`, 0.7 s on sine.inOut: φ travels 0 → 1, and the cards shift
// apart by 1 cqw with it (parallax: the near card moves more). `far`: B holds sharp while the cards drift apart
// slowly, A down 1.15 cqh and B up 0.75 cqh (sine.inOut), so the depth keeps reading. Use to move attention between
// two things on screen without cutting: the loss curve, then the validation curve; the claim, then its caveat.
// Adapted from HyperFrames focus-rack (and rack-focus, camera-rig-depth-stack).
const BLUR = 0.48, RACK = 0.7, STAGE_IN = 0.32

export default defineScene(ctx => {
  const { root, parameters } = ctx
  const a = panel(parameters.a, { kicker: '训练集', title: '损失一路下降', line: '模型记住了训练数据' })
  const b = panel(parameters.b, { kicker: '验证集', title: '第 8 轮后回升', line: '这才是过拟合的信号' })
  const el = frame(root, `${PANEL_CSS}
    .rf { position: absolute; inset: 0; background: var(--pm-color-bg); }
    .rf__card { position: absolute; border-radius: 1.4cqw; overflow: hidden; border: 0.18cqw solid var(--pm-color-line-strong);
      box-shadow: 0 1.2cqw 3cqw color-mix(in oklab, var(--pm-color-shadow) 14%, transparent); }
    .rf__a { left: 7cqw; top: 38cqh; width: 50cqw; height: 50cqh; z-index: 2; }
    .rf__b { left: 47cqw; top: 9cqh; width: 46cqw; height: 46cqh; z-index: 1; }
    .rf__card .lf-title { font-size: 4.4cqw; }
    .rf__card .lf-lead { font-size: 2.4cqw; }
    .rf__veil { position: absolute; inset: 0; background: var(--pm-color-bg); }
    .rf__ring { position: absolute; inset: 0; border-radius: inherit; border: 0.3cqw solid var(--pm-color-accent); }
  `, `<div class="rf"><div class="rf__card rf__b">${panelHtml(b, 'accent')}<div class="rf__veil"></div><div class="rf__ring"></div></div>
     <div class="rf__card rf__a">${panelHtml(a, 'plain')}<div class="rf__veil"></div><div class="rf__ring"></div></div></div>`)
  const stage = pick(el, '.rf')
  const cards = [{ node: pick(el, '.rf__a'), depth: 0, shift: -1.2, drift: 1.15 }, { node: pick(el, '.rf__b'), depth: 1, shift: 0.6, drift: -0.75 }]
  const parts = cards.map(c => ({ ...c, veil: pick(c.node, '.rf__veil'), ring: pick(c.node, '.rf__ring') }))
  const { at, len } = beats(ctx)
  const rack = sineInOut, fade = ease.out3

  return (ms: number) => {
    const t = ms / 1000
    stage.style.opacity = fade(span(t, 0, Math.min(STAGE_IN, len(0) || STAGE_IN))).toFixed(3)
    const phi = rack(span(t, at(1), Math.min(RACK, len(1) || RACK)))
    const hold = rack(span(t, at(2), len(2)))
    for (const c of parts) {
      const off = Math.abs(c.depth - phi)
      c.node.style.filter = off > 0.01 ? `blur(${(BLUR * off).toFixed(3)}cqw)` : ''
      c.node.style.transform = `translate(${(c.shift * phi).toFixed(3)}cqw, ${(c.drift * hold).toFixed(3)}cqh) scale(${mix(1.045, 0.93, off).toFixed(4)})`
      c.veil.style.opacity = (0.45 * off).toFixed(3)
      c.ring.style.opacity = (1 - off).toFixed(3)
    }
  }
})
