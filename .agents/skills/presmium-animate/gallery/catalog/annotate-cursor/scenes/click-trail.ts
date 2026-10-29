import { defineScene } from '@lincyaw/addon-motion/scene'
import { frame, pick } from '../../../lengths/scenes/kit/frame.ts'
import { backdrop, BACKDROP_CSS, guides } from './lib/backdrop.ts'
import { ease, mix } from '../../../lengths/scenes/kit/fx/time.ts'
import { press, seg, steps } from './lib/time.ts'
import type { Box, Pt } from './lib/ink.ts'
import { place, pointer, POINTER_CSS, show } from './lib/pointer.ts'

// Click trail, with defineScene: a tutorial path through a settings panel. The pointer (an arrow, or a
// fingertip for a phone) clicks one target per step; each move leaves a dotted trail spaced evenly by distance, each
// click leaves a numbered marker, and the control under the click responds in the same frame as the press. For "first
// this, then this" instructions: configuring a tool, the steps of an experiment's interface. One state per click
// (`click-1`, …, about 1.6 s each, the last longer). In each state: 0.1–0.6 s the pointer travels on a slight arc from
// where it rested, both ends eased, its dots appearing behind it as it passes, while the previous move's dots fade
// (the path stays readable without filling the screen); 0.7 s the press: the pointer dips to 86 % and back with a
// small overshoot, a ring spreads from the tip, and the control reacts (cause and effect in one frame, as a real
// control does); 0.75 s the step's number pops in beside the point; 1.05–1.4 s the pointer settles 2.5 % right and 5 %
// down so the result stays in view. With `pointer: 'touch'` there is no travel and no trail: the disc appears on
// contact 0.07 s before the press and lifts 0.2 s after it. `size` scales the pointer (1.6 by default, readable in a
// video; 2.5 is an oversized "look here" cursor). Targets are click points in stage percent; the built-in panel
// reacts to clicks that land on its controls, and with another backdrop the clicks are only shown. Adapted from
// HyperFrames cursor-glyph-trail, oversized-cursor and touch-indicator.

interface Target { x?: number, y?: number }
const DEFAULTS: Target[] = [{ x: 67, y: 35 }, { x: 69, y: 51.5 }, { x: 62, y: 72.5 }]
const TOGGLE: Box = { x: 64, y: 32.5, w: 6, h: 5 }
const SEG: Box[] = [0, 1, 2].map(i => ({ x: 47 + i * 8.7, y: 48, w: 8.7, h: 7 }))
const BUTTON: Box = { x: 51, y: 68, w: 21, h: 9 }
const inside = (b: Box, p: Pt) => p[0] >= b.x && p[0] <= b.x + b.w && p[1] >= b.y && p[1] <= b.y + b.h
const GAP = 2.2   // percent of the stage between two trail dots

const panel = () => `
  <div class="ct-card lf-card"></div>
  <div class="ct-title" style="left:28%;top:16%">导出设置</div>
  <div class="ct-label" style="left:28%;top:35%">自动生成字幕</div>
  <div class="ct-toggle" style="left:${TOGGLE.x}%;top:${TOGGLE.y}%;width:${TOGGLE.w}%;height:${TOGGLE.h}%"><i></i></div>
  <div class="ct-label" style="left:28%;top:51.5%">输出形态</div>
  <div class="ct-seg" style="left:${SEG[0]!.x}%;top:${SEG[0]!.y}%;width:${SEG[0]!.w * 3}%;height:${SEG[0]!.h}%"><b></b>${['网页', '幻灯片', '视频'].map(s => `<span>${s}</span>`).join('')}</div>
  <div class="ct-btn" style="left:${BUTTON.x}%;top:${BUTTON.y}%;width:${BUTTON.w}%;height:${BUTTON.h}%"><span>开始导出</span><span>已开始 ✓</span></div>`

