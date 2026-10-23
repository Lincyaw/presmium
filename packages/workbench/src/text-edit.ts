/** Where a block's source is: its file and lines (1-based, inclusive). */
export interface SourceLines {
  line: number
  endLine?: number
}

export type TextEditResult =
  | { ok: true, content: string }
  /** `formatted`: the changed text crosses formatting or markup; `unknown`: the rendered text was not found in the source; `large`: the block is too long to align. */
  | { ok: false, reason: 'formatted' | 'unknown' | 'large' }

// The rendered text and the source are aligned by their longest common subsequence; past this many cells it is too slow.
const MAX_CELLS = 4_000_000
const ESCAPED = /[\\`*_[\]<>{}$|~#]/g

/**
 * Applies an edit made to a block's rendered text (its `textContent` before and after) to the block's source lines in
 * `source`. The changed run of characters must be plain text in the source; a change that crosses markup (emphasis,
 * a link's target, a role) is refused, since writing it back would drop or break the formatting.
 */
export function applyRenderedEdit(source: string, lines: SourceLines, before: string, after: string): TextEditResult {
  if (before === after) return { ok: true, content: source }
  const [start, end] = lineOffsets(source, lines)
  const segment = source.slice(start, end)
  let prefix = 0
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++
  let suffix = 0
  while (suffix < before.length - prefix && suffix < after.length - prefix && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++
  const removed = before.length - prefix - suffix
  const inserted = after.slice(prefix, after.length - suffix)
  if (before.length * segment.length > MAX_CELLS) return { ok: false, reason: 'large' }
  const map = alignText(before, segment)
  let from: number
  let to: number
  if (removed > 0) {
    from = map[prefix]!
    to = map[prefix + removed - 1]!
    if (from < 0 || to < 0) return { ok: false, reason: 'unknown' }
    for (let i = prefix + 1; i < prefix + removed; i++) {
      if (map[i] !== map[i - 1]! + 1) return { ok: false, reason: 'formatted' }
    }
    to += 1
  } else {
    const previous = prefix > 0 ? map[prefix - 1]! : -1
    const next = prefix < before.length ? map[prefix]! : -1
    if (previous >= 0) from = previous + 1
    else if (next >= 0) from = next
    else if (before.length === 0) from = segment.length
    else return { ok: false, reason: 'unknown' }
    to = from
  }
  const text = inserted.replace(/\s*\n\s*/g, ' ').replace(ESCAPED, char => `\\${char}`)
  return { ok: true, content: `${source.slice(0, start + from)}${text}${source.slice(start + to)}` }
}

/** The offsets of the lines' start and of their last line's end (before its newline). */
function lineOffsets(source: string, { line, endLine = line }: SourceLines): [number, number] {
  let start = 0
  for (let n = 1; n < line && start <= source.length; n++) {
    const at = source.indexOf('\n', start)
    if (at < 0) return [source.length, source.length]
    start = at + 1
  }
  let end = start
  for (let n = line; n <= endLine; n++) {
    const at = source.indexOf('\n', end)
    if (at < 0) return [start, source.length]
    end = n === endLine ? at : at + 1
  }
  return [start, end]
}

/** For each character of `text`, its offset in `source` when it is part of their longest common subsequence, else -1. */
function alignText(text: string, source: string): Int32Array {
  const rows = text.length
  const cols = source.length
  const width = cols + 1
  // lengths[i * width + j]: the longest common subsequence of text[i..] and source[j..].
  const lengths = new Uint32Array((rows + 1) * width)
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = cols - 1; j >= 0; j--) {
      lengths[i * width + j] = text[i] === source[j]
        ? lengths[(i + 1) * width + j + 1]! + 1
        : Math.max(lengths[(i + 1) * width + j]!, lengths[i * width + j + 1]!)
    }
  }
  const map = new Int32Array(rows).fill(-1)
  let i = 0
  let j = 0
  while (i < rows && j < cols) {
    if (text[i] === source[j] && lengths[i * width + j] === lengths[(i + 1) * width + j + 1]! + 1) {
      map[i] = j
      i++
      j++
    } else if (lengths[(i + 1) * width + j]! >= lengths[i * width + j + 1]!) i++
    else j++
  }
  return map
}
