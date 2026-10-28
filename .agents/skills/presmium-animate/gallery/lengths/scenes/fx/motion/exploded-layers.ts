import { motionScene } from '@lincyaw/addon-motion/scene'
import type { MotionSequence } from '@lincyaw/addon-motion/scene'
import { frame } from '../../kit/frame.ts'

// Exploded layers, in Motion (state `explode`, 1.5 s). 0–0.6 s: a flat app window (base, document blocks, the
// player's timeline and highlight, the window chrome) turns into an isometric view, shrinks to 0.8 and moves left
// to make room. 0.4–1.1 s: its four layers part along their depth, 60 ms apart, each one gaining a glass plate, an
// edge and a shadow that grows with its height. 1.0–1.42 s: a leader line draws from the corner of each layer
// to its name (top to bottom: 界面, 运行时, IR, 存储 by default), 40 ms apart. 1.42–1.5 s: rest.
// The 3D is CSS: `perspective` on the stage, `preserve-3d` on the stack, `z` on each layer. `z` takes pixels, so
// the depths are computed from `width` (the scene is built again on resize); nothing on the stack has opacity,
// filter or overflow, which would flatten it. The leader lines are flat SVG over the frame; their end points are
// the layers' corners in the end pose, projected at build with the same transforms the CSS applies (Motion writes
// translate, scale, rotateX, rotateZ in that order), so the lines meet the plates without measuring the page.
const W = 52, H = 32.8, RX = 55, RZ = -35, SCALE = 0.8, SHIFT = -0.2, GAP = 10.5, P = 300, SLAB = 1

