// What the annotation scenes point at: a formula, a few lines of code, a chart, or the author's own SVG. The built-in
// backdrops are laid out on the stage in percentages, so a target written as a box in percent lands on the same term,
// token or curve at any size and in any font: the formula's terms sit in fixed cells, a code line k is the band
// y = 22 + 9(k − 1) … + 9 and column c starts at x = 20 + 1.56c (Plex Mono is 0.6 em wide), and the chart is an SVG
// whose viewBox is the stage. An author's `svg` fills the stage (keep it 16:9, e.g. viewBox="0 0 1600 900", and a
// point (X, Y) of it is at X/16 %, Y/9 %). `guides: true` draws a 10 % grid with its numbers, to read targets off.
import type { Box } from './ink.ts'

export type BackdropKind = 'formula' | 'code' | 'figure' | 'none'

/** The formula's terms, in percent: aim at them by name in the defaults, or copy the numbers. */
export const FORMULA: Record<'lhs' | 'softmax' | 'num' | 'den' | 'frac' | 'v', Box> = {
  lhs: { x: 7, y: 41, w: 27, h: 18 },
  softmax: { x: 41.5, y: 42.5, w: 14, h: 15 },
  num: { x: 61, y: 36, w: 14, h: 13 },
  den: { x: 61, y: 51, w: 14, h: 13 },
  frac: { x: 61, y: 36, w: 14, h: 28 },
  v: { x: 79, y: 41, w: 7, h: 18 },
}

export const CODE = { top: 22, line: 9, left: 20, col: 1.56 }
export const DEFAULT_CODE = `def attention(q, k, v):
    d = q.shape[-1]
    s = q @ k.T / d ** 0.5
    w = softmax(s, axis=-1)
    return w @ v`

/** The box of code line k (from 1), columns [from, to) (0-based; `to` defaults to the line's end). */
export function codeBox(k: number, from = 0, to?: number, code = DEFAULT_CODE): Box {
  const line = code.split('\n')[k - 1] ?? ''
  const end = to ?? line.length
  return { x: CODE.left + from * CODE.col - 0.6, y: CODE.top + (k - 1) * CODE.line, w: (end - from) * CODE.col + 1.2, h: CODE.line }
}

