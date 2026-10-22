import type { SpeechWord } from './contracts/speech.ts'

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
const LETTER = /[\p{L}\p{N}'’]/u

export function isCjk(char: string): boolean {
  return CJK.test(char)
}

/** Words of a text; start and end are offsets in the text, not times. */
export interface TextWord { text: string, start: number, end: number }

export function splitWords(text: string): TextWord[] {
  const words: TextWord[] = []
  let run: TextWord | undefined
  let at = 0
  for (const char of text) {
    if (isCjk(char)) {
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

export interface WordSpan { from: number, to: number, start: number, end: number }

export interface WrittenWord extends SpeechWord { offset?: number }

export function remapWords(words: readonly SpeechWord[], written: string, spoken: string, spans: readonly WordSpan[]): WrittenWord[] {
  const places: { start: number, end: number }[] = []
  let at = 0
  for (const word of words) {
    const index = word.text ? spoken.indexOf(word.text, at) : -1
    if (index < 0) return words.map(w => ({ ...w }))
    places.push({ start: index, end: at = index + word.text.length })
  }
  const writtenAt = (offset: number) => {
    let shift = 0
    for (const span of spans) {
      if (offset < span.from) break
      if (offset < span.to) return span.start
      shift += (span.end - span.start) - (span.to - span.from)
    }
    return offset + shift
  }
  const result: WrittenWord[] = []
  let group: { span: WordSpan, word: WrittenWord } | undefined
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
