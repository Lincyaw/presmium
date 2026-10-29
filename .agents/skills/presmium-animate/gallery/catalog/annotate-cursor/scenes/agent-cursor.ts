import { defineScene } from '@lincyaw/addon-motion/scene'
import { frame, pick } from '../../../lengths/scenes/kit/frame.ts'
import { backdrop, BACKDROP_CSS, guides } from './lib/backdrop.ts'
import { ease, mix } from '../../../lengths/scenes/kit/fx/time.ts'
import { press, seg, steps, typed } from './lib/time.ts'
import type { Box, Pt } from './lib/ink.ts'
import { place, pointer, POINTER_CSS, show } from './lib/pointer.ts'

// Agent cursor, with defineScene: an AI agent working in an interface. Its pointer carries a name tag in the
// accent that types what the agent is about to do; then the pointer moves to the target and clicks it, and the
// interface responds. For showing what an assistant does on the author's behalf, one action per step. One state per
// target (`step-1`, …, about 2.3 s each) and a last state `done`. In a target's state: the tag types its line at 14
// characters a second while the pointer waits (the intent is read before the act: cause before effect); then
// 0.5 s of travel, both ends eased; the press 0.1 s after arrival (the pointer dips to 86 %, a ring spreads); in the
// same frame the control darkens, and the result enters in the editor over 0.4 s. In the first state the pointer
// first enters from the lower right (0–0.5 s). `done`: the tag turns the success colour and types its closing line,
// and the pointer drifts 2 % aside, so the finished page holds. The tag sits above and to the right of the tip (off the result
// that appears below), or to its left in the right third of the stage. Targets are click points in stage percent; the built-in editor reacts to clicks on
// its three buttons. Adapted from HyperFrames agent-cursor.

interface Target { x?: number, y?: number, say?: string }
const BUTTONS: Box[] = [0, 1, 2].map(i => ({ x: 13, y: 24 + i * 10, w: 20, h: 7.5 }))
const DEFAULTS: Target[] = [
  { x: 16, y: 28, say: '插入注意力公式' },
  { x: 17, y: 38, say: '出三道练习题' },
  { x: 16, y: 48, say: '试听这一页' },
]
const inside = (b: Box, p: Pt) => p[0] >= b.x && p[0] <= b.x + b.w && p[1] >= b.y && p[1] <= b.y + b.h

const editor = () => `
  <div class="ag-win lf-card"></div>
  <div class="ag-bar"><i></i><i></i><i></i><span>注意力 · 第 2 页</span></div>
  ${['插入公式', '生成练习题', '朗读预览'].map((s, i) => `<div class="ag-btn" data-b="${i}" style="left:${BUTTONS[i]!.x}%;top:${BUTTONS[i]!.y}%;width:${BUTTONS[i]!.w}%;height:${BUTTONS[i]!.h}%">${s}</div>`).join('')}
  <div class="ag-page">
    <div class="ag-h">缩放点积注意力</div>
    <div class="ag-r" data-r="0"><span class="ag-f">softmax(QKᵀ/√d)·V</span></div>
    <div class="ag-r ag-quiz" data-r="1">${['1. 为什么除以 √d？', '2. softmax 作用在哪一维？', '3. 输出的形状是什么？'].map(q => `<div>${q}</div>`).join('')}</div>
    <div class="ag-r ag-wave" data-r="2">${Array.from({ length: 28 }, (_, i) => `<b style="height:${(25 + 60 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6))).toFixed(0)}%"></b>`).join('')}</div>
  </div>`

