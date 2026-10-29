// Code for the code scenes of this batch: a small deterministic highlighter (Python, JavaScript/TypeScript, shell)
// that colours tokens with the design system's syntax colours, the column of every token on a monospace grid
// (a CJK character takes two columns), a line diff and a token match (both longest common subsequence), and the
// editor and terminal panels. Nothing measures the page: a token's place is its column in `ch` and its row in
// line heights, so the same code lands on the same pixels in a reading column, on a slide and in the video.

import { frame } from '../../../../lengths/scenes/kit/frame.ts'

export type Kind = 'plain' | 'keyword' | 'string' | 'comment' | 'number' | 'fn' | 'key' | 'punct' | 'ws'

export interface Token { text: string, kind: Kind, col: number }
export type Line = Token[]

const KEYWORDS: Record<string, string[]> = {
  python: ['def', 'return', 'if', 'elif', 'else', 'for', 'while', 'in', 'not', 'and', 'or', 'is', 'import', 'from', 'as', 'class', 'with', 'yield', 'lambda', 'None', 'True', 'False', 'pass', 'break', 'continue', 'try', 'except', 'finally', 'raise', 'async', 'await', 'global'],
  js: ['function', 'return', 'if', 'else', 'for', 'while', 'of', 'in', 'const', 'let', 'var', 'new', 'class', 'import', 'from', 'export', 'default', 'async', 'await', 'null', 'undefined', 'true', 'false', 'this', 'typeof', 'interface', 'type', 'extends'],
  shell: ['cd', 'export', 'if', 'then', 'fi', 'for', 'do', 'done'],
}
const COMMENT: Record<string, string> = { python: '#', js: '//', shell: '#' }

/** Columns a string takes on a monospace grid: CJK and full-width characters take two. */
export function columns(text: string): number {
  let n = 0
  for (const ch of text) n += /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/.test(ch) ? 2 : 1
  return n
}

