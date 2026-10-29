import { defineScene } from '@lincyaw/addon-motion/scene'
import { frame, pick } from '../../../lengths/scenes/kit/frame.ts'
import { ease, mix } from '../../../lengths/scenes/kit/fx/time.ts'
import { beats, esc, out5, sineInOut, span } from './lib/stage.ts'

// Pull back, with defineScene: the camera starts tight on one number, then pulls back to show what the number means.
// States `tight`, `pull`, `hold` (1.0 + 1.85 + 2.0 s). `tight`: the frame is the number alone at 2.2×, the rest of
// the scene cropped or faint at the edges, a claim on its own. `pull`, 1.85 s: one decelerating camera move, 2.2×
// to 1.055× on power4.out in 1.2 s (most of the travel at once, then a long brake, the "whip-out"), sinking 0.7
// cqh, then a 0.65 s sine.inOut drift to rest at 1×; the context that recontextualizes the number comes into view
// as the camera passes it (the headline above, two cards below), and the cards' contact shadows grow from 72% to
// full and fade in as the camera settles, so they land on a floor. The number is the same element throughout, and
// the camera scales about it, so it stays where it is. `hold`: the shadows breathe (opacity 0.78 → 0.68 → 0.78,
// width 97%), a hold that lives. Use when a number must be read differently once its context is seen: a training
// score next to the test score, a growth rate next to its base. Values made up for illustration carry the note.
// Adapted from HyperFrames pull-back-reveal.
const START = 2.2, LAND = 1.055
const WHIP = 1.2, DRIFT = 0.65

interface Card { label: string, value: string }

export default defineScene(ctx => {
  const { root, parameters } = ctx
  const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d)
  const detail = str(parameters.detail, '97.3%')
  const label = str(parameters.label, '准确率')
  const headline = str(parameters.headline, '这是训练集上的成绩')
  const note = str(parameters.note, '示例数据')
  const given = Array.isArray(parameters.cards) ? (parameters.cards as Card[]).filter(c => c && typeof c.label === 'string') : []
  const cards = (given.length ? given : [{ label: '测试集准确率', value: '61.8%' }, { label: '差距', value: '35.5 个点' }]).slice(0, 3)
  const el = frame(root, `
    .pb { position: absolute; inset: 0; background: var(--pm-color-bg); }
    .pb__world { position: absolute; inset: 0; transform-origin: 50% 44%; }
    .pb__head { position: absolute; left: 0; right: 0; top: 13cqh; text-align: center; }
    .pb__chip { position: absolute; left: 50%; top: 44cqh; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; gap: 0.8cqh;
      padding: 2cqh 3.4cqw; border-radius: 1.4cqw; background: var(--pm-color-accent-soft); border: 0.2cqw solid var(--pm-color-accent); }
    .pb__value { font: 600 ${7.4}cqw/1 var(--pm-font-mono); color: var(--pm-color-accent); font-variant-numeric: tabular-nums; }
    .pb__row { position: absolute; left: 0; right: 0; top: 66cqh; display: flex; justify-content: center; gap: 4cqw; }
    .pb__card { position: relative; width: 30cqw; padding: 2.2cqh 2cqw; display: flex; flex-direction: column; gap: 1cqh; }
    .pb__card .pb__v { font: 600 3.2cqw/1.1 var(--pm-font-mono); }
    .pb__shadow { position: absolute; left: 6%; right: 6%; bottom: -2.4cqh; height: 2.6cqh; border-radius: 50%;
      background: radial-gradient(closest-side, color-mix(in oklab, var(--pm-color-shadow) 22%, transparent), transparent); z-index: -1; }
    .pb__note { position: absolute; right: 3cqw; bottom: 3cqh; }
  `, `<div class="pb"><div class="pb__world">
      <div class="pb__head lf-title">${esc(headline)}</div>
      <div class="pb__chip"><div class="pb__value">${esc(detail)}</div><div class="lf-caption">${esc(label)}</div></div>
      <div class="pb__row">${cards.map(c => `<div class="lf-card pb__card"><div class="lf-caption">${esc(c.label)}</div><div class="pb__v">${esc(c.value)}</div><div class="pb__shadow"></div></div>`).join('')}</div>
    </div>${note ? `<div class="lf-caption pb__note">${esc(note)}</div>` : ''}</div>`)
  const world = pick(el, '.pb__world')
  const shadows = [...el.querySelectorAll<HTMLElement>('.pb__shadow')]
  const { at, len } = beats(ctx)
  const whip = out5, drift = sineInOut, ground = ease.out3
  const pullLen = len(1) || WHIP + DRIFT
  const w = Math.min(WHIP, pullLen * (WHIP / (WHIP + DRIFT))), d = Math.min(DRIFT, pullLen - w)

  return (ms: number) => {
    const t = ms / 1000
    const p1 = whip(span(t, at(1), w)), p2 = drift(span(t, at(1) + w, d))
    const s = p2 > 0 ? mix(LAND, 1, p2) : mix(START, LAND, p1)
    const y = p2 > 0 ? mix(0.7, 0, p2) : mix(0, 0.7, p1)
    // Scale about the number (50%, 44%), so the number stays where it is while the world shrinks.
    world.style.transform = `translateY(${y.toFixed(3)}cqh) scale(${s.toFixed(4)})`
    const g = ground(span(t, at(1) + w, d))
    const h = span(t, at(2), len(2)), breath = drift(h < 0.5 ? h * 2 : 2 - h * 2)
    for (const node of shadows) {
      node.style.opacity = (0.78 * g - 0.1 * breath).toFixed(3)
      node.style.transform = `scaleX(${(mix(0.72, 1, g) - 0.03 * breath).toFixed(4)}) scaleY(${mix(0.72, 1, g).toFixed(4)})`
    }
  }
})
