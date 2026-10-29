import { gsapScene } from '@lincyaw/addon-motion/scene'
import { editor, fitHeight, highlight, lcs, placedHtml, str, type Token } from './lib/code.ts'

// Code morph, with GSAP: one snippet turns into the next, token by token (the "magic move" of slides about
// refactoring). State 0 shows the first version; each later state morphs the previous version into the next one:
// 0–0.25 s the tokens that go fade and sink (exit, accelerating); from 0.15 s the tokens that stay glide to their
// new column and row together (0.65 s, both ends eased; a token that changes row lifts a little on the way, so the
// reader sees it travel); from 0.75 s the new tokens rise into their places 30 ms apart; the version's name in the
// title bar changes as the move lands. The rest of the state holds the new code still.
// Tokens are matched in two passes: the longest common subsequence keeps the order of what does not move, then
// identical words left over are paired with the nearest one, so `x * x` flies from the end of the loop to the front
// of the comprehension instead of fading out and in (keep identity). Punctuation is never paired across places.
// Every token sits at its column in `ch` and its row in line heights (CSS variables), so nothing is measured.
// Defaults: a loop becomes a list comprehension, then a generator expression (states 1.5 s, 2.5 s, 3 s).
// Adapted from HyperFrames code-morph.
const VERSIONS = [
  `squares = []
for x in range(10):
    if x % 2 == 0:
        squares.append(x * x)`,
  `squares = [x * x for x in range(10) if x % 2 == 0]`,
  `total = sum(x * x for x in range(10) if x % 2 == 0)`,
]
const LABELS = ['for 循环', '列表推导式', '生成器表达式']

interface Placed extends Token { row: number }
const WORDS = new Set(['plain', 'fn', 'number', 'string', 'keyword', 'key'])

/** Pairs of indices of `a` and `b` that are the same token: order-keeping first, then nearest identical words. */
function match(a: Placed[], b: Placed[]): Map<number, number> {
  const pairs = new Map(lcs(a, b, t => t.text))
  const used = new Set(pairs.values())
  a.forEach((t, i) => {
    if (pairs.has(i) || !WORDS.has(t.kind)) return
    let best = -1, dist = Infinity
    b.forEach((u, j) => {
      if (used.has(j) || u.text !== t.text) return
      const d = Math.abs(u.row - t.row) * 40 + Math.abs(u.col - t.col)
      if (d < dist) { dist = d; best = j }
    })
    if (best >= 0) { pairs.set(i, best); used.add(best) }
  })
  return pairs
}

export default gsapScene(({ root, gsap, at, durations, parameters }) => {
  const lang = str(parameters.lang, 'python')
  const given = Array.isArray(parameters.versions) ? (parameters.versions as string[]) : VERSIONS
  const labels = Array.isArray(parameters.labels) ? (parameters.labels as string[]) : LABELS
  // One version per state; extra states hold the last version.
  const versions = given.slice(0, Math.max(1, durations.length)).map(code =>
    highlight(code, lang).flatMap((line, row) => line.filter(t => t.kind !== 'ws').map(t => ({ ...t, row }))))
  // Spans: version 0's tokens, then each version's new tokens. `owner[v][j]` is the span showing token j of v.
  const spans: { t: Placed, born: number }[] = []
  const owner: number[][] = [versions[0]!.map(t => spans.push({ t, born: 0 }) - 1)]
  const moves: { span: number, v: number, to: Placed | null }[] = []
  for (let v = 1; v < versions.length; v++) {
    const a = versions[v - 1]!, b = versions[v]!, pairs = match(a, b)
    const mine = new Array<number>(b.length).fill(-1)
    a.forEach((_, i) => {
      const span = owner[v - 1]![i]!
      const j = pairs.get(i)
      if (j === undefined) moves.push({ span, v, to: null })
      else { mine[j] = span; moves.push({ span, v, to: b[j]! }) }
    })
    b.forEach((t, j) => { if (mine[j]! < 0) mine[j] = spans.push({ t, born: v }) - 1 })
    owner.push(mine)
  }
  const label = (i: number) => `<span class="cm-label" data-v="${i}">${labels[i] ?? ''}</span>`
  const rows = Math.max(...versions.map(v => Math.max(0, ...v.map(t => t.row)) + 1))
  editor(root, { size: 2.4, h: fitHeight(rows, 2.4), file: str(parameters.file, 'squares.py'), inner: spans.map((s, i) => placedHtml(s.t, s.t.row, `data-s="${i}"`)).join(''),
    bar: `<span class="cm-labels">${versions.map((_, i) => label(i)).join('')}</span>`, css: `
    .cd__code { left: 3cqw; }
    .tok { will-change: transform; }
    .cm-labels { position: relative; margin-left: auto; height: 1.8cqw; width: 24cqw; }
    .cm-label { position: absolute; right: 0; top: 0; font: 500 1.7cqw/1 var(--pm-font-sans); color: var(--pm-color-accent); white-space: nowrap; }
  ` })

  const el = (i: number) => root.querySelector<HTMLElement>(`[data-s="${i}"]`)!
  const s = (k: number) => at(k) / 1000
  const tl = gsap.timeline()
  gsap.set('.cd', { autoAlpha: 0, yPercent: 4 })
  tl.to('.cd', { autoAlpha: 1, yPercent: 0, duration: 0.45, ease: 'expo.out' }, 0)
  spans.forEach((sp, i) => { if (sp.born > 0) gsap.set(el(i), { autoAlpha: 0, yPercent: 35 }) })
  root.querySelectorAll<HTMLElement>('.cm-label').forEach((node, i) => { if (i > 0) gsap.set(node, { autoAlpha: 0, yPercent: 60 }) })

  for (let v = 1; v < versions.length; v++) {
    const t0 = s(v)
    let exits = 0
    for (const m of moves.filter(m => m.v === v)) {
      const node = el(m.span)
      if (!m.to) { tl.to(node, { autoAlpha: 0, yPercent: 30, duration: 0.25, ease: 'power2.in' }, t0 + Math.min(exits++, 6) * 0.01); continue }
      const prev = versions[v - 1]!.find((_, i) => owner[v - 1]![i] === m.span)!
      if (prev.col === m.to.col && prev.row === m.to.row) continue
      tl.to(node, { '--c': m.to.col, '--r': m.to.row, duration: 0.65, ease: 'power3.inOut' }, t0 + 0.15)
      // A token that changes row lifts on the way and comes down on its new line.
      if (prev.row !== m.to.row) tl.to(node, { keyframes: { yPercent: [0, -35, 0], easeEach: 'sine.inOut' }, duration: 0.65 }, t0 + 0.15)
    }
    const born = spans.map((sp, i) => ({ sp, i })).filter(({ sp }) => sp.born === v)
    born.forEach(({ i }, k) => tl.to(el(i), { autoAlpha: 1, yPercent: 0, duration: 0.35, ease: 'expo.out' }, t0 + 0.75 + Math.min(k, 12) * 0.03))
    tl.to(`.cm-label[data-v="${v - 1}"]`, { autoAlpha: 0, yPercent: -60, duration: 0.2, ease: 'power2.in' }, t0 + 0.6)
    tl.to(`.cm-label[data-v="${v}"]`, { autoAlpha: 1, yPercent: 0, duration: 0.4, ease: 'expo.out' }, t0 + 0.75)
  }
  tl.set({}, {}, s(durations.length))
  return tl
})