/** The chart's parts, in percent. Its data are illustrative and labelled so on the stage. */
export const FIGURE: Record<'bump' | 'gap' | 'legend' | 'xAxis' | 'start', Box> = {
  bump: { x: 23, y: 41, w: 9, h: 11 },
  gap: { x: 79, y: 57, w: 8, h: 17 },
  legend: { x: 68, y: 14, w: 20, h: 11 },
  xAxis: { x: 12, y: 79, w: 76, h: 8 },
  start: { x: 11, y: 17, w: 7, h: 10 },
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const BACKDROP_CSS = `
  .bd { position: absolute; inset: 0; }
  .bd svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  .bd-cell { position: absolute; display: flex; align-items: center; justify-content: center; font: italic 400 4cqw/1 var(--pm-font-serif); white-space: nowrap; }
  .bd-cell--up { font-style: normal; }
  .bd-cell--big { font-size: 9cqw; font-style: normal; font-weight: 300; color: var(--pm-color-muted); }
  .bd-bar { position: absolute; height: 0.25cqw; background: var(--pm-color-ink); }
  .bd-caption { position: absolute; left: 0; right: 0; top: 76%; text-align: center; }
  .bd-code { position: absolute; border-radius: 1cqw; background: var(--pm-color-surface); border: 0.18cqw solid var(--pm-color-line-strong); }
  .bd-line { position: absolute; display: flex; align-items: center; font: 400 2.6cqw/1 var(--pm-font-mono); white-space: pre; }
  .bd-no { position: absolute; display: flex; align-items: center; justify-content: flex-end; font: 400 2cqw/1 var(--pm-font-mono); color: var(--pm-color-muted); }
  .bd-kw { color: var(--pm-color-syntax-keyword); }
  .bd-label { font: 400 2cqw/1 var(--pm-font-sans); fill: var(--pm-color-muted); }
  .bd-guides line { stroke: var(--pm-color-line); stroke-width: 1.5; stroke-dasharray: 6 8; }
  .bd-guides text { font: 400 1.1cqw/1 var(--pm-font-mono); fill: var(--pm-color-muted); }
`

function formula(): string {
  const c = (b: Box, text: string, cls = '') => `<div class="bd-cell ${cls}" style="left:${b.x}%;top:${b.y}%;width:${b.w}%;height:${b.h}%"><span>${text}</span></div>`
  return [
    c(FORMULA.lhs, 'Attn(<i>Q</i>, <i>K</i>, <i>V</i>)', 'bd-cell--up'),
    c({ x: 34, y: 41, w: 5, h: 18 }, '=', 'bd-cell--up'),
    c({ x: 39, y: 41, w: 19, h: 18 }, 'softmax', 'bd-cell--up'),
    c({ x: 57.5, y: 36, w: 3.5, h: 28 }, '(', 'bd-cell--big'),
    c(FORMULA.num, '<i>QK</i><sup>T</sup>'),
    `<div class="bd-bar" style="left:${FORMULA.frac.x + 1}%;top:49.8%;width:${FORMULA.frac.w - 2}%"></div>`,
    c(FORMULA.den, '√<i>d</i><sub>k</sub>'),
    c({ x: 75, y: 36, w: 3.5, h: 28 }, ')', 'bd-cell--big'),
    c(FORMULA.v, '<i>V</i>'),
    `<div class="bd-caption lf-caption">缩放点积注意力</div>`,
  ].join('')
}

const KEYWORDS = /\b(def|return|for|in|if|else|import|from|class|lambda)\b/g

function code(source: string): string {
  const lines = source.split('\n')
  const bottom = CODE.top + lines.length * CODE.line
  const rows = lines.map((line, i) => {
    const y = CODE.top + i * CODE.line
    return `<div class="bd-no" style="left:13%;width:4.6%;top:${y}%;height:${CODE.line}%">${i + 1}</div>`
      + `<div class="bd-line" style="left:${CODE.left}%;top:${y}%;height:${CODE.line}%">${escape(line).replace(KEYWORDS, '<span class="bd-kw">$1</span>')}</div>`
  })
  return `<div class="bd-code" style="left:11%;top:${CODE.top - 6}%;width:78%;height:${bottom - CODE.top + 12}%"></div>${rows.join('')}`
}

/** Loss curves as a function of the stage x (percent): high on the left, falling; ours has a warm-up bump. */
export const baseline = (x: number) => 62 - 42 * Math.exp(-(x - 12) / 16)
export const ours = (x: number) => 71 - 51 * Math.exp(-(x - 12) / 13) - 7 * Math.exp(-(((x - 27.5) / 2.4) ** 2))

function figure(): string {
  const line = (f: (x: number) => number) => Array.from({ length: 75 }, (_, i) => { const x = 12 + i; return `${i ? 'L' : 'M'}${(x * 16).toFixed(1)} ${(f(x) * 9).toFixed(1)}` }).join('')
  return `<svg viewBox="0 0 1600 900" aria-hidden="true">
    <path d="M192 126 V720 H1408" fill="none" stroke="var(--pm-color-line-strong)" stroke-width="3" />
    <path d="${line(baseline)}" fill="none" stroke="var(--pm-color-muted)" stroke-width="5" stroke-dasharray="16 12" />
    <path d="${line(ours)}" fill="none" stroke="var(--pm-color-ink)" stroke-width="6" />
    <text class="bd-label" x="1408" y="776" text-anchor="end">训练步数</text>
    <text class="bd-label" x="180" y="110" text-anchor="start">损失</text>
    <path d="M1110 164 H1180" stroke="var(--pm-color-muted)" stroke-width="5" stroke-dasharray="16 12" /><text class="bd-label" x="1196" y="176">基线</text>
    <path d="M1110 210 H1180" stroke="var(--pm-color-ink)" stroke-width="6" /><text class="bd-label" x="1196" y="222">本文</text>
    <text class="bd-label" x="192" y="840">示意数据</text>
  </svg>`
}

/** The backdrop chosen by the parameters (`backdrop`, `code`, `svg`), or the scene's fallback. */
export function backdrop(parameters: Readonly<Record<string, unknown>>, fallback: BackdropKind): string {
  const svg = parameters.svg as string | undefined
  if (svg) return `<div class="bd">${svg}</div>`
  const kind = (parameters.backdrop as BackdropKind | undefined) ?? fallback
  const body = kind === 'formula' ? formula() : kind === 'code' ? code((parameters.code as string | undefined) ?? DEFAULT_CODE) : kind === 'figure' ? figure() : ''
  return `<div class="bd">${body}</div>`
}

/** A 10 % grid with its numbers, drawn over everything when `guides` is on: for reading targets off the stage. */
export function guides(on: unknown): string {
  if (on !== true) return ''
  const v = Array.from({ length: 9 }, (_, i) => (i + 1) * 10)
  return `<svg class="bd bd-guides" viewBox="0 0 1600 900" aria-hidden="true" style="position:absolute;inset:0;width:100%;height:100%">
    ${v.map(p => `<line x1="${p * 16}" y1="0" x2="${p * 16}" y2="900" /><text x="${p * 16 + 6}" y="26">${p}</text>`).join('')}
    ${v.map(p => `<line x1="0" y1="${p * 9}" x2="1600" y2="${p * 9}" /><text x="6" y="${p * 9 - 6}">${p}</text>`).join('')}
  </svg>`
}

/** Parameter schema parts shared by every scene that draws over a backdrop. */
export const BACKDROP_SCHEMA = {
  backdrop: { title: '底图', type: 'string', enum: ['formula', 'code', 'figure', 'none'] },
  code: { title: '代码（底图为 code 时，每行一条）', type: 'string' },
  svg: { title: '自己的底图（16:9 的 SVG 文本，盖过 backdrop）', type: 'string' },
  guides: { title: '显示 10% 网格，用来读出目标的百分比', type: 'boolean' },
}

export const BOX_SCHEMA = {
  x: { title: '左边（舞台宽度的 %）', type: 'number' },
  y: { title: '上边（舞台高度的 %）', type: 'number' },
  w: { title: '宽（%）', type: 'number' },
  h: { title: '高（%）', type: 'number' },
}
