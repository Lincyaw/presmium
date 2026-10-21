import { setImmediate } from 'node:timers/promises'
import type { MdastNode } from '@lincyaw/kernel'
import { createTokenizer } from 'myst-parser'

const CHUNK_BYTES = 8192
const CACHE_BYTES = 4 << 20
const CACHE_ENTRIES = 512

interface Fragment { text: string, line: number }
interface CachedFragment { tree: MdastNode, line: number }
interface Split {
  file: string
  text: string
  fragments: Fragment[]
  paragraphs: { start: number, end: number }[]
}

/** Keep Markdown blocks intact. File-wide definitions must share a parser environment. */
export class FragmentParser {
  readonly #tokenizer = createTokenizer()
  readonly #cache = new Map<string, CachedFragment>()
  #bytes = 0
  #previous?: Split

  async parse(text: string, parse: (text: string) => MdastNode, file: string, signal?: AbortSignal): Promise<MdastNode> {
    signal?.throwIfAborted()
    if (text.length < CHUNK_BYTES || text.includes(']:') || /^ {0,3}\+{3,}/m.test(text)) return parse(text)
    const fragments = this.#split(text, file)
    if (fragments.length < 2) return parse(text)
    const children: MdastNode[] = []
    let yielded = performance.now()
    for (const fragment of fragments) {
      signal?.throwIfAborted()
      const key = `${file}\0${fragment.text}`
      let cached = this.#cache.get(key)
      if (!cached) {
        // A leading blank prevents an interior thematic break becoming frontmatter.
        const tree = parse(`\n${fragment.text}`)
        shiftLines(tree, fragment.line - 2)
        cached = { tree, line: fragment.line }
        this.#cache.set(key, cached)
        this.#bytes += key.length * 2
      } else {
        if (cached.line !== fragment.line) {
          const tree = structuredClone(cached.tree)
          shiftLines(tree, fragment.line - cached.line)
          cached = { tree, line: fragment.line }
        }
        this.#cache.delete(key)
        this.#cache.set(key, cached)
      }
      children.push(...cached.tree.children ?? [])
      this.#trim()
      if (performance.now() - yielded >= 8) {
        await setImmediate()
        yielded = performance.now()
      }
    }
    return { type: 'root', children }
  }

  #split(text: string, file: string): Fragment[] {
    const normalized = text.replace(/\r\n?/g, '\n').replace(/\0/g, '\ufffd')
    const edited = this.#paragraphEdit(normalized, file)
    if (edited) return edited
    const lines = normalized.split('\n')
    const offsets = [0]
    for (const line of lines) offsets.push(offsets.at(-1)! + line.length + 1)
    const tokens: ReturnType<ReturnType<typeof createTokenizer>['parse']> = []
    // Public markdown-it block parsing finds safe boundaries without running directives.
    this.#tokenizer.block.parse(normalized, this.#tokenizer, {}, tokens)
    const fragments: Fragment[] = []
    const paragraphs: Split['paragraphs'] = []
    let start = 0
    for (const token of tokens) {
      if (token.level === 0 && token.type === 'paragraph_open' && token.map) {
        paragraphs.push({ start: offsets[token.map[0]]!, end: offsets[token.map[1]]! })
      }
      const line = token.map?.[0]
      if (token.level !== 0 || line === undefined || line <= start || lines[line - 1]?.trim()) continue
      if (offsets[line]! - offsets[start]! < CHUNK_BYTES) continue
      fragments.push({ text: normalized.slice(offsets[start], offsets[line]), line: start + 1 })
      start = line
    }
    fragments.push({ text: normalized.slice(offsets[start]), line: start + 1 })
    this.#previous = { file, text: normalized, fragments, paragraphs }
    return fragments
  }

  #paragraphEdit(text: string, file: string): Fragment[] | undefined {
    const previous = this.#previous
    if (!previous || previous.file !== file) return undefined
    let start = 0
    const shared = Math.min(text.length, previous.text.length)
    while (start < shared && text[start] === previous.text[start]) start++
    let beforeEnd = previous.text.length
    let afterEnd = text.length
    while (beforeEnd > start && afterEnd > start && previous.text[beforeEnd - 1] === text[afterEnd - 1]) { beforeEnd--; afterEnd-- }
    const before = previous.text.slice(start, beforeEnd)
    const after = text.slice(start, afterEnd)
    // Only interior prose edits can preserve block boundaries without tokenizing.
    // Syntax, indentation, HTML and line changes take the full boundary scan.
    if (/[\r\n`~:<>{}\[\]\\#*$+|=()-]/.test(before + after)) return undefined
    const line = previous.text.lastIndexOf('\n', start - 1) + 1
    const endLine = previous.text.indexOf('\n', start)
    const oldLine = previous.text.slice(line, endLine < 0 ? undefined : endLine)
    if (start <= line + (oldLine.match(/^\s*/)?.[0].length ?? 0) || /[<>]/.test(oldLine)) return undefined
    if (!previous.paragraphs.some(paragraph => paragraph.start <= start && beforeEnd <= paragraph.end)) return undefined
    const delta = afterEnd - beforeEnd
    let offset = 0
    const fragments = previous.fragments.map((fragment) => {
      const end = offset + fragment.text.length
      const changed = offset <= start && beforeEnd <= end && start < end
      const next = changed ? { ...fragment, text: text.slice(offset, end + delta) } : fragment
      offset = end
      return next
    })
    const paragraphs = previous.paragraphs.map(paragraph => ({
      start: paragraph.start > start ? paragraph.start + delta : paragraph.start,
      end: paragraph.end >= beforeEnd ? paragraph.end + delta : paragraph.end,
    }))
    this.#previous = { file, text, fragments, paragraphs }
    return fragments
  }

  #trim(): void {
    while (this.#bytes > CACHE_BYTES || this.#cache.size > CACHE_ENTRIES) {
      const first = this.#cache.keys().next().value!
      this.#bytes -= first.length * 2
      this.#cache.delete(first)
    }
  }
}

export function shiftLines(node: MdastNode, offset: number): void {
  const position = node.position as { start?: { line: number }, end?: { line: number } } | undefined
  if (position?.start) position.start.line += offset
  if (position?.end) position.end.line += offset
  if (typeof node.line === 'number') node.line += offset
  for (const child of node.children ?? []) shiftLines(child, offset)
}
