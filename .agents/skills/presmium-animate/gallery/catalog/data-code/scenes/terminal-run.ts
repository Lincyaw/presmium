import { gsapScene } from '@lincyaw/addon-motion/scene'
import { mulberry32 } from '../../../lengths/scenes/kit/fx/random.ts'
import { editor, fitHeight, highlight, str } from './lib/code.ts'

// Terminal run, with GSAP: one command is typed, runs, prints its output and lands on a result.
// `type` (2.6 s): the terminal rises (0.45 s); from 0.5 s the command types itself at about 14 characters a second
// in a seeded human rhythm (short bursts, small pauses before flags), the caret solid while keys fall; at the end
// the caret blinks (530 ms on, 530 ms off) for the beat before Enter.
// `run` (2.4 s): Enter. The caret leaves; after a 0.3 s beat the output prints one line every 0.32 s, each line
// appearing at once as a terminal does, so lines are read as they come, top to bottom.
// `done` (2 s): the last line, the result, prints in the success colour with a small settle (scale 0.96 to 1, the
// only overshoot of the piece: "done"); a fresh prompt follows with a blinking caret; the rest holds.
// Characters are revealed with `display` set at their time, so the caret, an inline element after the command,
// always sits after the last typed character without measuring. The keystroke rhythm comes from a seeded
// generator, so it is the same on every seek. Merges HyperFrames terminal-simulator and the typing of
// code-snippet-apple-terminal-pro (a generic terminal, no product chrome). Adapted from HyperFrames code-terminal-run.
const COMMAND = 'python train.py --epochs 3'
const OUTPUT = [
  '加载数据集 mnist：60000 张训练图像',
  'epoch 1/3   loss 0.912   acc 71.4%',
  'epoch 2/3   loss 0.536   acc 84.0%',
  'epoch 3/3   loss 0.341   acc 89.7%',
  '✓ 模型已保存到 runs/exp1/model.pt',
]
const CPS = 14

const tone = (line: string) => (/^✓/.test(line) ? 'ok' : /^(✗|error|错误)/i.test(line) ? 'danger' : /^(warn|警告)/i.test(line) ? 'warn' : '')

export default gsapScene(({ root, gsap, at, durations, parameters }) => {
  const command = str(parameters.command, COMMAND)
  const output = Array.isArray(parameters.output) ? (parameters.output as string[]) : OUTPUT
  const prompt = typeof parameters.prompt === 'string' ? parameters.prompt : '$'
  const cmd = highlight(command, 'shell')[0] ?? []
  // Characters keep their token's colour: each character is its own span inside its token's span.
  let n = 0
  const typed = cmd.map(t => `<span class="k-${t.kind}">${[...t.text].map(ch => `<span class="tr-ch" data-c="${n++}">${ch.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`).join('')}</span>`).join('')
  const out = output.map((line, i) => `<div class="tr-out ${tone(line) ? `tr-out--${tone(line)}` : ''}" data-o="${i}">${line.replace(/</g, '&lt;')}</div>`).join('')
  editor(root, { size: 2.3, lh: 1.6, h: fitHeight(output.length + 2, 2.3, 1.6), file: str(parameters.title, '终端'),
    inner: `<div class="tr-line"><span class="tr-p">${prompt} </span>${typed}<span class="tr-caret c1"></span></div>${out}<div class="tr-line tr-again"><span class="tr-p">${prompt} </span><span class="tr-caret c2"></span></div>`,
    bar: `<span class="tr-tag">${str(parameters.tag, '示意输出')}</span>`, css: `
    .cd__code { left: 3cqw; white-space: normal; }
    .tr-line { display: block; height: var(--lh); white-space: pre; }
    .tr-p { color: var(--pm-color-accent); font-weight: 500; }
    .tr-ch { display: none; }
    .tr-caret { display: inline-block; width: 0.6em; height: 1.15em; vertical-align: -0.2em; background: var(--pm-color-accent); }
    .tr-out { display: none; height: var(--lh); white-space: pre; color: var(--pm-color-muted); font-variant-numeric: tabular-nums; }
    .tr-out--ok { color: var(--pm-color-ok); font-weight: 500; transform-origin: 0 50%; }
    .tr-out--danger { color: var(--pm-color-danger); } .tr-out--warn { color: var(--pm-color-warn); }
    .tr-tag { margin-left: auto; font: 400 1.5cqw/1 var(--pm-font-sans); color: var(--pm-color-muted); white-space: nowrap; }
  ` })

  const s = (k: number) => at(k) / 1000
  const tl = gsap.timeline()
  gsap.set('.cd', { autoAlpha: 0, yPercent: 4 })
  tl.to('.cd', { autoAlpha: 1, yPercent: 0, duration: 0.45, ease: 'expo.out' }, 0)
  gsap.set('.tr-again', { display: 'none' })

  // Keystroke times: seeded gaps around 1/CPS, longer before a space or a flag, squeezed to fit the state.
  const rng = mulberry32(7)
  const chars = [...command]
  const gaps = chars.map((ch, i) => (1 / CPS) * (0.55 + rng() * 0.9) * (chars[i - 1] === ' ' ? 1.8 : 1) * (ch === '-' && chars[i - 1] === ' ' ? 1.3 : 1))
  const start = 0.5, room = Math.max(0.3, s(1) - start - 0.6)
  const scale = Math.min(1, room / gaps.reduce((a, b) => a + b, 0))
  let t = start
  chars.forEach((_, i) => { t += gaps[i]! * scale; tl.set(`.tr-ch[data-c="${i}"]`, { display: 'inline' }, t) })
  // The caret blinks when no key falls: from the last key to Enter, and on the fresh prompt.
  const blink = (sel: string, from: number, to: number) => { for (let b = from + 0.53, on = false; b < to; b += 0.53, on = !on) tl.set(sel, { opacity: on ? 1 : 0 }, b) }
  blink('.c1', t, s(1))
  tl.set('.c1', { opacity: 1 }, s(1) - 0.001)
  tl.set('.c1', { display: 'none' }, s(1))

  // run: the output prints line by line; the result waits for `done`.
  const last = output.length - 1
  output.forEach((_, i) => { if (i < last) tl.set(`.tr-out[data-o="${i}"]`, { display: 'block' }, s(1) + 0.3 + i * 0.32) })
  const t2 = s(Math.min(2, durations.length - 1))
  tl.set(`.tr-out[data-o="${last}"]`, { display: 'block' }, t2 + 0.1)
  gsap.set(`.tr-out[data-o="${last}"]`, { scale: 0.96, opacity: 0 })
  tl.to(`.tr-out[data-o="${last}"]`, { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(2)' }, t2 + 0.1)
  tl.set('.tr-again', { display: 'block' }, t2 + 0.6)
  blink('.c2', t2 + 0.6, s(durations.length))
  tl.set({}, {}, s(durations.length))
  return tl
})
