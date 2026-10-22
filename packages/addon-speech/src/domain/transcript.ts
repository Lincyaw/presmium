import type { SpeechWord, Transcript, TranscriptSegment } from '@lincyaw/kernel'

export function oneSegment(text: string, words: SpeechWord[], lang: string, duration: number): Transcript {
  const segment: TranscriptSegment = { start: words[0]?.start ?? 0, end: words.at(-1)?.end ?? 0, text, words }
  return { lang, duration, text, segments: text || words.length ? [segment] : [] }
}

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
