/**
 * Words and their times: the fake engine's deterministic timing
 * (docs/architecture.md section 7: 220 ms per CJK character, 60 ms per
 * Latin letter or digit, 80 ms between words, the words of the kernel's
 * `splitWords`), the pronunciation lexicon, and transcripts built from
 * timed words.
 */
import { splitWords } from '@presmium/kernel'
import type { SpeechWord, Transcript, TranscriptSegment, WordSpan } from '@presmium/kernel'

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u

/** The fake engine's times of a text's words, in seconds; the duration is the end of the last word. */
export function fakeWords(text: string): { words: SpeechWord[], duration: number } {
  const words: SpeechWord[] = []
  let ms = 0
  for (const { text: word } of splitWords(text)) {
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
  spans: WordSpan[]
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
