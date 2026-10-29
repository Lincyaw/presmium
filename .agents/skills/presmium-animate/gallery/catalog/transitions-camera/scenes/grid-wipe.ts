import { defineScene } from '@lincyaw/addon-motion/scene'
import { frame, pick } from '../../../lengths/scenes/kit/frame.ts'
import { ranks } from '../../../lengths/scenes/kit/fx/random.ts'
import { ease } from '../../../lengths/scenes/kit/fx/time.ts'
import { beats, num, oneOf, panel, PANEL_CSS, panelHtml, span } from './lib/stage.ts'

// Grid wipe, with defineScene: a 16 × 9 grid of tiles covers panel A in a wave and uncovers panel B in the opposite wave.
// States `a`, `cover`, `reveal`, `b` (0.8 + 1.2 + 1.2 + 1.6 s). `cover`, 1.2 s: each tile grows from nothing to
// its full square in 0.6 s (power2.inOut); the starts spread over 0.6 s by distance from the origin (`from`:
// `center`, a corner, or `random`, seeded), so the wave comes from a place that means something (the clicked tile,
// the start of the reading order). Under the full cover A becomes B. `reveal`, 1.2 s: the tiles shrink away in the
// reverse wave, from the far edges back to the origin, so the new picture opens toward the place the old one closed
// from. `b`: B holds. Tiles are in the accent; the grid, not the panels, is the subject while it runs. Use as a
// chapter break or a reset; between two related states prefer a move. Adapted from HyperFrames grid-pixelate-wipe
// (and transitions-grid).
const COLS = 16, ROWS = 9
const TILE = 0.6, SPREAD = 0.6

export default defineScene(ctx => {
  const { root, parameters } = ctx
  const a = panel(parameters.a, { kicker: '第 3 章', title: '线性回归', line: '用一条直线拟合数据' })
  const b = panel(parameters.b, { kicker: '第 4 章', title: '逻辑回归', line: '用一条曲线给出概率' })
  const from = oneOf(parameters.from, ['center', 'top-left', 'bottom-right', 'random'] as const)
  const seed = num(parameters.seed, 3)
  const cells = Array.from({ length: COLS * ROWS }, (_, i) => ({ c: i % COLS, r: Math.floor(i / COLS) }))
  const origin = { center: [(COLS - 1) / 2, (ROWS - 1) / 2], 'top-left': [0, 0], 'bottom-right': [COLS - 1, ROWS - 1], random: [0, 0] }[from]
  // Each tile's place in the wave, 0..1: distance from the origin (in tile units, so the wave is round), or a seeded rank.
  const order = ranks(cells.length, seed)
  const dist = cells.map(({ c, r }) => Math.hypot(c - origin[0]!, r - origin[1]!))
  const far = Math.max(...dist)
  const wave = cells.map((_, i) => (from === 'random' ? order[i]! / (cells.length - 1) : dist[i]! / far))
  const el = frame(root, `${PANEL_CSS}
    .gw__grid { position: absolute; inset: 0; }
    .gw__tile { position: absolute; width: ${100 / COLS + 0.15}cqw; height: ${100 / ROWS + 0.25}cqh; background: var(--pm-color-accent); transform: scale(0); }
  `, `${panelHtml(a, 'plain', 'gw__a')}${panelHtml(b, 'accent', 'gw__b')}<div class="gw__grid">${cells.map(({ c, r }) =>
    `<div class="gw__tile" style="left: ${(c * 100) / COLS}cqw; top: ${(r * 100) / ROWS}cqh;"></div>`).join('')}</div>`)
  const pa = pick(el, '.gw__a'), pb = pick(el, '.gw__b')
  const tiles = [...el.querySelectorAll<HTMLElement>('.gw__tile')]
  const { at } = beats(ctx)
  const grow = ease.inOut3

  return (ms: number) => {
    const t = ms / 1000
    const swapped = t >= at(2)
    pa.style.visibility = swapped ? 'hidden' : 'visible'
    pb.style.visibility = swapped ? 'visible' : 'hidden'
    tiles.forEach((tile, i) => {
      const s = swapped
        ? 1 - grow(span(t, at(2) + SPREAD * (1 - wave[i]!), TILE))    // reverse wave: far tiles leave first
        : grow(span(t, at(1) + SPREAD * wave[i]!, TILE))
      tile.style.transform = `scale(${s.toFixed(4)})`
    })
  }
})