/** Splits `code` into lines of coloured tokens with their columns. `lang`: python, js (or ts), shell. */
export function highlight(code: string, lang = 'python'): Line[] {
  const l = lang === 'ts' || lang === 'javascript' || lang === 'typescript' ? 'js' : lang
  const keywords = new Set(KEYWORDS[l] ?? KEYWORDS.python)
  const comment = COMMENT[l] ?? '#'
  return code.replace(/\t/g, '    ').split('\n').map(source => {
    const line: Token[] = []
    let i = 0, col = 0
    const push = (text: string, kind: Kind) => { line.push({ text, kind, col }); col += columns(text); i += text.length }
    while (i < source.length) {
      const rest = source.slice(i)
      let m: RegExpMatchArray | null
      if (rest.startsWith(comment)) push(rest, 'comment')
      else if ((m = rest.match(/^\s+/))) push(m[0], 'ws')
      else if ((m = rest.match(/^(?:[fbr]?"""(?:(?!""").)*(?:""")?|[fbr]?'''(?:(?!''').)*(?:''')?|[fbr]?"(?:[^"\\]|\\.)*"?|[fbr]?'(?:[^'\\]|\\.)*'?|`(?:[^`\\]|\\.)*`?)/))) push(m[0], 'string')
      else if ((m = rest.match(/^\d[\d_.]*(?:e[+-]?\d+)?/i))) push(m[0], 'number')
      else if ((m = rest.match(/^@?[A-Za-z_一-鿿][\w一-鿿]*/))) {
        const word = m[0], after = source.slice(i + word.length)
        const kind: Kind = word.startsWith('@') ? 'key' : keywords.has(word) ? 'keyword' : /^\s*\(/.test(after) ? 'fn' : /^\s*[:=](?!=)/.test(after) && l === 'js' ? 'key' : l === 'shell' && line.every(t => t.kind === 'ws') ? 'fn' : l === 'shell' && word.startsWith('-') ? 'key' : 'plain'
        push(word, kind)
      } else if (l === 'shell' && (m = rest.match(/^--?[\w-]+/))) push(m[0], 'key')
      else if ((m = rest.match(/^(?:==|!=|<=|>=|=>|->|\*\*|\/\/|[-+*/%=<>!&|^~.,:;()[\]{}?$])/))) push(m[0], 'punct')
      else push(rest[0]!, 'plain')
    }
    return line
  })
}

/** The text of a line. */
export const text = (line: Line) => line.map(t => t.text).join('')

/** CSS for token colours: shared by every code scene so the same code looks the same everywhere. */
export const TOKEN_CSS = `
  .k-keyword { color: var(--pm-color-syntax-keyword); }
  .k-string { color: var(--pm-color-syntax-string); }
  .k-comment { color: var(--pm-color-muted); font-style: italic; }
  .k-number, .k-key { color: var(--pm-color-syntax-key); }
  .k-fn { color: var(--pm-color-accent); }
  .k-punct { color: var(--pm-color-muted); }
`

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** A line as flowing spans (for scenes that keep lines whole). */
export const lineHtml = (line: Line) => line.map(t => t.kind === 'ws' ? t.text : `<span class="k-${t.kind}">${esc(t.text)}</span>`).join('')

/** A token as an absolutely placed span at its column and row: `--c` and `--r` drive the place (tweenable). */
export const placedHtml = (t: Token, row: number, attrs = '') => `<span class="tok k-${t.kind}" style="--c:${t.col};--r:${row}" ${attrs}>${esc(t.text)}</span>`

/** Longest common subsequence of two lists by a key: pairs of matching indices, in order. */
export function lcs<T>(a: readonly T[], b: readonly T[], key: (x: T) => string): [number, number][] {
  const n = a.length, m = b.length
  const dp = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i]![j] = key(a[i]!) === key(b[j]!) ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!)
  const pairs: [number, number][] = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (key(a[i]!) === key(b[j]!)) { pairs.push([i, j]); i++; j++ }
    else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) i++
    else j++
  }
  return pairs
}

export type DiffOp = { type: 'same' | 'del' | 'add', line: Line }

/** The lines of `after` against `before`: kept, removed and added, in reading order (removals before additions). */
export function lineDiff(before: Line[], after: Line[]): DiffOp[] {
  const pairs = lcs(before, after, text)
  const ops: DiffOp[] = []
  let i = 0, j = 0
  for (const [pi, pj] of [...pairs, [before.length, after.length] as [number, number]]) {
    while (i < pi) ops.push({ type: 'del', line: before[i++]! })
    while (j < pj) ops.push({ type: 'add', line: after[j++]! })
    if (pi < before.length) { ops.push({ type: 'same', line: after[pj]! }); i++; j++ }
  }
  return ops
}

/**
 * The editor panel's CSS: a title bar with the file name (no product chrome), a gutter and a code area. `size` is the
 * code font size in cqw, `lh` the line height as a multiple of it, `h` the panel height in cqh (centred). `--lh` and
 * `--pad` (top padding) are in container units, so a smaller note or label placed by rows lands on the same rows.
 */
export function editorCss(size = 2.1, lh = 1.65, h = 82): string {
  return `
    .cd { position: absolute; left: 8cqw; top: ${(100 - h) / 2}cqh; width: 84cqw; height: ${h}cqh; display: flex; flex-direction: column;
      border-radius: 1.2cqw; background: var(--pm-color-code); border: 0.15cqw solid var(--pm-color-line-strong); overflow: hidden;
      box-shadow: 0 1.2cqw 3.6cqw color-mix(in oklab, var(--pm-color-shadow) 14%, transparent); }
    .cd__bar { flex: 0 0 auto; display: flex; align-items: center; gap: 1.2cqw; height: 3cqw; padding: 0 1.6cqw; background: var(--pm-color-sunk); border-bottom: 0.15cqw solid var(--pm-color-line); }
    .cd__dot { width: 0.9cqw; height: 0.9cqw; border-radius: 50%; background: var(--pm-color-line-strong); opacity: 0.6; }
    .cd__file { margin-left: 0.8cqw; font: 500 1.6cqw/1 var(--pm-font-mono); color: var(--pm-color-muted); white-space: nowrap; }
    .cd__file b { color: var(--pm-color-ink); font-weight: 500; }
    .cd__body { position: relative; flex: 1 1 auto; overflow: hidden; font: 400 ${size}cqw/${lh} var(--pm-font-mono); font-variant-ligatures: none;
      --lh: ${(size * lh).toFixed(3)}cqw; --pad: ${(size * 1.2).toFixed(3)}cqw; }
    .cd__gutter { position: absolute; left: 0; top: 0; width: 5.4cqw; padding-top: var(--pad); text-align: right; color: var(--pm-color-gutter); font-variant-numeric: tabular-nums; }
    .cd__gutter > span { display: block; height: var(--lh); line-height: var(--lh); padding-right: 1.4ch; }
    .cd__code { position: absolute; left: 6.6cqw; right: 2cqw; top: 0; padding-top: var(--pad); color: var(--pm-color-ink); white-space: pre; }
    .cd__line { display: block; height: var(--lh); line-height: var(--lh); white-space: pre; }
    .tok { position: absolute; left: calc(var(--c) * 1ch); top: calc(var(--pad) + var(--r) * var(--lh)); line-height: var(--lh); white-space: pre; }
    ${TOKEN_CSS}
  `
}

/** The panel height (cqh) that fits `rows` lines with a line of air below, between 40 and 82. */
export const fitHeight = (rows: number, size = 2.1, lh = 1.65) =>
  Math.max(40, Math.min(82, ((3 + size * 2.4 + (rows + 1) * size * lh) * 16) / 9))

/** The editor's options: the panel's CSS (`size`, `lh`, `h`), the scene's own CSS, and the markup around the code. */
export interface EditorOptions { size?: number, lh?: number, h?: number, css?: string, file: string, inner: string, gutter?: number, extra?: string, bar?: string }

/**
 * Fills `root` with the frame and the editor: `inner` is the code area's content, `gutter` numbers lines from 1 when
 * > 0, `extra` goes in the body under the code, `bar` at the right of the title bar. `frame()` puts all CSS in
 * `@scope`, so selectors in `css` are written as if the scene were alone on the page.
 */
export function editor(root: HTMLElement, o: EditorOptions): void {
  const slash = o.file.lastIndexOf('/')
  const name = slash >= 0 ? `${o.file.slice(0, slash + 1)}<b>${o.file.slice(slash + 1)}</b>` : `<b>${o.file}</b>`
  const gutter = o.gutter ?? 0
  frame(root, editorCss(o.size, o.lh, o.h) + (o.css ?? ''), `<div class="cd"><div class="cd__bar"><span class="cd__dot"></span><span class="cd__dot"></span><span class="cd__dot"></span><span class="cd__file">${name}</span>${o.bar ?? ''}</div>
    <div class="cd__body">${gutter > 0 ? `<div class="cd__gutter">${Array.from({ length: gutter }, (_, i) => `<span>${i + 1}</span>`).join('')}</div>` : ''}${o.extra ?? ''}<div class="cd__code">${o.inner}</div></div></div>`)
}

/** A parameter as a string, with a default. */
export const str = (v: unknown, d: string) => (typeof v === 'string' && v.length > 0 ? v : d)
