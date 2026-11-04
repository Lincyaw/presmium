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

const charWidth = (char: string | undefined) => isWide(char) ? 1 : 0.55

/** How wide a caption's text is, in em: a wide (CJK or full-width) character takes one, any other about 0.55. */
export function captionWidth(text: string): number {
  let width = 0
  for (const char of text) width += charWidth(char)
  return width
}

/**
 * How well a caption reads cut before `chars[at]`: 3 after a sentence, 2 after a clause, 1 at a space, 0 between two
 * characters, -1 inside an ASCII word or number, or with a punctuation mark left on the wrong side.
 */
function cutRank(chars: readonly string[], at: number): number {
  const before = chars[at - 1]!, after = chars[at]!
  const mark = CLOSING.test(after) ? undefined : markBefore(chars, at)
  if (mark) return mark === 'sentence' ? 3 : 2
  if (/\s/u.test(before) || /\s/u.test(after)) return 1
  if (/[\p{Pe}\p{Pf}\p{Po}]/u.test(after) || /[\p{Ps}\p{Pi}]/u.test(before)) return -1
  return isWide(before) || isWide(after) ? 0 : -1
}

/** A piece may be this much shorter or longer than an equal share of the caption; within that it ends where it reads best. */
const SHARE_SLACK = 0.3

/** `chars` cut into `count` pieces of about equal width; `reach[i]` is the width of the first `i` characters. */
function cutInto(chars: readonly string[], reach: readonly number[], budget: number, count: number): string[] {
  const pieces: string[] = []
  let start = 0
  for (let left = count; left > 1 && start < chars.length; left--) {
    const rest = reach[chars.length]! - reach[start]!, share = rest / left
    // No wider than the budget, and wide enough that the pieces after it can hold the rest.
    const shortest = Math.max(share * (1 - SHARE_SLACK), rest - (left - 1) * budget), longest = Math.min(budget, share * (1 + SHARE_SLACK))
    let cut = start + 1, best = -Infinity
    for (let at = start + 1; at < chars.length && reach[at]! - reach[start]! <= longest; at++) {
      const width = reach[at]! - reach[start]!
      // The best mark nearest the share; a cut shorter than the shortest only when none is long enough.
      const score = width < shortest ? width - 1000 : cutRank(chars, at) * 100 - Math.abs(width - share)
      if (score > best) { best = score; cut = at }
    }
    pieces.push(chars.slice(start, cut).join('').trim())
    start = cut
    while (start < chars.length && /\s/u.test(chars[start]!)) start++
  }
  pieces.push(chars.slice(start).join('').trim())
  return pieces.filter(Boolean)
}

/**
 * A caption cut into pieces no wider than `budget` em: as few as fit, of about equal width (each within 30% of an equal
 * share), each ending where it reads best: after a sentence, else after a clause, else at a space, else between two
 * characters. A caption that fits stays whole.
 */
export function captionChunks(text: string, budget: number): string[] {
  const chars = [...text.trim()], reach = [0]
  for (const char of chars) reach.push(reach.at(-1)! + charWidth(char))
  const total = reach.at(-1)!
  if (total <= budget || !(budget > 0)) return [text.trim()]
  for (let count = Math.ceil(total / budget); ; count++) {
    const pieces = cutInto(chars, reach, budget, count)
    if (count >= chars.length || pieces.every(piece => captionWidth(piece) <= budget)) return pieces
  }
}

/** A caption with the time it spans. */
export interface TimedCaption { text: string, t: number, d: number }

/**
 * The caption an export burns in at `time` in `lang`, with the time it spans (its pieces share it). In the lecture's
 * language: the manual group there (an author's gap stays empty), else the caption group of `current`, the sentence
 * heard then (`groups`, by default its word-aligned groups), else the whole sentence. In another language: the
 * sentence's translation.
 */
export function burnedCaption(track: LectureTrack, current: Utterance | undefined, time: number, lang: string,
  groups: (utterance: Utterance) => readonly CaptionGroup[] = captionGroups): TimedCaption | undefined {
  if (lang !== track.lang) return current && { text: current.translations?.[lang]?.text ?? '', t: current.t, d: current.d }
  const manual = track.captionOverrides?.find(own => own.startMs <= time && time < own.endMs)
  const group = manual ? captionGroupAt(manual.groups, time) : current && captionGroupAt(groups(current), time)
  if (group) return { text: group.text, t: group.t, d: group.d }
  return manual ? undefined : current && { text: current.text, t: current.t, d: current.d }
}

/** The piece of a caption shown at `time`: its pieces follow one another across its span, each for its share of the width. */
export function captionChunkAt(caption: TimedCaption, time: number, budget: number): string {
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
