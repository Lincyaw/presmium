import { gsapScene } from '@lincyaw/addon-motion/scene'
import { editor, fitHeight, highlight, lineDiff, lineHtml, str } from './lib/code.ts'

// Code diff, with GSAP: an edit shown as a unified diff, then applied. Four states, 6 s.
// `before` (1 s): the editor rises in 0.45 s with the old code; the reader finds the function.
// `mark` (1.2 s): the lines that go take the deletion colour one after another (70 ms apart), a "−" in the
// margin first, then the tint sweeping in from the left: the cause (what is wrong) before any new line.
// `add` (1.5 s): each new line opens from zero height (the lines below are pushed down, so the eye sees where it
// goes), its green tint arrives first and its text 60 ms later; 80 ms between lines.
// `apply` (2.3 s): the removed lines close (0.5 s, both ends eased), the tints fade, and the change count
// ("−1 +3") pops in the title bar; 1.6 s of rest on the clean new code, the payoff.
// Lines are diffed by their text (longest common subsequence); heights and tints are CSS variables, so nothing is
// measured and a removed line keeps its place until it closes. Adapted from HyperFrames code-diff.
const BEFORE = `def mean(xs):
    """求平均值"""
    return sum(xs) / len(xs)`

const AFTER = `def mean(xs):
    """求平均值；空列表返回 0"""
    if not xs:
        return 0.0
    return sum(xs) / len(xs)`

export default gsapScene(({ root, gsap, at, parameters }) => {
  const lang = str(parameters.lang, 'python')
  const ops = lineDiff(highlight(str(parameters.before, BEFORE), lang), highlight(str(parameters.after, AFTER), lang))
  const file = str(parameters.file, 'stats.py')
  const dels = ops.filter(o => o.type === 'del').length, adds = ops.filter(o => o.type === 'add').length
  const rows = ops.map((op, i) => `<div class="df df--${op.type}" data-i="${i}" style="--h:${op.type === 'add' ? 0 : 1};--t:0;--s:0">
      <span class="df__tint"></span><span class="df__sign">${op.type === 'del' ? '−' : op.type === 'add' ? '+' : ''}</span><span class="df__text">${lineHtml(op.line) || ' '}</span></div>`).join('')
  editor(root, { size: 2.9, h: fitHeight(ops.length, 2.9), file, inner: rows, bar: `<span class="df-count"><span class="d">−${dels}</span><span class="a">+${adds}</span></span>`, css: `
    .cd__code { left: 2cqw; }
    .df { position: relative; height: calc(var(--h) * var(--lh)); overflow: hidden; padding-left: 4ch; white-space: nowrap; }
    .df__tint { position: absolute; inset: 0; transform-origin: 0 50%; transform: scaleX(var(--t)); }
    .df--del .df__tint { background: var(--pm-color-danger-soft); box-shadow: inset 0.35cqw 0 var(--pm-color-del); }
    .df--add .df__tint { background: var(--pm-color-ok-soft); box-shadow: inset 0.35cqw 0 var(--pm-color-add); }
    .df__sign { position: absolute; left: 1.4ch; top: 0; opacity: var(--s); font-weight: 500; }
    .df--del .df__sign { color: var(--pm-color-del); }
    .df--add .df__sign { color: var(--pm-color-add); }
    .df__text { position: relative; display: block; white-space: pre; }
    .df-count { margin-left: auto; display: flex; gap: 1.2cqw; font: 500 1.7cqw/1 var(--pm-font-mono); font-variant-numeric: tabular-nums; }
    .df-count .d { color: var(--pm-color-del); } .df-count .a { color: var(--pm-color-add); }
  ` })
  const s = (k: number) => at(k) / 1000
  const q = (type: string) => gsap.utils.toArray<HTMLElement>(root.querySelectorAll(`.df--${type}`))
  const delRows = q('del'), addRows = q('add'), adds$ = addRows.map(r => r.querySelector('.df__text'))
  const tl = gsap.timeline()

  // before: the editor rises.
  gsap.set('.cd', { autoAlpha: 0, yPercent: 4 })
  tl.to('.cd', { autoAlpha: 1, yPercent: 0, duration: 0.45, ease: 'expo.out' }, 0)
  gsap.set('.df-count', { autoAlpha: 0, scale: 0.6 })
  gsap.set(adds$, { autoAlpha: 0, xPercent: -2 })

  // mark: sign first, then the tint sweeps in from the left.
  delRows.forEach((row, i) => {
    tl.to(row, { '--s': 1, duration: 0.12, ease: 'power2.out' }, s(1) + 0.15 + i * 0.07)
    tl.to(row, { '--t': 1, duration: 0.4, ease: 'power2.out' }, s(1) + 0.2 + i * 0.07)
    tl.to(row.querySelector('.df__text'), { opacity: 0.62, duration: 0.4 }, s(1) + 0.2 + i * 0.07)
  })

  // add: each line opens, its tint first, its text 60 ms later.
  addRows.forEach((row, i) => {
    const t = s(2) + 0.1 + i * 0.08
    tl.to(row, { '--h': 1, duration: 0.45, ease: 'expo.out' }, t)
    tl.to(row, { '--t': 1, '--s': 1, duration: 0.35, ease: 'power2.out' }, t + 0.05)
    tl.to(adds$[i]!, { autoAlpha: 1, xPercent: 0, duration: 0.35, ease: 'expo.out' }, t + 0.11)
  })

  // apply: removed lines close, tints fade, the count pops.
  tl.to(delRows, { '--h': 0, duration: 0.5, ease: 'power3.inOut' }, s(3))
  tl.to(addRows, { '--t': 0, '--s': 0, duration: 0.45, ease: 'power2.inOut' }, s(3) + 0.25)
  tl.to('.df-count', { autoAlpha: 1, scale: 1, duration: 0.45, ease: 'back.out(2)' }, s(3) + 0.55)
  tl.set({}, {}, s(4))
  return tl
})