export default defineScene(({ root, at, durations, total, parameters }) => {
  const { starts, n } = steps(at, durations, total)
  const kind = (parameters.pointer as string | undefined) === 'touch' ? 'touch' : 'arrow'
  const size = (parameters.size as number | undefined) ?? 1.6
  const custom = Boolean(parameters.svg) || (parameters.backdrop !== undefined && parameters.backdrop !== 'panel')
  const pts: Pt[] = ((parameters.targets as Target[] | undefined) ?? DEFAULTS).slice(0, n).map(p => [p.x ?? 50, p.y ?? 50])
  const off: Pt = [92, 108]
  // Each move: a quadratic arc from the last rest to the target, sampled for its dots.
  const moves = pts.map((p, i) => {
    const a: Pt = i === 0 ? off : [pts[i - 1]![0] + 2.5, pts[i - 1]![1] + 5]
    const dx = p[0] - a[0], dy = p[1] - a[1]
    const c: Pt = [(a[0] + p[0]) / 2 + dy * 0.18, (a[1] + p[1]) / 2 - dx * 0.18]
    const at = (u: number): Pt => { const v = 1 - u; return [v * v * a[0] + 2 * v * u * c[0] + u * u * p[0], v * v * a[1] + 2 * v * u * c[1] + u * u * p[1]] }
    const samples = Array.from({ length: 101 }, (_, k) => at(k / 100))
    const dist = [0]
    for (let k = 1; k < samples.length; k++) dist.push(dist[k - 1]! + Math.hypot((samples[k]![0] - samples[k - 1]![0]) * 16 / 9, samples[k]![1] - samples[k - 1]![1]))
    const len = dist[100]!
    const dots: Array<{ p: Pt, u: number }> = []
    for (let d = GAP; d < len - GAP; d += GAP) { const k = dist.findIndex(x => x >= d); dots.push({ p: samples[k]!, u: k / 100 }) }
    return { a, p, at, dots, t0: starts[i]!, click: starts[i]! + 0.7 }
  })

  const f = frame(root, `${BACKDROP_CSS}${POINTER_CSS}
    .ct-card { position: absolute; left: 24%; top: 10%; width: 52%; height: 78%; }
    .ct-title { position: absolute; transform: translateY(-50%); font: 600 3cqw/1 var(--pm-font-sans); }
    .ct-label { position: absolute; transform: translateY(-50%); font: 400 2.2cqw/1 var(--pm-font-sans); }
    .ct-toggle { position: absolute; border-radius: 99cqw; background: var(--pm-color-line-strong); }
    .ct-toggle i { position: absolute; top: 12%; left: 6%; width: 38%; height: 76%; border-radius: 50%; background: var(--pm-color-surface); }
    .ct-seg { position: absolute; display: flex; border-radius: 0.8cqw; background: var(--pm-color-sunk); border: 0.15cqw solid var(--pm-color-line); }
    .ct-seg span { position: relative; flex: 1; display: grid; place-items: center; font: 500 1.9cqw/1 var(--pm-font-sans); }
    .ct-seg b { position: absolute; top: 6%; height: 88%; width: 32.6%; border-radius: 0.6cqw; background: var(--pm-color-surface); box-shadow: 0 0.1cqw 0.4cqw var(--pm-color-shadow); }
    .ct-btn { position: absolute; display: grid; border-radius: 0.8cqw; background: var(--pm-color-accent); color: var(--pm-color-on-accent); font: 600 2.2cqw/1 var(--pm-font-sans); }
    .ct-btn span { grid-area: 1 / 1; display: grid; place-items: center; }
    .ct-trail { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
    .ct-trail circle { fill: var(--pm-color-accent); }
    .ct-no { position: absolute; width: 3.2cqw; height: 3.2cqw; margin: -1.6cqw 0 0 -1.6cqw; border-radius: 50%; display: grid; place-items: center; background: var(--pm-color-accent); color: var(--pm-color-on-accent); font: 700 1.8cqw/1 var(--pm-font-sans); box-shadow: 0 0 0 0.3cqw var(--pm-color-surface); }
  `, `
    ${custom ? backdrop(parameters, 'none') : panel()}
    <svg class="ct-trail" viewBox="0 0 1600 900" aria-hidden="true">${moves.map((m, i) => `<g data-t="${i}">${m.dots.map(d => `<circle cx="${(d.p[0] * 16).toFixed(1)}" cy="${(d.p[1] * 9).toFixed(1)}" r="5" />`).join('')}</g>`).join('')}</svg>
    ${moves.map((m, i) => `<div class="ct-no" data-n="${i}" style="left:${m.p[0] - 3.2}%;top:${m.p[1] - 5}%">${i + 1}</div>`).join('')}
    ${guides(parameters.guides)}
    <div class="pt-layer">${pointer('ct-pt', ['arrow', 'touch'])}</div>`)
  const pt = pick(f, '.ct-pt')
  show(pt, kind)

  const paint = (t: number) => {
    let p: Pt = off, scale = size, ring = 0, opacity = kind === 'touch' ? 0 : 1
    let toggled = 0, seg3 = 0, pressedBtn = 1, done = 0, segFrom = 0
    moves.forEach((m, i) => {
      const g = pick<SVGGElement>(f, `g[data-t="${i}"]`)
      const u = seg(t, m.t0 + 0.1, 0.5, ease.inOut3)
      const fade = i + 1 < moves.length ? 1 - seg(t, moves[i + 1]!.t0 + 0.1, 0.3) : 1
      ;[...g.children].forEach((c, k) => (c as SVGElement).style.opacity = kind === 'touch' ? '0' : (u >= m.dots[k]!.u ? 0.55 * fade : 0).toFixed(3))
      const no = pick(f, `[data-n="${i}"]`), nu = seg(t, m.click + 0.05, 0.35)
      no.style.opacity = Math.min(1, nu * 4).toFixed(3)
      no.style.transform = `scale(${nu > 0 ? ease.backOut(2.2)(nu).toFixed(4) : 0})`
      if (t < m.t0) return
      if (kind === 'touch') {
        p = m.p
        const on = seg(t, m.click - 0.07, 0.07), lift = seg(t, m.click + 0.12, 0.2)
        opacity = on * (1 - lift)
        scale = size * (1 + 0.1 * lift)
      } else {
        const settle = seg(t, m.click + 0.35, 0.35, ease.out3)
        p = t < m.click + 0.35 ? m.at(u) : [mix(m.p[0], m.p[0] + 2.5, settle), mix(m.p[1], m.p[1] + 5, settle)]
        scale = size * press(t, m.click)
        ring = seg(t, m.click, 0.5, ease.out3)
        if (i === moves.length - 1) {
          const leave = seg(t, m.click + 1.2, 0.4, ease.in2)
          p = [mix(p[0], off[0], leave), mix(p[1], off[1], leave)]
        }
      }
      if (t >= m.click && !custom) {
        const k = Math.min(1, (t - m.click) / 0.25)
        if (inside(TOGGLE, m.p)) toggled = ease.out3(k)
        SEG.forEach((b, j) => { if (inside(b, m.p)) { segFrom = seg3; seg3 = mix(segFrom, j, ease.out3(k)) } })
        if (inside(BUTTON, m.p)) { pressedBtn = press(t, m.click, 0.94); done = seg(t, m.click + 0.15, 0.25) }
      }
    })
    place(pt, { x: p[0], y: p[1], scale, ring, opacity })
    if (custom) return
    const tog = pick(f, '.ct-toggle')
    tog.style.background = toggled > 0.5 ? 'var(--pm-color-accent)' : ''
    pick(tog, 'i').style.left = `${mix(6, 56, toggled)}%`
    pick(f, '.ct-seg b').style.left = `${(0.6 + seg3 * 33.1).toFixed(2)}%`
    const btn = pick(f, '.ct-btn'), [a, b] = [...btn.children] as HTMLElement[]
    btn.style.transform = `scale(${pressedBtn.toFixed(4)})`
    a!.style.opacity = (1 - done).toFixed(3)
    b!.style.opacity = done.toFixed(3)
  }
  return (ms: number) => paint(ms / 1000)
})
