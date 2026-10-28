import type { Utterance } from './track.ts'
import { locate } from './words.ts'

export interface CaptionGroup { id: string, text: string, t: number, d: number, alignment: 'words' | 'proportional' | 'none' }

const MAX_CHARACTERS = 42
const sentenceEnd = /[。！？!?；;]\s*[”’"'）)\]]*\s*$/u
const hasText = /[\p{L}\p{N}]/u

/** Readable display groups; every internal time boundary belongs to an actual word. */
export function captionGroups(utterance: Utterance): CaptionGroup[] {
  const full: CaptionGroup = { id: utterance.id, text: utterance.text, t: utterance.t, d: utterance.d,
    alignment: utterance.alignment === 'proportional' ? 'proportional' : 'none' }
  const words = utterance.words
  if (utterance.silent || utterance.recording || utterance.unsaid || utterance.alignment !== 'words' || !words?.length || utterance.d <= 0) return [full]
  const places = locate(words.map(word => word[2]), utterance.text)
  let previous = utterance.t, end = 0
  for (const [index, word] of words.entries()) {
    const place = places[index]
    if (!place || !Number.isFinite(word[0]) || !Number.isFinite(word[1]) || word[1] <= 0
      || word[0] < previous || word[0] + word[1] > utterance.t + utterance.d
      || hasText.test(utterance.text.slice(end, place.start))) return [full]
    previous = word[0] + word[1]; end = place.end
  }
  if (hasText.test(utterance.text.slice(end))) return [full]
  const asciiTokens = [...utterance.text.matchAll(/[\x21-\x7e]+/g)].map(match => ({ start: match.index, end: match.index + match[0].length }))
  let token = 0
  const groups: CaptionGroup[] = []
  let from = 0, first = 0
  const append = (last: number, to: number) => {
    const start = first === 0 ? utterance.t : words[first]![0]
    const until = last + 1 < words.length ? words[last + 1]![0] : utterance.t + utterance.d
    if (until <= start) return false
    groups.push({ id: `${utterance.id}:${from}`, text: utterance.text.slice(from, to), t: start, d: until - start, alignment: 'words' })
    from = to; first = last + 1
    return true
  }
  for (let index = 0; index < words.length; index++) {
    const to = places[index + 1]?.start ?? utterance.text.length
    const text = utterance.text.slice(from, to)
    while (asciiTokens[token] && asciiTokens[token]!.end <= to) token++
    const insideToken = asciiTokens[token] && asciiTokens[token]!.start < to && to < asciiTokens[token]!.end
    const next = places[index + 2]?.start ?? utterance.text.length
    if (!insideToken && (index + 1 === words.length || sentenceEnd.test(text) || [...utterance.text.slice(from, next)].length > MAX_CHARACTERS)) {
      if (!append(index, to)) return [full]
    }
  }
  return groups
}

export function captionGroupAt(groups: readonly CaptionGroup[], timeMs: number): CaptionGroup | undefined {
  return groups.find(group => group.t <= timeMs && timeMs < group.t + group.d)
}
