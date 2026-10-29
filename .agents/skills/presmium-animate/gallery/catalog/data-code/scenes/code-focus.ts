import { gsapScene } from '@lincyaw/addon-motion/scene'
import { editor, highlight, lineHtml, str } from './lib/code.ts'

// Code focus, with GSAP: a walk through a file longer than the window, one passage at a time (a code tour).
// `overview` (1.5 s): the editor rises showing the top of the file, every line at full strength.
// Each `focus` state (2.5–3 s): 0–0.85 s the file scrolls so the passage sits in the middle (both ends eased);
// the highlight band rides with it from the last passage to the new one, so the eye is carried, not cut; on the
// first focus the band instead sweeps in from the left once the scroll has landed (cause, then effect). From 0.85 s
// the other lines dim to a third (the passage is the only thing at full strength); from 1.15 s a short note rises
// beside the band in the accent. The previous note leaves first, in 0.2 s. The rest of the state holds.
// Scroll, band and dim are CSS variables in line units: the scroll offset is computed from the frame's geometry
// (16:9, container units), never measured. Notes are short (at most about nine characters) so they read twice
// in the hold. Merges HyperFrames code-highlight (one line, band sweep, context dims) into code-scroll (a long file
// scrolled to a target). Adapted from HyperFrames code-scroll and code-highlight.
const CODE = `from collections import deque


def bfs(graph, start):
    """广度优先搜索：每个节点到 start 的距离"""
    dist = {start: 0}
    queue = deque([start])

    while queue:
        node = queue.popleft()
        for nxt in graph[node]:
            if nxt in dist:
                continue
            dist[nxt] = dist[node] + 1
            queue.append(nxt)

    return dist


if __name__ == "__main__":
    graph = {
        "A": ["B", "C"],
        "B": ["D"],
        "C": ["D", "E"],
        "D": ["F"],
        "E": ["F"],
        "F": [],
    }
    print(bfs(graph, "A"))`

interface Focus { from: number, to?: number, note?: string }
const FOCUS: Focus[] = [
  { from: 6, to: 7, note: '起点入队' },
  { from: 10, note: '取出队头' },
  { from: 14, to: 15, note: '记距离，入队' },
]
const SIZE = 2.2, LH = 1.65, PAD = 1.2          // code font (cqw), line height and top padding (multiples of it)
// The body's height in cqw: the panel is 82cqh of a 16:9 frame, less the 3cqw title bar.
const BODY = 82 * 9 / 16 - 3

export default gsapScene(({ root, gsap, at, durations, parameters }) => {
  const lines = highlight(str(parameters.code, CODE), str(parameters.lang, 'python'))
  const focus = (Array.isArray(parameters.focus) ? (parameters.focus as Focus[]) : FOCUS).slice(0, Math.max(0, durations.length - 1))
  const visible = (BODY - PAD * SIZE) / (LH * SIZE)
  const scrollTo = (f: Focus) => {
    const mid = (f.from + (f.to ?? f.from)) / 2 - 0.5        // centre of the passage in rows from the top
    return Math.round(Math.max(0, Math.min(lines.length - visible + 0.6, mid - visible / 2)))
  }
  const code = lines.map(l => `<span class="cd__line">${lineHtml(l) || ' '}</span>`).join('')
  const notes = focus.map((f, i) => `<span class="cf-note" data-n="${i}" style="--r:${f.from - 1}">${f.note ?? ''}</span>`).join('')
  editor(root, { size: SIZE, lh: LH, file: str(parameters.file, 'bfs.py'), inner: `<span class="cf-band" style="--b0:0;--bn:1;--bw:0"></span>${code}${notes}`, gutter: lines.length, css: `
    .cd__body { --scroll: 0; }
    .cd__code, .cd__gutter { transform: translateY(calc(var(--scroll) * -1 * var(--lh))); }
    .cf-band { position: absolute; left: -1ch; right: 0; top: calc(var(--pad) + var(--b0) * var(--lh)); height: calc(var(--bn) * var(--lh));
      background: var(--pm-color-accent-soft); box-shadow: inset 0.35cqw 0 var(--pm-color-accent); border-radius: 0.4cqw;
      transform-origin: 0 50%; transform: scaleX(var(--bw)); }
    .cd__line { position: relative; }
    .cf-note { position: absolute; right: 1ch; top: calc(var(--pad) + var(--r) * var(--lh)); height: var(--lh); display: flex; align-items: center;
      font: 600 ${SIZE * 0.85}cqw/1 var(--pm-font-sans); color: var(--pm-color-accent); white-space: nowrap; }
  ` })

  const s = (k: number) => at(k) / 1000
  const body = root.querySelector<HTMLElement>('.cd__body')!
  const band = root.querySelector<HTMLElement>('.cf-band')!
  const rows = gsap.utils.toArray<HTMLElement>(root.querySelectorAll('.cd__line'))
  const tl = gsap.timeline()
  gsap.set('.cd', { autoAlpha: 0, yPercent: 4 })
  tl.to('.cd', { autoAlpha: 1, yPercent: 0, duration: 0.45, ease: 'expo.out' }, 0)
  gsap.set('.cf-note', { autoAlpha: 0, yPercent: 40 })

  focus.forEach((f, i) => {
    const t0 = s(i + 1), from = f.from - 1, to = (f.to ?? f.from) - 1
    if (i > 0) tl.to(`.cf-note[data-n="${i - 1}"]`, { autoAlpha: 0, yPercent: -40, duration: 0.2, ease: 'power2.in' }, t0)
    tl.to(body, { '--scroll': scrollTo(f), duration: 0.85, ease: 'power3.inOut' }, t0)
    if (i === 0) {
      tl.set(band, { '--b0': from, '--bn': to - from + 1 }, t0)
      tl.to(band, { '--bw': 1, duration: 0.45, ease: 'power2.inOut' }, t0 + 0.8)
    } else {
      tl.to(band, { '--b0': from, '--bn': to - from + 1, duration: 0.85, ease: 'power3.inOut' }, t0)
    }
    tl.to(rows, { opacity: (k: number) => (k >= from && k <= to ? 1 : 0.32), duration: 0.4, ease: 'power2.out' }, t0 + 0.85)
    tl.to(`.cf-note[data-n="${i}"]`, { autoAlpha: 1, yPercent: 0, duration: 0.4, ease: 'expo.out' }, t0 + 1.15)
  })
  tl.set({}, {}, s(durations.length))
  return tl
})
