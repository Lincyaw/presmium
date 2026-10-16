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

/** The text with the lexicon's written forms replaced by their spoken forms, longest first. */
export function applyLexicon(text: string, lexicon: Record<string, string> | undefined): string {
  const entries = Object.entries(lexicon ?? {}).filter(([written]) => written.length > 0).sort((a, b) => b[0].length - a[0].length)
  if (entries.length === 0) return text
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(entries.map(([written]) => escape(written)).join('|'), 'g')
  const spoken = new Map(entries)
  return text.replace(pattern, match => spoken.get(match) ?? match)
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
