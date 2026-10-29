import { defineScene } from '@lincyaw/addon-motion/scene'
import { frame, pick } from '../../../lengths/scenes/kit/frame.ts'
import { ease } from '../../../lengths/scenes/kit/fx/time.ts'
import { beats, esc, num, oneOf, panel, PANEL_CSS, panelHtml, span } from './lib/stage.ts'

// Zoom through, with defineScene: the camera flies into one card of a grid until the card is the frame, and the card is
// panel B. States `grid`, `zoom`, `b` (1.2 + 2.4 + 1.6 s). `grid`: the overview, up to nine cards in three columns,
// the focus card in the accent. `zoom`, 2.4 s on power2.inOut: the zoom is exponential in the eased progress
// (scale = S^e, S = 100/28, the factor at which a 28-wide card fills the frame), so it feels like constant speed
// into depth, while the focus card glides to the centre on the same ease; the other cards are pushed outward from
// it by up to 47 cqw (900 px of a 1920 frame) and fade (parallax: they fly past faster than the camera moves, so
// they read as nearer) and blur a little with the speed. The focus card already holds B's panel in miniature, the
// same element growing to full size, so nothing is swapped: identity is kept. `b`: B fills the frame, sharp, at
// exactly 1:1. `direction: out` plays the move backwards: B fills the frame and the camera pulls out to show where it
// sits among the others. Adapted from HyperFrames parallax-zoom and parallax-unzoom (and the zoom-through, scale
// and cinematic-zoom transitions).
const CARD = 28, GAP = 3              // cq units: a card is 28 cqw × 28 cqh, so 16:9 like the frame
const S = 100 / CARD                  // the scale at which the focus card fills the frame
const PUSH = 900 / 19.2               // cqw of outward push for the other cards

export default defineScene(ctx => {
  const { root, parameters } = ctx
  const raw = Array.isArray(parameters.cards) ? (parameters.cards as unknown[]).filter((c): c is string => typeof c === 'string') : []
  const cards = (raw.length ? raw : ['分词', '嵌入', '位置编码', '前馈层', '注意力', '残差连接', '层归一化', '解码', '采样']).slice(0, 9)
  const focus = Math.round(num(parameters.focus, Math.min(4, cards.length - 1), 0, cards.length - 1))
  const b = panel(parameters.b, { kicker: '第 5 讲', title: '注意力', line: '每个词看向整句话' })
  const reverse = oneOf(parameters.direction, ['in', 'out'] as const) === 'out'
  const rows = Math.ceil(cards.length / 3)
  const top = (100 - (rows * CARD + (rows - 1) * GAP)) / 2, left = (100 - (3 * CARD + 2 * GAP)) / 2
  const pos = cards.map((_, i) => ({ x: left + (i % 3) * (CARD + GAP), y: top + Math.floor(i / 3) * (CARD + GAP) }))
  const el = frame(root, `${PANEL_CSS}
    .zt { position: absolute; inset: 0; background: var(--pm-color-bg); }
    .zt__world { position: absolute; left: 0; top: 0; width: 100cqw; height: 100cqh; transform-origin: 0 0; }
    .zt__card { position: absolute; width: ${CARD}cqw; height: ${CARD}cqh; border-radius: 0.9cqw; overflow: hidden;
      background: var(--pm-color-surface); border: 0.15cqw solid var(--pm-color-line-strong);
      display: flex; align-items: center; justify-content: center; font-size: ${(6.2 / S).toFixed(3)}cqw; font-weight: 600; }
    .zt__focus { background: var(--pm-color-accent-soft); border-color: var(--pm-color-accent); }
    .zt__mini { position: absolute; left: 0; top: 0; width: 100cqw; height: 100cqh; transform: scale(${(1 / S).toFixed(5)}); transform-origin: 0 0; }
  `, `<div class="zt"><div class="zt__world">${cards.map((c, i) => i === focus
    ? `<div class="zt__card zt__focus" style="left: ${pos[i]!.x}cqw; top: ${pos[i]!.y}cqh;"><div class="zt__mini">${panelHtml(b, 'accent')}</div></div>`
    : `<div class="zt__card" style="left: ${pos[i]!.x}cqw; top: ${pos[i]!.y}cqh;">${esc(c)}</div>`).join('')}</div></div>`)
  const world = pick(el, '.zt__world')
  const nodes = [...el.querySelectorAll<HTMLElement>('.zt__card')]
  const F = { x: pos[focus]!.x + CARD / 2, y: pos[focus]!.y + CARD / 2 }
  // Unit vectors from the focus card to each other card, in a square space (cqw and cqh are different lengths).
  const out = pos.map(p => {
    const dx = (p.x + CARD / 2 - F.x) * 16, dy = (p.y + CARD / 2 - F.y) * 9, n = Math.hypot(dx, dy) || 1
    return { x: dx / n, y: (dy / n) * (16 / 9) }
  })
  const { at, len } = beats(ctx)
  const zoom = ease.inOut3
  const dur = len(1) || 2.4

  return (ms: number) => {
    const t = ms / 1000
    const p0 = span(t, at(1), dur), p = reverse ? 1 - p0 : p0
    const e = zoom(p)
    const s = S ** e
    // The focus card's centre glides from where it is to the frame's centre while the world scales about it.
    const cx = F.x + (50 - F.x) * e, cy = F.y + (50 - F.y) * e
    world.style.transform = `translate(${(cx - F.x * s).toFixed(4)}cqw, ${(cy - F.y * s).toFixed(4)}cqh) scale(${s.toFixed(5)})`
    const v = p0 > 0 && p0 < 1 ? (zoom(Math.min(1, p + 0.01)) - zoom(Math.max(0, p - 0.01))) / 0.02 : 0
    nodes.forEach((node, i) => {
      if (i === focus) return
      const k = (PUSH * e) / s
      node.style.transform = `translate(${(out[i]!.x * k).toFixed(3)}cqw, ${(out[i]!.y * k).toFixed(3)}cqh)`
      node.style.opacity = (1 - e).toFixed(3)
      node.style.filter = v > 0.05 ? `blur(${((0.25 * v) / s).toFixed(3)}cqw)` : ''
    })
  }
})
