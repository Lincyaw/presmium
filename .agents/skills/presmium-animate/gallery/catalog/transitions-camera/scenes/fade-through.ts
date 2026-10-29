import { defineScene } from '@lincyaw/addon-motion/scene'
import { frame, pick } from '../../../lengths/scenes/kit/frame.ts'
import { ease, mix } from '../../../lengths/scenes/kit/fx/time.ts'
import { beats, num, oneOf, panel, PANEL_CSS, panelHtml, span } from './lib/stage.ts'

// Fade through, with defineScene: A fades out, the frame passes through a wash, and B fades in out of it: the calm cut
// between two unrelated things. States `a`, `fade`, `b` (0.8 + 0.9 + 1.6 s). `fade`, 0.9 s: A goes out over 0.45 s
// (power2.inOut) while the wash rises to its peak at 0.35 s (power2.inOut) and falls over the next 0.45 s; B comes
// in from 0.35 s over 0.55 s (power2.out), its content settling from 102%, so the eye meets B while the wash is
// still clearing and the two never show at full strength together. The wash is the page colour (`paper`, a dip to
// white on the light page), `ink` (a dip to black, white on the dark page) or `accent` (a flash in the accent);
// `strength` caps it (1 a full flash, 0.3 a veil); `shape: bloom` concentrates it in the centre. `b`: B holds.
// Use between sections of a talk or two topics; for "this becomes that", prefer the match cut. Adapted from
// HyperFrames fade-through (and flash-through-white, the light-based transitions and transitions-dissolve).
const OUT = 0.45, WASH_UP = 0.35, WASH_DOWN = 0.45, IN = 0.55
const COLORS = { paper: 'var(--pm-color-bg)', ink: 'var(--pm-color-ink)', accent: 'var(--pm-color-accent)' } as const

export default defineScene(ctx => {
  const { root, parameters } = ctx
  const a = panel(parameters.a, { kicker: '第一部分', title: '为什么要分词', line: '模型只认识数字' })
  const b = panel(parameters.b, { kicker: '第二部分', title: '怎样分词', line: '从字符到子词' })
  const wash = COLORS[oneOf(parameters.wash, ['paper', 'ink', 'accent'] as const)]
  const strength = num(parameters.strength, 1, 0.1, 1)
  const bloom = oneOf(parameters.shape, ['flat', 'bloom'] as const) === 'bloom'
  const el = frame(root, `${PANEL_CSS}
    .ft__wash { position: absolute; inset: 0; opacity: 0;
      background: ${bloom ? `radial-gradient(ellipse 75% 75% at 50% 50%, ${wash} 30%, transparent 100%)` : wash}; }
  `, `${panelHtml(a, 'plain', 'ft__a')}${panelHtml(b, 'accent', 'ft__b')}<div class="ft__wash"></div>`)
  const pa = pick(el, '.ft__a'), pb = pick(el, '.ft__b'), washEl = pick(el, '.ft__wash'), bodyB = pick(pb, '.tp__body')
  const { at } = beats(ctx)
  const io = ease.inOut3, out = ease.out3

  return (ms: number) => {
    const t = ms / 1000
    const t0 = at(1)
    pa.style.opacity = (1 - io(span(t, t0, OUT))).toFixed(3)
    const w = t < t0 + WASH_UP ? io(span(t, t0, WASH_UP)) : 1 - io(span(t, t0 + WASH_UP, WASH_DOWN))
    washEl.style.opacity = (strength * w).toFixed(3)
    const r = out(span(t, t0 + WASH_UP, IN))
    pb.style.opacity = r.toFixed(3)
    pb.style.visibility = r > 0 ? 'visible' : 'hidden'
    bodyB.style.transform = `scale(${mix(1.02, 1, r).toFixed(4)})`
  }
})
