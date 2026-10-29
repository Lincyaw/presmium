import { defineScene } from '@lincyaw/addon-motion/scene'
import { frame, pick } from '../../../lengths/scenes/kit/frame.ts'
import { ease, mix } from '../../../lengths/scenes/kit/fx/time.ts'
import { beats, num, oneOf, panel, PANEL_CSS, panelHtml, span } from './lib/stage.ts'

// Iris, with defineScene: a circle opens from a point of panel A and uncovers panel B. States `a`, `open`, `b`
// (0.9 + 1.1 + 1.6 s). `a`: panel A at rest, to be read. `open`, 1.1 s: one confident pass on power2.inOut, the
// radius going from 0 to the distance from the origin to the farthest corner, so the circle clears the frame
// exactly as the state ends; an accent rim rides the same radius (one value drives clip and rim, so their edges
// never part), fades in over the first 0.18 s and out over the last 0.24 s, before it would leave the corners.
// While the iris opens, A desaturates and dims under a veil (the classic register: the past in grey, the new in
// colour), and B's content settles from 106% to 100% on power2.out, landing before the circle does, so the eye
// arrives at a still picture. `b`: B holds with a 1% drift, so the rest does not look frozen. The origin (`x`, `y`,
// in percent) is where the cause is: open from the button, the word or the dot that leads to B. Adapted from
// HyperFrames iris-reveal.
const OPEN = 1.1        // s, the measured iris pass
const RIM_IN = 0.18
const RIM_OUT = 0.24

export default defineScene(ctx => {
  const { root, parameters, width, height } = ctx
  const a = panel(parameters.a, { kicker: '旧做法', title: '逐词翻译', line: '每个词只看它自己' })
  const b = panel(parameters.b, { kicker: '新做法', title: '注意力', line: '每个词看向整句话' })
  const x = num(parameters.x, 50, 0, 100), y = num(parameters.y, 50, 0, 100)
  const register = oneOf(parameters.register, ['color', 'plain'] as const)
  const el = frame(root, `${PANEL_CSS}
    .ir__veil { position: absolute; inset: 0; background: var(--pm-color-bg); opacity: 0; }
    .ir__rim { position: absolute; left: ${x}%; top: ${y}%; border-radius: 50%; border: 0.3cqw solid var(--pm-color-accent); opacity: 0; pointer-events: none; }
  `, `${panelHtml(a, 'plain', 'ir__a')}<div class="ir__veil"></div>${panelHtml(b, 'accent', 'ir__b')}<div class="ir__rim"></div>`)
  const pa = pick(el, '.ir__a'), veil = pick(el, '.ir__veil'), pb = pick(el, '.ir__b'), rim = pick(el, '.ir__rim')
  const bodyB = pick(pb, '.tp__body')
  // The farthest corner from the origin, in px: the radius at which the circle covers the frame.
  const full = Math.hypot((Math.max(x, 100 - x) / 100) * width, (Math.max(y, 100 - y) / 100) * height) + 2
  const { at, len } = beats(ctx)
  const open = ease.inOut3, settle = ease.out3
  const pass = Math.min(OPEN, len(1) || OPEN)

  return (ms: number) => {
    const t = ms / 1000
    const p = span(t, at(1), pass)
    const r = open(p) * full
    pb.style.clipPath = `circle(${r.toFixed(2)}px at ${x}% ${y}%)`
    pb.style.visibility = r > 0 ? 'visible' : 'hidden'
    Object.assign(rim.style, { width: `${2 * r}px`, height: `${2 * r}px`, transform: 'translate(-50%, -50%)' })
    const rimIn = span(t, at(1), RIM_IN), rimOut = span(t, at(1) + pass - RIM_OUT, RIM_OUT)
    rim.style.opacity = String(p > 0 && p < 1 ? rimIn * (1 - rimOut) : 0)
    const q = register === 'color' ? open(p) : 0
    pa.style.filter = q > 0.001 ? `grayscale(${q.toFixed(3)})` : ''
    veil.style.opacity = (0.35 * q).toFixed(3)
    // B's content settles inside the circle, then drifts 1% while it holds.
    const drift = span(t, at(2), len(2))
    bodyB.style.transform = `scale(${(mix(1.06, 1, settle(span(t, at(1), pass * 0.8))) + 0.01 * drift).toFixed(4)})`
  }
})
