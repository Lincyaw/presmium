// Text helpers shared by the text and caption pieces: split a line into characters or words in a way that works for
// Chinese (Intl.Segmenter, never splitting on spaces alone), escape it into markup, estimate how long it takes to
// read, and for the pieces drawn from the time (defineScene) the one GSAP ease the kit lacks and a colour mix.

export type Unit = 'char' | 'word' | 'line'

export const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

const CJK = /[⺀-⿿぀-ヿ㐀-䶿一-鿿豈-﫿]/
const PUNCT = /^[\p{P}\p{S}]+$/u

export const isCjk = (ch: string) => CJK.test(ch)

/**
 * The pieces of one line: graphemes for `char`, dictionary words for `word` (Chinese has no spaces, so the
 * segmenter's word boundaries are used). Punctuation joins the piece before it, so a comma never animates alone;
 * spaces come back as their own pieces, marked `space`, to be written between the animated spans.
 */
export function pieces(text: string, unit: 'char' | 'word'): { text: string, space: boolean }[] {
  const seg = new Intl.Segmenter('zh', { granularity: unit === 'char' ? 'grapheme' : 'word' })
  const out: { text: string, space: boolean }[] = []
  for (const { segment } of seg.segment(text)) {
    if (/^\s+$/.test(segment)) { out.push({ text: segment, space: true }); continue }
    const last = out.at(-1)
    if (PUNCT.test(segment) && last && !last.space) last.text += segment
    else out.push({ text: segment, space: false })
  }
  return out
}

/**
 * Markup for a block of text: one `<div class="${cls}-line">` per line (`\n` breaks lines), each piece a
 * `<span class="${cls}-piece">` holding `<span class="${cls}-glyph">`, so the outer span can clip (a mask) while
 * the inner one moves. A piece inside `key` (a substring of the text) gets `${cls}-key`. Spaces stay as text.
 */
export function splitMarkup(text: string, unit: Unit, cls: string, key = ''): string {
  let offset = 0
  const keyAt = key ? text.indexOf(key) : -1
  const keyEnd = keyAt < 0 ? -1 : keyAt + key.length
  return text.split('\n').map(line => {
    const parts = unit === 'line' ? [{ text: line, space: false }] : pieces(line, unit)
    const html = parts.map(p => {
      const start = offset
      offset += p.text.length
      if (p.space) return esc(p.text)
      const inKey = keyAt >= 0 && start < keyEnd && start + p.text.length > keyAt
      return `<span class="${cls}-piece${inKey ? ` ${cls}-key` : ''}"><span class="${cls}-glyph">${esc(p.text)}</span></span>`
    }).join('')
    offset += 1   // the line break
    return `<div class="${cls}-line">${html}</div>`
  }).join('')
}

/**
 * Seconds needed to read `text` once: 9 Chinese characters or 20 Latin characters a second. A line stays on
 * screen at least twice this long, and never less than 0.6 s per word.
 */
export function readSeconds(text: string): number {
  let cjk = 0, latin = 0
  for (const ch of text) {
    if (/\s/.test(ch)) continue
    if (isCjk(ch)) cjk += 1
    else latin += 1
  }
  return cjk / 9 + latin / 20
}

/** GSAP's power3.inOut (a quartic: GSAP's powerN is a power of N + 1), which the kit's `ease` table lacks. */
export const inOut4 = (p: number) => (p < 0.5 ? 8 * p ** 4 : 1 - (-2 * p + 2) ** 4 / 2)

const channels = (c: string) => {
  const v = (c.match(/[\d.]+/g) ?? []).map(Number)
  return [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 1]
}

/** The colour a fraction `k` of the way from `a` to `b` (`rgb()` or `rgba()`, as `color(name)` gives them), mixed per channel as GSAP's interpolate does. */
export function mixColor(a: string, b: string, k: number): string {
  const ca = channels(a), cb = channels(b)
  const [r, g, bl, al] = ca.map((v, i) => v + (cb[i]! - v) * k) as [number, number, number, number]
  return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(bl)}, ${+al.toFixed(3)})`
}

/** A stagger that keeps the whole wave under `cap` seconds: `each` apart for short lines, squeezed for long ones. */
export const wave = (count: number, each: number, cap: number) => Math.min(each, count > 1 ? cap / (count - 1) : each)
