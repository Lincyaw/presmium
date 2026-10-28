import { motionScene } from '@lincyaw/addon-motion/scene'
import type { MotionSequence } from '@lincyaw/addon-motion/scene'
import { frame, pick } from '../../kit/frame.ts'
import { ICONS } from '../../kit/icons.ts'
import { uid } from '../../kit/fx/ids.ts'
import { blurFilter } from '../../kit/fx/defs.ts'
import { glowAlpha, isDark } from '../../kit/fx/theme.ts'

// A border beam, in Motion (state `beam`, 1 s). 0–0.7 s: a short bright segment races once around the card's
// rounded border, clockwise from the top edge, with a soft glow and a tail that fades behind it; the card itself
// does not move. 0.6–0.9 s: as the beam closes the loop it blooms at its start point and fades, and the card
// takes the light: its border turns accent, a halo and a coloured shadow grow, the icon lights up. 0.9–1 s: rest.
// Every stroke is one path with Motion's `pathLength` (the dash), `pathSpacing: 1` (a gap longer than the rest of
// the path, so the dash never wraps) and `pathOffset`; the strokes share one head position and one ease, so the
// tail stays attached to the head. The outline is a path, not a `rect`, so the beam starts where it looks natural.
// The light of the card is one CSS variable (`--lit`) that the CSS turns into border, halo and shadow, so it seeks
// like any other value; a CSS conic-gradient animation would run on the wall clock and not export.
export default motionScene(({ root, motion, color, parameters }) => {
  const icon = ICONS[(parameters.icon as keyof typeof ICONS | undefined) ?? 'slides'] ?? ICONS.slides
  // The card is 40 × 26 cqw; the overlay's units are 0.1 cqw, its path runs along the middle of the border.
  const W = 400, H = 260, b = 0.9, r = 19.1, x0 = 120
  const outline = `M ${x0} ${b} H ${W - b - r} A ${r} ${r} 0 0 1 ${W - b} ${b + r} V ${H - b - r} A ${r} ${r} 0 0 1 ${W - b - r} ${H - b}`
    + ` H ${b + r} A ${r} ${r} 0 0 1 ${b} ${H - b - r} V ${b + r} A ${r} ${r} 0 0 1 ${b + r} ${b} H ${x0}`
  const glow = uid('bb-glow')
  // The tail: overlapping dashes of growing length, each faint, so the light thins out behind the head.
  const tails = [0.06, 0.12, 0.19, 0.27, 0.36, 0.46]
  const strength = glowAlpha(color('bg'), 0.75) / 0.75
  // The hottest part: white light on the dark page; on the light page white on a white card reads as a gap, so the
  // core is the accent deepened instead.
  const dark = isDark(color('bg'))
  const hot = dark ? 'var(--pm-color-sheen)' : 'color-mix(in oklab, var(--pm-color-accent) 60%, var(--pm-color-shadow))'
  const f = frame(root, `
    .bb { position: absolute; inset: 0; display: grid; place-items: center; }
    .bb__card { --lit: 0; position: relative; width: 40cqw; height: 26cqw; border-radius: 2cqw; padding: 3.2cqw;
      border-color: color-mix(in oklab, var(--pm-color-accent) calc(var(--lit) * 100%), var(--pm-color-line-strong));
      box-shadow: 0 0 0 calc(var(--lit) * 0.4cqw) color-mix(in oklab, var(--pm-color-accent) calc(var(--lit) * 22%), transparent),
        0 calc(var(--lit) * 1.4cqw) calc(var(--lit) * 5cqw) color-mix(in oklab, var(--pm-color-accent) calc(var(--lit) * 30%), transparent); }
    .bb__head { display: flex; align-items: center; gap: 2cqw; }
    .bb__tile { display: grid; place-items: center; width: 8.4cqw; height: 8.4cqw; border-radius: 1.6cqw;
      background: color-mix(in oklab, var(--pm-color-accent-soft) calc(var(--lit) * 100%), var(--pm-color-sunk));
      color: color-mix(in oklab, var(--pm-color-accent) calc(var(--lit) * 100%), var(--pm-color-muted)); }
    .bb__tile .lf-icon { width: 5.2cqw; height: 5.2cqw; }
    .bb__bars { display: grid; gap: 1.1cqw; flex: 1; }
    .bb__bar { height: 1.5cqw; border-radius: 1cqw; background: var(--pm-color-line); }
    .bb__bar--title { width: 70%; height: 1.9cqw; background: color-mix(in oklab, var(--pm-color-ink) 22%, transparent); }
    .bb__lines { display: grid; gap: 1.1cqw; margin-top: 2.6cqw; }
    .bb__pill { width: 11cqw; height: 3.2cqw; margin-top: 2.4cqw; border-radius: 99cqw;
      background: color-mix(in oklab, var(--pm-color-accent) calc(var(--lit) * 100%), var(--pm-color-sunk)); }
    .bb__beam { position: absolute; inset: -0.18cqw; width: calc(100% + 0.36cqw); height: calc(100% + 0.36cqw); overflow: visible; pointer-events: none; }
    .bb__beam path { fill: none; stroke-linecap: butt; stroke-linejoin: round; }
    .bb__tail { stroke: color-mix(in oklab, var(--pm-color-accent) ${Math.round(9 * strength + 4)}%, transparent); stroke-width: 3; }
    .bb__glow { stroke: color-mix(in oklab, var(--pm-color-accent) ${Math.round(85 * strength)}%, transparent); stroke-width: 9; }
    .bb__bright { stroke: var(--pm-color-accent); stroke-width: 4.6; }
    .bb__core { stroke: ${hot}; stroke-width: 2; }
    .bb__flare { fill: var(--pm-color-accent); }
    .bb__flare-core { fill: var(--pm-color-sheen); }
  `, `<div class="bb"><div class="lf-card bb__card">
      <div class="bb__head"><div class="bb__tile">${icon}</div><div class="bb__bars"><div class="bb__bar bb__bar--title"></div><div class="bb__bar" style="width: 45%"></div></div></div>
      <div class="bb__lines"><div class="bb__bar"></div><div class="bb__bar" style="width: 84%"></div></div>
      <div class="bb__pill"></div>
      <svg class="bb__beam" viewBox="0 0 ${W} ${H}" aria-hidden="true">
        <defs>${blurFilter(glow, 6, 6, { x: -60, y: -60, w: W + 120, h: H + 120 })}</defs>
        <g class="bb__light">
          ${tails.map(() => `<path class="bb__tail" d="${outline}" />`).join('')}
          <path class="bb__glow" d="${outline}" filter="url(#${glow})" />
          <path class="bb__bright" d="${outline}" />
          <path class="bb__core" d="${outline}" />
        </g>
        <g class="bb__flarebox" filter="url(#${glow})"><circle class="bb__flare" cx="${x0}" cy="${b}" r="14" /></g>
        <circle class="bb__flare-core" cx="${x0}" cy="${b}" r="${dark ? 4 : 0}" />
      </svg>
    </div></div>`)
  const card = pick(f, '.bb__card')
  const paths = [...f.querySelectorAll<SVGPathElement>('.bb__beam path')]
  const lengths = [...tails, 0.14, 0.09, 0.04]
  // One lap: every stroke's head goes from the start point (0) round to it again (1); offset = head − length.
  const lap = { at: 0, duration: 0.7, ease: [0.55, 0, 0.25, 1] as const }
  const flare = [pick(f, '.bb__flarebox'), pick(f, '.bb__flare-core')]
  const seq: MotionSequence = [
    ...paths.map((path, i): MotionSequence[number] => {
      const length = lengths[i]!
      return [path, { pathLength: [length, length], pathSpacing: [1, 1], pathOffset: [-length, 1 - length] }, { ...lap, ease: [...lap.ease] }]
    }),
    [pick(f, '.bb__light'), { opacity: [1, 0] }, { at: 0.62, duration: 0.22, ease: 'easeIn' }],
    [flare, { scale: [0, 1.4], opacity: [0, 1] }, { at: 0.58, duration: 0.14, ease: 'easeOut' }],
    [flare, { scale: 2.2, opacity: 0 }, { at: 0.72, duration: 0.2, ease: 'easeOut' }],
    [card, { '--lit': [0, 1] }, { at: 0.62, duration: 0.28, ease: [0.2, 0.8, 0.3, 1] }],
  ]
  return motion.animate(seq)
})
