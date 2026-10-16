/**
 * Words and their times: the fake engine's deterministic timing
 * (docs/architecture.md section 7: 220 ms per CJK character, 60 ms per
 * Latin letter or digit, 80 ms between words), the pronunciation lexicon,
 * and transcripts built from timed words.
 */
import type { SpeechWord, Transcript, TranscriptSegment } from '@presmium/kernel'

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
const LATIN = /[\p{L}\p{N}'’]/u

/** The words of a text: each CJK character, each run of other letters and digits; spaces and punctuation are not words. */
export function splitWords(text: string): string[] {
  const words: string[] = []
  let run = ''
  for (const char of text) {
    if (CJK.test(char)) {
      if (run) words.push(run)
      run = ''
      words.push(char)
    } else if (LATIN.test(char)) {
      run += char
    } else {
      if (run) words.push(run)
      run = ''
    }
  }
  if (run) words.push(run)
  return words
}

/** The fake engine's times of a text's words, in seconds; the duration is the end of the last word. */
export function fakeWords(text: string): { words: SpeechWord[], duration: number } {
  const words: SpeechWord[] = []
  let ms = 0
  for (const word of splitWords(text)) {
    const length = CJK.test(word) ? 220 : 60 * [...word].length
    if (words.length) ms += 80
    words.push({ text: word, start: ms / 1000, end: (ms + length) / 1000 })
    ms += length
  }
  return { words, duration: ms / 1000 }
}

/** A text as spoken: the pronunciation lexicon applied. */
export interface SpokenText {
  text: string
  /** Each replacement, in order: `from`–`to` in the spoken text, `start`–`end` in the written text. */
  spans: { from: number, to: number, start: number, end: number }[]
}

/** The text with the lexicon's written forms replaced by their spoken forms, longest first, and where each replacement is. */
export function speak(text: string, lexicon: Record<string, string> | undefined): SpokenText {
  const entries = Object.entries(lexicon ?? {}).filter(([written]) => written.length > 0).sort((a, b) => b[0].length - a[0].length)
  if (entries.length === 0) return { text, spans: [] }
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(entries.map(([written]) => escape(written)).join('|'), 'g')
  const spokenForm = new Map(entries)
  const spans: SpokenText['spans'] = []
  let spoken = ''
  let last = 0
  for (const match of text.matchAll(pattern)) {
    const replacement = spokenForm.get(match[0]) ?? match[0]
    spoken += text.slice(last, match.index)
    spans.push({ from: spoken.length, to: spoken.length + replacement.length, start: match.index, end: match.index + match[0].length })
    spoken += replacement
    last = match.index + match[0].length
  }
  return { text: spoken + text.slice(last), spans }
}

/** The text with the lexicon applied. */
export function applyLexicon(text: string, lexicon: Record<string, string> | undefined): string {
  return speak(text, lexicon).text
}

/**
 * Words timed over the spoken text as words of the written text (docs/ir.md
 * 2.9): the words that say one replacement become one word in its written
 * form, from the first one's start to the last one's end; the other words
 * are the same in both. Words that are not found in the spoken text, in
 * order, are given as the engine gave them.
 */
export function writtenWords(words: SpeechWord[], written: string, spoken: SpokenText): SpeechWord[] {
  if (spoken.spans.length === 0) return words
  const places: [number, number][] = []
  let at = 0
  for (const word of words) {
    const index = spoken.text.indexOf(word.text, at)
    if (index < 0) return words
    places.push([index, at = index + word.text.length])
  }
  /** A place in the spoken text as a place in the written text: inside a replacement, the start or end of its written form. */
  const writtenAt = (offset: number, edge: 'start' | 'end') => {
    let shift = 0
    for (const span of spoken.spans) {
      if (offset <= span.from) break
      if (offset < span.to) return edge === 'start' ? span.start : span.end
      shift += (span.end - span.start) - (span.to - span.from)
    }
    return offset + shift
  }
  const result: SpeechWord[] = []
  let group: { span: number, from: number, to: number, start: number, end: number } | undefined
  const flush = () => {
    if (group) result.push({ text: written.slice(writtenAt(group.from, 'start'), writtenAt(group.to, 'end')).trim(), start: group.start, end: group.end })
    group = undefined
  }
  words.forEach((word, index) => {
    const [from, to] = places[index]!
    const span = spoken.spans.findIndex(s => from < s.to && to > s.from)
    if (span >= 0 && group?.span === span) {
      group.to = Math.max(group.to, to)
      group.end = Math.max(group.end, word.end)
      return
    }
    flush()
    if (span >= 0) group = { span, from, to, start: word.start, end: word.end }
    else result.push(word)
  })
  flush()
  return result
}

/** A transcript of one segment that holds every word. */
export function oneSegment(text: string, words: SpeechWord[], lang: string, duration: number): Transcript {
  const segment: TranscriptSegment = { start: words[0]?.start ?? 0, end: words.at(-1)?.end ?? 0, text, words }
  return { lang, duration, text, segments: text || words.length ? [segment] : [] }
}

/** Segments with the words whose middle falls into each (the OpenAI shape gives words and segments apart). */
export function wordsIntoSegments(segments: { start: number, end: number, text: string }[], words: SpeechWord[]): TranscriptSegment[] {
  return segments.map((segment, index) => {
    const last = index === segments.length - 1
    const inside = words.filter((word) => {
      const middle = (word.start + word.end) / 2
      return middle >= segment.start && (middle < segment.end || (last && middle <= segment.end))
    })
    return { start: segment.start, end: segment.end, text: segment.text.trim(), words: inside }
  })
}
