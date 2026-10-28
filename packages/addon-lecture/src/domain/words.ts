import { isCjk, splitWords } from '@lincyaw/kernel'
import type { SpeechWord } from '@lincyaw/kernel'
import type { Utterance, Word } from './track.ts'

export function isWide(char: string | undefined): boolean {
  return Boolean(char && (isCjk(char) || /[　-〿＀-￯]/u.test(char)))
}

export function locate(words: readonly string[], text: string): ({ start: number, end: number } | undefined)[] {
  const places: ({ start: number, end: number } | undefined)[] = []
  let at = 0
  let lost = false
  for (const word of words) {
    const index = lost || !word ? -1 : text.indexOf(word, at)
    if (index < 0) {
      lost = true
      places.push(undefined)
      continue
    }
    places.push({ start: index, end: at = index + word.length })
  }
  return places
}

export function wordIndexAt(words: readonly { offset?: number }[], offset: number, length: number): number {
  if (words.every(w => w.offset !== undefined)) {
    const index = words.findIndex(w => w.offset! >= offset)
    return index === -1 ? words.length : index
  }
  return Math.min(words.length, Math.round(words.length * offset / Math.max(1, length)))
}

export function charOffset(text: string, offset: number): number {
  return [...text.slice(0, offset)].length
}

export function trackWords(words: readonly SpeechWord[], t: number): Word[] {
  return words.map((w): Word => {
    const start = Math.round(t + w.start * 1000), end = Math.round(t + w.end * 1000)
    return [start, Math.max(0, end - start), w.text]
  })
}

function common(a: readonly string[], b: readonly string[]): [number, number][] {
  const table = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) table[i]![j] = a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!)
  }
  const pairs: [number, number][] = []
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (a[i] === b[j]) pairs.push([i++, j++])
    else if (table[i + 1]![j]! >= table[i]![j + 1]!) i++
    else j++
  }
  return pairs
}

export function realign(utterance: Utterance, text: string): { utterance: Utterance, anchor: (offset: number) => number } {
  const before = utterance.words ?? []
  const next = splitWords(text)
  if (before.length === 0) {
    const [from, to] = [Math.max(1, [...utterance.text].length), Math.max(1, [...text].length)]
    return { utterance: { ...utterance, text, alignment: 'proportional' }, anchor: offset => Math.round(offset * to / from) }
  }
  const pairs = common(before.map(w => w[2]), next.map(w => w.text))
  const kept = new Map(pairs.map(([i, j]) => [j, i]))
  const end = utterance.t + utterance.d
  const words: Word[] = []
  for (let j = 0; j < next.length;) {
    const old = kept.get(j)
    if (old !== undefined) {
      words.push([before[old]![0], before[old]![1], next[j]!.text])
      j++
      continue
    }
    let k = j
    while (k < next.length && !kept.has(k)) k++
    const from = words.length ? words.at(-1)![0] + words.at(-1)![1] : utterance.t
    const until = k < next.length ? before[kept.get(k)!]![0] : end
    const span = Math.max(0, until - from)
    const chars = next.slice(j, k).map(w => [...w.text].length)
    const total = chars.reduce((a, b) => a + b, 0)
    let at = from
    for (let n = j; n < k; n++) {
      const d = Math.round(span * chars[n - j]! / total)
      words.push([at, d, next[n]!.text])
      at += d
    }
    j = k
  }
  const anchor = (offset: number) => {
    if (offset >= before.length) return next.length
    const pair = pairs.find(([i]) => i >= offset)
    if (pair && pair[0] === offset) return pair[1]
    const previous = [...pairs].reverse().find(([i]) => i < offset)
    return Math.min(next.length, previous ? previous[1] + 1 : 0)
  }
  return { utterance: { ...utterance, text, words, alignment: 'proportional' }, anchor }
}

export function reanchor(text: string, before: readonly Word[], after: readonly Word[]): (offset: number) => number {
  const old = locate(before.map(w => w[2]), text)
  const now = locate(after.map(w => w[2]), text)
  return (offset) => {
    if (offset >= before.length) return after.length
    const place = old[offset]
    if (!place || !now.every(Boolean)) return Math.min(offset, after.length)
    let index = 0
    now.forEach((p, i) => {
      if (p!.start <= place.start) index = i
    })
    return index
  }
}
