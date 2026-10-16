/**
 * Words of an utterance and their times (docs/ir.md 2.9, 9.1): an event is
 * bound to a word (`at: [utterance, offset]`, the offset an index into the
 * utterance's words, or a character offset when it has none), so new text
 * or a new voice moves the event along. These functions find words in a
 * text, map the words an engine said (of the spoken text, with `{say}`
 * aliases) back to the written text, and keep the times of the words that
 * stay when a text is edited.
 */
import type { Utterance, Word } from './track.ts'

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
const LETTER = /[\p{L}\p{N}'’]/u

/** Whether a character is written without spaces between words (Chinese, Japanese, Korean). */
export function isCjk(char: string): boolean {
  return CJK.test(char)
}

/** A word of a text and where it is (UTF-16 offsets). */
export interface TextWord {
  text: string
  start: number
  end: number
}

/** The words of a text: each CJK character, each run of other letters and digits; spaces and punctuation are not words. */
export function splitWords(text: string): TextWord[] {
  const words: TextWord[] = []
  let run: TextWord | undefined
  let at = 0
  for (const char of text) {
    if (CJK.test(char)) {
      if (run) words.push(run)
      run = undefined
      words.push({ text: char, start: at, end: at + char.length })
    } else if (LETTER.test(char)) {
      run ??= { text: '', start: at, end: at }
      run.text += char
      run.end = at + char.length
    } else if (run) {
      words.push(run)
      run = undefined
    }
    at += char.length
  }
  if (run) words.push(run)
  return words
}

/** Where each word is in `text`, looked for in order; undefined from the first one that is not found. */
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

/** A word an engine gave: seconds from the start of its audio. */
export interface TimedWord {
  text: string
  start: number
  end: number
}

/** A replacement of the written text in the spoken one (`{say}`): `from`–`to` spoken, `start`–`end` written. */
export interface Span {
  from: number
  to: number
  start: number
  end: number
}

/** A word of the written text with its time, and where it is in the text when known. */
export interface PlacedWord extends TimedWord {
  offset?: number
}

/**
 * The words an engine said of the spoken text as words of the written one:
 * the words of a replacement become one word, its written form, from the
 * first one's start to the last one's end; the others are the same in both.
 * When a word is not found in the spoken text, the words are given as the
 * engine gave them, without places.
 */
export function writtenWords(words: readonly TimedWord[], written: string, spoken: string, spans: readonly Span[]): PlacedWord[] {
  const places = locate(words.map(w => w.text), spoken)
  if (places.some(p => !p)) return words.map(w => ({ ...w }))
  /** A place in the spoken text as a place in the written text. */
  const writtenAt = (offset: number) => {
    let shift = 0
    for (const span of spans) {
      if (offset < span.from) break
      if (offset < span.to) return span.start
      shift += (span.end - span.start) - (span.to - span.from)
    }
    return offset + shift
  }
  const result: PlacedWord[] = []
  let group: { span: Span, word: PlacedWord } | undefined
  words.forEach((word, i) => {
    const { start, end } = places[i]!
    const span = spans.find(s => start < s.to && end > s.from)
    if (span && group?.span === span) {
      group.word.end = Math.max(group.word.end, word.end)
      return
    }
    group = undefined
    if (span) {
      const placed = { text: written.slice(span.start, span.end), start: word.start, end: word.end, offset: span.start }
      group = { span, word: placed }
      result.push(placed)
    } else {
      result.push({ ...word, offset: writtenAt(start) })
    }
  })
  return result
}

/**
 * The anchor offset of a place in a text: the index of the first word that
 * starts there or after it (the word a cue sits before), the number of words
 * at the end. Without the words' places, the same share of the words.
 */
export function wordIndexAt(words: readonly { offset?: number }[], offset: number, length: number): number {
  if (words.every(w => w.offset !== undefined)) {
    const index = words.findIndex(w => w.offset! >= offset)
    return index === -1 ? words.length : index
  }
  return Math.min(words.length, Math.round(words.length * offset / Math.max(1, length)))
}

/** The character offset (in code points) of a UTF-16 offset of a text, for an utterance without word times. */
export function charOffset(text: string, offset: number): number {
  return [...text.slice(0, offset)].length
}

/** The words of an utterance as the track holds them: ms, from `t`. */
export function trackWords(words: readonly TimedWord[], t: number): Word[] {
  return words.map(w => [Math.round(t + w.start * 1000), Math.max(0, Math.round((w.end - w.start) * 1000)), w.text])
}

/** The longest common subsequence of two lists of words, as pairs of indices. */
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

/**
 * An utterance with new text (P-132): the words that stay keep their times;
 * new words share the time between the words around them by their number of
 * characters. Also gives where each old word's anchor goes: the same word,
 * or for a word that is gone, the word now in its place.
 */
export function realign(utterance: Utterance, text: string): { utterance: Utterance, anchor: (offset: number) => number } {
  const before = utterance.words ?? []
  const next = splitWords(text)
  if (before.length === 0) {
    // Without word times the anchors are character offsets; they keep their share of the text.
    const [from, to] = [Math.max(1, [...utterance.text].length), Math.max(1, [...text].length)]
    return { utterance: { ...utterance, text }, anchor: offset => Math.round(offset * to / from) }
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
    // A run of new words, between the kept words around it.
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
  /** The new index of each old word: its own, else that of the first new word after the words kept before it. */
  const anchor = (offset: number) => {
    if (offset >= before.length) return next.length
    const pair = pairs.find(([i]) => i >= offset)
    if (pair && pair[0] === offset) return pair[1]
    const previous = [...pairs].reverse().find(([i]) => i < offset)
    return Math.min(next.length, previous ? previous[1] + 1 : 0)
  }
  return { utterance: { ...utterance, text, words }, anchor }
}

/**
 * The anchor offsets of words found again among new words of the same text
 * (a new voice gives its own words): by the place in the text of the word
 * an anchor named.
 */
export function reanchor(text: string, before: readonly Word[], after: readonly Word[]): (offset: number) => number {
  const old = locate(before.map(w => w[2]), text)
  const now = locate(after.map(w => w[2]), text)
  return (offset) => {
    if (offset >= before.length) return after.length
    const place = old[offset]
    if (!place || !now.every(Boolean)) return Math.min(offset, after.length)
    // The new word that holds the place: the last one that starts there or before it.
    let index = 0
    now.forEach((p, i) => {
      if (p!.start <= place.start) index = i
    })
    return index
  }
}