export default motionScene(({ root, motion, width, height, parameters }) => {
  const names = (parameters.labels as string[] | undefined) ?? ['界面', '运行时', 'IR', '存储']
  const fh = (100 * height) / width // the frame's height in cqw
  const px = width / 100 // one cqw in pixels
  // Layer k counts from the bottom; the stack stays centred on its middle.
  const depth = (k: number) => (k - 1.5) * GAP
  // Where a point (x, y) of layer k (cqw from the plate's centre) lands on the frame in the end pose, in cqw.
  const project = (x: number, y: number, k: number): [number, number] => {
    const rz = (RZ * Math.PI) / 180, rx = (RX * Math.PI) / 180
    const x1 = Math.cos(rz) * x - Math.sin(rz) * y, y1 = Math.sin(rz) * x + Math.cos(rz) * y, z1 = depth(k)
    const y2 = Math.cos(rx) * y1 - Math.sin(rx) * z1, z2 = Math.sin(rx) * y1 + Math.cos(rx) * z1
    const x3 = SCALE * x1 + SHIFT * W, y3 = SCALE * y2
    const k3 = P / (P - z2)
    return [50 + x3 * k3, fh / 2 + y3 * k3]
  }
  const corners = [3, 2, 1, 0].map(k => project(W / 2, H / 2, k))
  const labelX = Math.max(...corners.map(c => c[0])) + 7
  // Each layer draws its part of the window in a 460 × 290 box (0.1 cqw units).
  const svg = (body: string) => `<svg viewBox="0 0 460 290" aria-hidden="true">${body}</svg>`
  const bar = (x: number, y: number, w: number, h: number, fill: string, r = 6) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" />`
  const layers = [
    // 存储: the base the rest stands on, ruled like a ledger.
    svg(Array.from({ length: 11 }, (_, i) => `<path d="M 0 ${24 + i * 24} H 460" stroke="var(--pm-color-line)" stroke-width="1.2" />`).join('')),
    // IR: the document's blocks and the spine that holds them.
    svg(`<path d="M 108 64 V 196" stroke="var(--pm-color-accent-line)" stroke-width="3" />
      ${[64, 112, 196].map(y => `<circle cx="108" cy="${y}" r="5" fill="var(--pm-color-accent)" />`).join('')}
      ${bar(124, 52, 200, 24, 'color-mix(in oklab, var(--pm-color-ink) 34%, transparent)')}
      ${[306, 290, 240].map((w, i) => bar(124, 92 + i * 20, w, 12, 'color-mix(in oklab, var(--pm-color-line-strong) 45%, transparent)')).join('')}
      ${bar(124, 162, 140, 72, 'var(--pm-color-sunk)', 10)}${bar(282, 162, 148, 72, 'var(--pm-color-sunk)', 10)}
      <path d="M 140 222 L 176 186 L 200 206 L 222 190 L 250 222 Z" fill="var(--pm-color-line-strong)" opacity="0.5" />`),
    // 运行时: the player — the current block framed, the steps on a track, the play button.
    svg(`<rect x="276" y="156" width="160" height="84" rx="13" fill="none" stroke="var(--pm-color-accent)" stroke-width="4" />
      <circle cx="136" cy="262" r="13" fill="var(--pm-color-accent)" /><path d="M 131 255 L 142 262 L 131 269 Z" fill="var(--pm-color-on-accent)" />
      <path d="M 160 262 H 430" stroke="var(--pm-color-line-strong)" stroke-width="3" />
      <path d="M 160 262 H 300" stroke="var(--pm-color-accent)" stroke-width="5" />
      ${[160, 228, 300, 366, 430].map((x, i) => `<circle cx="${x}" cy="262" r="6" fill="${i < 2 ? 'var(--pm-color-accent)' : i === 2 ? 'var(--pm-color-surface)' : 'var(--pm-color-line-strong)'}" ${i === 2 ? 'stroke="var(--pm-color-accent)" stroke-width="4"' : ''} />`).join('')}`),
    // 界面: the window's chrome — title bar and sidebar.
    svg(`<path d="M 14 0 H 446 A 14 14 0 0 1 460 14 V 30 H 0 V 14 A 14 14 0 0 1 14 0 Z" fill="var(--pm-color-sunk)" />
      ${[16, 32, 48].map(x => `<circle cx="${x}" cy="15" r="4.5" fill="var(--pm-color-line-strong)" />`).join('')}
      <path d="M 0 30 H 88 V 290 H 14 A 14 14 0 0 1 0 276 Z" fill="color-mix(in oklab, var(--pm-color-sunk) 70%, transparent)" />
      ${[52, 78, 104, 130].map((y, i) => bar(14, y, i === 1 ? 50 : 60, 14, i === 1 ? 'var(--pm-color-accent)' : 'var(--pm-color-line)'))}`),
  ]
  const f = frame(root, `
    .xl { position: absolute; inset: 0; perspective: ${P}cqw; }
    .xl__stack { position: absolute; left: 50%; top: 50%; width: ${W}cqw; height: ${H}cqw; margin: ${-H / 2}cqw 0 0 ${-W / 2}cqw; transform-style: preserve-3d; will-change: transform; }
    .xl__stack > * { will-change: transform; }
    .xl__layer { --sep: 0; position: absolute; inset: 0; border-radius: 1.4cqw;
      background: color-mix(in oklab, var(--pm-color-surface) calc(var(--sep) * 50%), transparent);
      box-shadow: inset 0 0 0 0.16cqw color-mix(in oklab, var(--pm-color-accent) calc(var(--sep) * 70%), transparent),
        0 calc(var(--sep) * var(--h) * 1.6cqw) calc(var(--sep) * var(--h) * 3.4cqw) color-mix(in oklab, var(--pm-color-shadow) calc(var(--sep) * var(--h) * 16%), transparent); }
    .xl__layer--base { background: var(--pm-color-surface); overflow: hidden;
      box-shadow: inset 0 0 0 0.16cqw var(--pm-color-line-strong), 0 calc(var(--sep) * 2.4cqw) calc(var(--sep) * 6cqw) color-mix(in oklab, var(--pm-color-shadow) calc(var(--sep) * 22%), transparent); }
    .xl__slab { position: absolute; inset: 0; border-radius: 1.4cqw; background: var(--pm-color-line-strong); }
    .xl__layer svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
    .xl__lines { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
    .xl__lines path { fill: none; stroke: var(--pm-color-line-strong); stroke-width: 0.14; stroke-linecap: butt; }
    .xl__lines circle { fill: var(--pm-color-accent); }
    .xl__label { position: absolute; left: ${labelX + 1}cqw; transform: translateY(-50%); font-size: 2.3cqw; font-weight: 600; white-space: nowrap; }
  `, `<div class="xl"><div class="xl__stack"><div class="xl__slab"></div>${layers.map((body, k) => `<div class="xl__layer${k === 0 ? ' xl__layer--base' : ''}" style="--h: ${k / 3}">${body}</div>`).join('')}</div></div>
    <svg class="xl__lines" viewBox="0 0 100 ${fh}" aria-hidden="true">${corners.map(([x, y]) => `<path d="M ${x + 0.4} ${y} H ${labelX}" /><circle cx="${x}" cy="${y}" r="0.42" />`).join('')}</svg>
    ${corners.map(([, y], i) => `<div class="xl__label" style="top: ${y}cqw">${names[i] ?? ''}</div>`).join('')}`)
  const stack = f.querySelector<HTMLElement>('.xl__stack')!
  const plates = [...f.querySelectorAll<HTMLElement>('.xl__layer')]
  const slab = f.querySelector<HTMLElement>('.xl__slab')!
  const lines = [...f.querySelectorAll<SVGPathElement>('.xl__lines path')]
  const dots = [...f.querySelectorAll<SVGCircleElement>('.xl__lines circle')]
  const labels = [...f.querySelectorAll<HTMLElement>('.xl__label')]
  const turn: [number, number, number, number] = [0.6, 0, 0.25, 1]
  const seq: MotionSequence = [
    [stack, { rotateX: [0, RX], rotateZ: [0, RZ], scale: [1, SCALE], x: ['0%', `${SHIFT * 100}%`] }, { at: 0, duration: 0.6, ease: turn }],
    // Top first, 60 ms apart; the upper two rise, the lower two sink, so the stack stays centred.
    ...[3, 2, 1, 0].map((k, i): MotionSequence[number] => [plates[k]!, { z: [0, depth(k) * px], '--sep': [0, 1] }, { at: 0.4 + i * 0.06, duration: 0.5, ease: [0.25, 1, 0.4, 1] }]),
    // The base has a thickness: a darker plane just under it, moving with it, shows as an edge once tilted. It
    // appears only as the stack turns: face on, its edge would peek out by a pixel under the base.
    [slab, { z: [-SLAB * px, (depth(0) - SLAB) * px] }, { at: 0.4 + 3 * 0.06, duration: 0.5, ease: [0.25, 1, 0.4, 1] }],
    [slab, { opacity: [0, 1] }, { at: 0.08, duration: 0.2 }],
    ...labels.flatMap((label, i): MotionSequence => {
      const t = 1 + i * 0.04
      return [
        [dots[i]!, { scale: [0, 1] }, { at: t, duration: 0.14, ease: 'easeOut' }],
        [lines[i]!, { pathLength: [0, 1] }, { at: t + 0.03, duration: 0.2, ease: [0.3, 0.7, 0.3, 1] }],
        [label, { opacity: [0, 1], x: ['-1.2cqw', '0cqw'], y: ['-50%', '-50%'] }, { at: t + 0.1, duration: 0.2, ease: [0.2, 0.9, 0.3, 1] }],
      ]
    }),
  ]
  return motion.animate(seq)
})