export default defineScene(({ root, at, durations, total, parameters }) => {
  const { starts, end, n } = steps(at, durations, total)
  const name = (parameters.name as string | undefined) ?? '助教'
  const doneText = (parameters.done as string | undefined) ?? '这一页准备好了'
  const custom = Boolean(parameters.svg) || parameters.backdrop !== undefined
  const targets = ((parameters.targets as Target[] | undefined) ?? DEFAULTS).slice(0, Math.max(0, n - 1)).map((tg, i) => {
    const p: Pt = [tg.x ?? 50, tg.y ?? 50]
    const s = starts[i]!, typeAt = s + (i === 0 ? 0.55 : 0.1), say = tg.say ?? ''
    const move = typeAt + [...say].length / 14 + 0.15
    return { p, s, say, typeAt, move, click: move + 0.6, button: custom ? -1 : BUTTONS.findIndex(b => inside(b, p)) }
  })
  const doneAt = starts[targets.length] ?? end

  const f = frame(root, `${BACKDROP_CSS}${POINTER_CSS}
    .ag-win { position: absolute; left: 10%; top: 9%; width: 80%; height: 80%; }
    .ag-bar { position: absolute; left: 10%; top: 9%; width: 80%; height: 7%; display: flex; align-items: center; gap: 0.7cqw; padding: 0 1.4cqw; border-bottom: 0.15cqw solid var(--pm-color-line); font: 400 1.6cqw/1 var(--pm-font-sans); color: var(--pm-color-muted); }
    .ag-bar i { width: 0.9cqw; height: 0.9cqw; border-radius: 50%; background: var(--pm-color-line-strong); }
    .ag-bar span { margin-left: 1cqw; }
    .ag-btn { position: absolute; display: flex; align-items: center; padding-left: 1.4cqw; border-radius: 0.7cqw; background: var(--pm-color-sunk); font: 500 1.9cqw/1 var(--pm-font-sans); }
    .ag-page { position: absolute; left: 37%; top: 21%; width: 50%; height: 64%; padding: 2.4cqw; border-radius: 0.7cqw; border: 0.15cqw solid var(--pm-color-line); background: var(--pm-color-bg); display: flex; flex-direction: column; gap: 1.6cqw; }
    .ag-h { font: 600 2.6cqw/1.2 var(--pm-font-serif); }
    .ag-f { font: italic 400 2.6cqw/1.2 var(--pm-font-serif); color: var(--pm-color-accent); }
    .ag-quiz { display: flex; flex-direction: column; gap: 0.6cqw; font: 400 1.7cqw/1.3 var(--pm-font-sans); }
    .ag-wave { display: flex; align-items: center; gap: 0.35cqw; height: 4cqw; }
    .ag-wave b { width: 0.5cqw; border-radius: 0.3cqw; background: var(--pm-color-accent); }
    .ag-tag { position: absolute; display: flex; align-items: center; gap: 0.6cqw; padding: 0.5cqw 1.1cqw; border-radius: 0.6cqw; background: var(--pm-color-accent); color: var(--pm-color-on-accent); font: 600 1.6cqw/1.2 var(--pm-font-sans); white-space: nowrap; }
    .ag-tag em { font-style: normal; font-weight: 400; }
  `, `
    ${custom ? backdrop(parameters, 'none') : editor()}
    ${guides(parameters.guides)}
    <div class="pt-layer">${pointer('ag-pt', ['arrow'])}<div class="ag-tag"><span>${name}</span><em></em></div></div>`)
  const pt = pick(f, '.ag-pt'), tag = pick(f, '.ag-tag'), say = pick(f, '.ag-tag em')
  show(pt, 'arrow')
  const off: Pt = [94, 104]

  const paint = (t: number) => {
    let p: Pt = off, scale = 1.5, ring = 0, line = ''
    const pressed = [1, 1, 1], shown = [0, 0, 0]
    targets.forEach((tg, i) => {
      if (tg.button >= 0) {
        pressed[tg.button] = press(t, tg.click, 0.94)
        shown[tg.button] = seg(t, tg.click + 0.05, 0.4, ease.out3)
      }
      if (t < tg.s) return
      const from: Pt = i === 0 ? off : targets[i - 1]!.p
      const enter: Pt = i === 0 ? [78, 70] : from
      if (i === 0 && t < tg.s + 0.5) p = [mix(off[0], enter[0], seg(t, tg.s, 0.5, ease.out3)), mix(off[1], enter[1], seg(t, tg.s, 0.5, ease.out3))]
      else p = [mix(enter[0], tg.p[0], seg(t, tg.move, 0.5, ease.inOut3)), mix(enter[1], tg.p[1], seg(t, tg.move, 0.5, ease.inOut3))]
      scale = 1.5 * press(t, tg.click)
      ring = seg(t, tg.click, 0.5, ease.out3)
      line = typed(tg.say, t, tg.typeAt, 14)
    })
    const done = t >= doneAt
    if (done && targets.length) {
      const last = targets[targets.length - 1]!.p, u = seg(t, doneAt, 0.5, ease.out3)
      p = [last[0] + 2 * u, last[1] + 3 * u]
      line = `${typed(doneText, t, doneAt + 0.15, 14)}${t > doneAt + 0.15 + [...doneText].length / 14 ? ' ✓' : ''}`
    }
    say.textContent = line
    tag.style.background = done ? 'var(--pm-color-ok)' : ''
    const flip = p[0] > 66
    tag.style.left = `${p[0]}%`
    tag.style.top = `${p[1]}%`
    tag.style.transform = flip ? 'translate(calc(-100% - 1cqw), calc(-100% - 0.6cqw))' : 'translate(2.4cqw, calc(-100% - 0.4cqw))'
    place(pt, { x: p[0], y: p[1], scale, ring })
    if (custom) return
    BUTTONS.forEach((_, j) => {
      const b = pick(f, `[data-b="${j}"]`)
      b.style.transform = `scale(${pressed[j]!.toFixed(4)})`
      b.style.background = shown[j]! > 0 ? 'var(--pm-color-accent-soft)' : ''
      const r = pick(f, `[data-r="${j}"]`)
      r.style.opacity = shown[j]!.toFixed(3)
      r.style.transform = `translateY(${((1 - shown[j]!) * 1.5).toFixed(2)}cqw)`
    })
  }
  return (ms: number) => paint(ms / 1000)
})
