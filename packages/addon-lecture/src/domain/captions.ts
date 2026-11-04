import type { LectureTrack, Utterance } from './track.ts'
import { isWide, locate } from './words.ts'

export interface CaptionGroup { id: string, text: string, t: number, d: number, alignment: 'words' | 'proportional' | 'none' | 'manual' }

const MAX_CHARACTERS = 42
/** A group that would pass `MAX_CHARACTERS` ends at its last clause mark when that leaves it at least this long. */
const MIN_CLAUSE_CHARACTERS = 12
const hasText = /[\p{L}\p{N}]/u

/** Where a caption reads best when cut: after a sentence, else after a clause. */
type Mark = 'sentence' | 'clause'
const SENTENCE_MARK = /[。！？；….!?;]/u
const CLAUSE_MARK = /[，、：,:]/u
const ASCII_MARK = /[.!?;,:]/
const CLOSING = /[”’"'）)\]」』]/u

/**
 * What the mark at `text[at]` ends, if it is one. A full-width mark ends a sentence or clause wherever it stands; an
 * ASCII one only before a space or at the end of the text (past closing quotes and brackets), so "1,024", "10:30" and
 * "3.14" stay whole.
 */
function markAt(text: ArrayLike<string>, at: number): Mark | undefined {
  const char = text[at] ?? ''
  const mark = SENTENCE_MARK.test(char) ? 'sentence' : CLAUSE_MARK.test(char) ? 'clause' : undefined
  if (!mark || !ASCII_MARK.test(char)) return mark
  let next = at + 1
  while (next < text.length && CLOSING.test(text[next]!)) next++
  return next >= text.length || /\s/u.test(text[next]!) ? mark : undefined
}

/** What a cut before `text[at]` ends: the mark before it, past spaces and closing quotes and brackets (none before `from`). */
function markBefore(text: ArrayLike<string>, at: number, from = 0): Mark | undefined {
  let last = at - 1
  while (last >= from && (/\s/u.test(text[last]!) || CLOSING.test(text[last]!))) last--
  return last >= from ? markAt(text, last) : undefined
}

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
  const insideToken = (at: number) => asciiTokens.some(token => token.start < at && at < token.end)
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
  // Word `index` ends where the next one starts; a group ends after a word, never inside an ASCII token.
  const after = (index: number) => places[index + 1]?.start ?? utterance.text.length
  const characters = (to: number) => [...utterance.text.slice(from, to)].length
  for (let index = 0; index < words.length; index++) {
    const to = after(index)
    if (insideToken(to)) continue
    if (index + 1 === words.length || markBefore(utterance.text, to, from) === 'sentence') {
      if (!append(index, to)) return [full]
      continue
    }
    if (characters(after(index + 1)) <= MAX_CHARACTERS) continue
    // The next word would pass the limit: end at the group's last clause mark, unless that leaves it too short.
    let clause = index
    while (clause >= first && (insideToken(after(clause)) || markBefore(utterance.text, after(clause), from) !== 'clause')) clause--
    if (clause < first || characters(after(clause)) < MIN_CLAUSE_CHARACTERS) clause = index
    if (!append(clause, after(clause))) return [full]
    // The words after the clause start the next group, which the next word may still take past the limit.
    if (clause < index) index--
  }
  return groups
}

export function captionGroupAt(groups: readonly CaptionGroup[], timeMs: number): CaptionGroup | undefined {
  return groups.find(group => group.t <= timeMs && timeMs < group.t + group.d)
}

/** Shared projection used by publication and playback; an explicit manual gap stays empty. */
export function trackCaptionGroups(track: LectureTrack): CaptionGroup[] {
  return [...track.utterances.filter(u => !track.captionOverrides?.some(own => own.section === u.section && own.step === u.step)).flatMap(captionGroups),
    ...track.captionOverrides?.flatMap(own => own.groups) ?? []].sort((a, b) => a.t - b.t)
}

/** How wide a caption's text is, in em: a wide (CJK or full-width) character takes one, any other about 0.55. */
export function captionWidth(text: string): number {
  let width = 0
  for (const char of text) width += isWide(char) ? 1 : 0.55
  return width
}

/**
 * A caption cut into pieces no wider than `budget` em, about equally long, each ending where it reads best: after a
 * sentence, else after a clause, else at a space, else between two characters. A caption that fits stays whole.
 */
export function captionChunks(text: string, budget: number): string[] {
  const chars = [...text.trim()], total = captionWidth(text.trim())
  if (total <= budget || budget <= 0) return [text.trim()]
  const target = Math.min(budget, total / Math.ceil(total / budget) * 1.15)
  const chunks: string[] = []
  let start = 0
  while (start < chars.length) {
    while (start < chars.length && /\s/u.test(chars[start]!)) start++
    let end = start, used = 0
    while (end < chars.length && used + (isWide(chars[end]) ? 1 : 0.55) <= target) used += isWide(chars[end++]) ? 1 : 0.55
    if (end >= chars.length) { chunks.push(chars.slice(start).join('').trim()); break }
    // A break too early would leave a short piece; below 40% of the window take a weaker one.
    const earliest = start + Math.ceil((end - start) * 0.4)
    const after = (mark: Mark) => { for (let at = end; at > earliest; at--) if (markAt(chars, at - 1) === mark) return at; return -1 }
    let cut = after('sentence')
    if (cut < 0) cut = after('clause')
    if (cut < 0) for (let at = end; at > earliest; at--) if (/\s/u.test(chars[at]!)) { cut = at; break }
    if (cut < 0) cut = Math.max(end, start + 1)
    while (cut < chars.length && CLOSING.test(chars[cut]!)) cut++
    chunks.push(chars.slice(start, cut).join('').trim())
    start = cut
  }
  return chunks.filter(Boolean)
}

/** The piece of a caption shown at `time`: its pieces follow one another across its span, each for its share of the width. */
export function captionChunkAt(caption: { text: string, t: number, d: number }, time: number, budget: number): string {
  const chunks = captionChunks(caption.text, budget)
  if (chunks.length < 2 || !(caption.d > 0)) return chunks[0] ?? ''
  const widths = chunks.map(chunk => Math.max(1, captionWidth(chunk))), total = widths.reduce((sum, width) => sum + width, 0)
  const at = (time - caption.t) / caption.d * total
  let reached = 0
  for (const [index, chunk] of chunks.entries()) {
    reached += widths[index]!
    if (at < reached) return chunk
  }
  return chunks.at(-1)!
}
