import { bundledLanguages } from 'shiki/langs'

/** The language of a code fence: one Shiki highlights, else `text`. */
export function codeLang(lang: unknown): string {
  const name = typeof lang === 'string' ? lang.toLowerCase() : ''
  return name in bundledLanguages ? name : 'text'
}

export function fenceLength(value: string): number {
  return Math.max(3, ...[...value.matchAll(/`+/g)].map(m => m[0].length + 1))
}

export function fence(lang: string, value: string, info: string): string {
  const ticks = '`'.repeat(fenceLength(value))
  return `${ticks}${codeLang(lang)}${info}\n${value}\n${ticks}`
}

/** Line numbers as Slidev's line highlighting writes them, such as `1-3,5`. */
export function lineRanges(lines: number[]): string {
  if (lines.length === 0) return 'all'
  const sorted = [...new Set(lines)].sort((a, b) => a - b)
  const ranges: string[] = []
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i]!
    while (sorted[i + 1] === sorted[i]! + 1) i++
    ranges.push(sorted[i] === start ? `${start}` : `${start}-${sorted[i]}`)
  }
  return ranges.join(',')
}
