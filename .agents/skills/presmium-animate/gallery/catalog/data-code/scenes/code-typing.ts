import { gsapScene } from '@lincyaw/addon-motion/scene'
import { mulberry32 } from '../../../lengths/scenes/kit/fx/random.ts'
import { editor, fitHeight, highlight, str } from './lib/code.ts'

// Code typing, with GSAP: a short function is written into an editor, already coloured, with the caret at the
// frontier. One state `type` (7 s). 0–0.45 s the editor rises with an empty first line. From 0.5 s the code is typed
// at about 14 characters a second (the speed a viewer reads along with), in a seeded rhythm: bursts inside a word,
// a longer pause after a line ends and before a comment; indentation appears at once, as an editor puts it there;
// Chinese characters come slower, one at a time, as with an input method. Each line's number appears as the line
// starts. Once the last character falls the caret blinks (530 ms) through the rest of the state: about two seconds of
// rest on the finished function. Only `display` and opacity change at set times, so every seek gives the same frame.
// The typing is squeezed to fit when the code is longer than the state allows. Adapted from HyperFrames code-typing.
const CODE = `def softmax(x):
    # 减去最大值，防止溢出
    e = np.exp(x - x.max())
    return e / e.sum()`
const CPS = 14

export default gsapScene(({ root, gsap, at, durations, parameters }) => {
  const lines = highlight(str(parameters.code, CODE), str(parameters.lang, 'python'))
  let n = 0
  const keys: { i: number, ch: string, line: number, indent: boolean }[] = []
  const html = lines.map((line, l) => {
    let lead = true
    const body = line.map(t => {
      const chars = [...t.text].map(ch => {
        const indent = lead && t.kind === 'ws'
        keys.push({ i: n, ch, line: l, indent })
        return `<span class="ct-ch" data-c="${n++}">${ch.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</span>`
      }).join('')
      if (t.kind !== 'ws') lead = false
      return t.kind === 'ws' ? chars : `<span class="k-${t.kind}">${chars}</span>`
    }).join('')
    return `<span class="cd__line" data-l="${l}">${body}<span class="ct-caret" data-l="${l}"></span></span>`
  }).join('')
  editor(root, { size: 2.8, lh: 1.6, h: fitHeight(lines.length, 2.8, 1.6), file: str(parameters.file, 'softmax.py'), inner: html, gutter: lines.length, css: `
    .ct-ch { display: none; }
    .ct-caret { display: inline-block; width: 0.12em; height: 1.2em; margin-left: 0.02em; vertical-align: -0.22em; background: var(--pm-color-accent); opacity: 0; }
    .cd__gutter > span { opacity: 0; }
  ` })

  const s = (k: number) => at(k) / 1000
  const end = s(durations.length)
  const tl = gsap.timeline()
  gsap.set('.cd', { autoAlpha: 0, yPercent: 4 })
  tl.to('.cd', { autoAlpha: 1, yPercent: 0, duration: 0.45, ease: 'expo.out' }, 0)
  const gutter = root.querySelectorAll<HTMLElement>('.cd__gutter > span')
  const caret = (l: number) => `.ct-caret[data-l="${l}"]`
  tl.set(gutter[0]!, { opacity: 1 }, 0)
  tl.set(caret(0), { opacity: 1 }, 0)

  // Seeded gaps: about 1/CPS, longer at a line break and before a comment, slower for CJK, none for indentation.
  const rng = mulberry32(11)
  const gaps = keys.map((k, j) => {
    if (k.indent) return 0
    const prev = keys[j - 1]
    let g = (1 / CPS) * (0.5 + rng())
    if (prev && prev.line !== k.line) g += 0.28
    if (/[一-鿿，。]/.test(k.ch)) g *= 1.6
    if (k.ch === '#') g += 0.15
    return g
  })
  const start = 0.5, room = Math.max(0.5, end - start - 1.8)
  const scale = Math.min(1, room / gaps.reduce((a, b) => a + b, 0))
  let t = start, line = 0
  keys.forEach((k, j) => {
    t += gaps[j]! * scale
    if (k.line !== line) {
      tl.set(caret(line), { opacity: 0 }, t)
      tl.set(caret(k.line), { opacity: 1 }, t)
      tl.set(gutter[k.line]!, { opacity: 1 }, t)
      line = k.line
    }
    tl.set(`.ct-ch[data-c="${k.i}"]`, { display: 'inline' }, t)
  })
  for (let b = t + 0.53, on = false; b < end; b += 0.53, on = !on) tl.set(caret(line), { opacity: on ? 1 : 0 }, b)
  tl.set({}, {}, end)
  return tl
})
