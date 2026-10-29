import { defineScene } from '@lincyaw/addon-motion/scene'
import { frame } from '../../../lengths/scenes/kit/frame.ts'
import { ease, mix, phase } from '../../../lengths/scenes/kit/fx/time.ts'
import { esc, inOut4, isCjk, pieces } from './lib/text.ts'

// Camera caption, with defineScene: one sentence written across a page far larger than the frame. The words do not move;
// the camera does. Each new word is sized against the box of everything written so far and set either to the
// right of that box (half its height) or under it (most of its width), alternating, so the box grows
// geometrically, the camera pulls back at a steady rate and every word arrives at the same size on screen. Old
// words stay and become small, like handwriting filling a page; the last beat pulls back until the whole
// sentence is read at once. For a thesis, a definition, the one sentence a lecture is about.
// State `write` (5.6 s, an equal share per word): in each share the camera glides to the next empty place in the
// first half (power3.inOut, scale interpolated in log space so the zoom speed feels even), the word fades and
// rises in as the camera arrives (cause, then effect), and rests for the second half, at least 0.6 s.
// State `reveal` (2.5 s): 0–1.2 s the camera pulls back to frame the whole sentence; then it holds still.
// Layout is computed at build from the number of characters (a Chinese character is 1 em, a Latin one about
// 0.55 em), never by measuring text, so it is the same on every machine.
// Adapted from HyperFrames caption-camera-follow.
interface Word { text: string, x: number, y: number, f: number, w: number, h: number, key: boolean }

const ems = (s: string) => [...s].reduce((n, ch) => n + (isCjk(ch) ? 1 : /\s/.test(ch) ? 0.3 : 0.56), 0)

export default defineScene(({ root, at, width, height, parameters }) => {
  const given = parameters.words as string[] | string | undefined
  const chunks = Array.isArray(given) ? given : given ? pieces(given, 'word').filter(p => !p.space).map(p => p.text) : ['反向传播', '就是', '把误差', '沿着计算图', '一层层', '送回去']
  const keywords = (parameters.keywords as string[] | undefined) ?? ['误差', '送回去']
  const s = (k: number) => at(k) / 1000

  // The self-similar layout, in world units (cqw of a word set at font size 1).
  const words: Word[] = []
  let box = { x0: 0, y0: 0, x1: 0, y1: 0 }
  chunks.forEach((text, k) => {
    const e = ems(text)
    let f: number, x: number, y: number
    if (k === 0) { f = 6; x = 0; y = 0 }
    else if (k % 2 === 1) { f = ((box.y1 - box.y0) * 0.5) / 1.2; x = box.x1 + 0.25 * f; y = box.y1 - 1.2 * f }
    else { f = Math.min(((box.x1 - box.x0) * 0.7) / e, ((box.y1 - box.y0) * 0.9) / 1.2); x = box.x0; y = box.y1 + 0.1 * f }
    const w = e * f, h = 1.2 * f
    words.push({ text, x, y, f, w, h, key: keywords.some(kw => kw && text.includes(kw)) })
    box = k === 0 ? { x0: x, y0: y, x1: x + w, y1: y + h } : { x0: Math.min(box.x0, x), y0: Math.min(box.y0, y), x1: Math.max(box.x1, x + w), y1: Math.max(box.y1, y + h) }
  })

  frame(root, `
    .cc-world { position: absolute; left: 0; top: 0; transform-origin: 0 0; will-change: transform; }
    .cc-w { position: absolute; white-space: nowrap; font-weight: 600; line-height: 1.2; font-family: var(--pm-font-sans); }
    .cc-w--key { color: var(--pm-color-accent); font-family: var(--pm-font-serif); }
  `, `<div class="cc-world">${words.map(w => `<div class="cc-w${w.key ? ' cc-w--key' : ''}" style="left:${w.x.toFixed(3)}cqw;top:${w.y.toFixed(3)}cqw;font-size:${w.f.toFixed(3)}cqw">${esc(w.text)}</div>`).join('')}</div>`)

  const cqw = width / 100
  const world = root.querySelector<HTMLElement>('.cc-world')!
  const els = [...root.querySelectorAll<HTMLElement>('.cc-w')]
  // A camera pose: the world point (cqw) at the frame's centre and the scale. Each word fills 18% of the height.
  const shot = (w: Word) => ({ cx: w.x + w.w / 2, cy: w.y + w.h / 2, z: (0.18 * height) / (w.h * cqw) })
  const all = { cx: (box.x0 + box.x1) / 2, cy: (box.y0 + box.y1) / 2, z: Math.min((0.86 * width) / ((box.x1 - box.x0) * cqw), (0.8 * height) / ((box.y1 - box.y0) * cqw)) }
  const glide = inOut4   // power3.inOut
  const between = (a: ReturnType<typeof shot>, b: ReturnType<typeof shot>, k: number) =>
    ({ cx: mix(a.cx, b.cx, k), cy: mix(a.cy, b.cy, k), z: Math.exp(mix(Math.log(a.z), Math.log(b.z), k)) })
  const n = words.length, share = (s(1) - s(0)) / n
  const poses = words.map(shot)

  return (ms: number) => {
    const t = ms / 1000
    let cam = poses[0]!
    if (t >= s(1)) cam = between(poses[n - 1]!, all, glide(phase(t, s(1), 1.2)))
    else {
      const k = Math.min(n - 1, Math.floor(t / share))
      cam = k === 0 ? poses[0]! : between(poses[k - 1]!, poses[k]!, glide(phase(t, k * share, share * 0.5)))
    }
    world.style.transform = `translate(${(width / 2).toFixed(2)}px, ${(height / 2).toFixed(2)}px) scale(${cam.z.toFixed(5)}) translate(${(-cam.cx * cqw).toFixed(2)}px, ${(-cam.cy * cqw).toFixed(2)}px)`
    els.forEach((el, k) => {
      // The word comes in as the camera arrives: from 35% to 60% of its share.
      const p = phase(t, k * share + (k === 0 ? 0.1 : share * 0.35), Math.min(0.35, share * 0.3))
      const e = ease.out3(p)
      el.style.opacity = e.toFixed(3)
      el.style.transform = p < 1 ? `translateY(${((1 - e) * 25).toFixed(2)}%)` : ''
    })
  }
})
