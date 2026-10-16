/**
 * The MyST source around a position in the editor: the directive fence on a
 * line, the options block under it, the anchor of a directive and what is
 * being typed. The editor's buffer may not parse yet, so this reads lines;
 * the compiler stays the parser of the deck.
 */

/** Opening fence of a directive: ```` ```{name} arg ```` or `:::{name} arg`. */
export interface Fence {
  /** 0-based line. */
  line: number
  name: string
  /** Column of the name, after `{`. */
  nameStart: number
  /** The argument, trimmed; empty when there is none. */
  arg: string
  argStart: number
}

const FENCE = /^([ \t]*(?:`{3,}|~{3,}|:{3,})\{)([^{}\s]*)\}(.*)$/
const OPTION = /^[ \t]*:[\w-]*(?::.*)?$/

export function fenceAt(lines: readonly string[], line: number): Fence | undefined {
  const match = FENCE.exec(lines[line] ?? '')
  if (!match) return undefined
  const [, open, name, rest] = match as unknown as [string, string, string, string]
  const after = open.length + name.length + 1
  return { line, name, nameStart: open.length, arg: rest.trim(), argStart: after + rest.length - rest.trimStart().length }
}

/** The directive whose fence is on `line` or above the options block that holds `line`. */
export function directiveAt(lines: readonly string[], line: number): Fence | undefined {
  for (let i = line; i >= 0; i--) {
    const fence = fenceAt(lines, i)
    if (fence) return fence
    if (!OPTION.test(lines[i] ?? '')) return undefined
  }
  return undefined
}

/** Names of the options written under a fence (`:name: value` lines). */
export function writtenOptions(lines: readonly string[], fence: Fence): string[] {
  const names: string[] = []
  for (let i = fence.line + 1; i < lines.length && OPTION.test(lines[i]!); i++) {
    const name = /^[ \t]*:([\w-]+):/.exec(lines[i]!)?.[1]
    if (name) names.push(name)
  }
  return names
}

/** An anchor written as the argument of a directive. */
export interface AnchorRef {
  anchor: `${string}:${string}`
  scheme: string
  line: number
  start: number
  end: number
}

/**
 * The anchor on a fence line: the argument of a directive whose argument is
 * an anchor (`anchors`, from the specs' `arg: 'anchor'`; a `pattern:` anchor
 * may hold spaces), or the first word of the argument of any directive when
 * it starts with one of `schemes`.
 */
export function anchorAt(lines: readonly string[], line: number, schemes: readonly string[] = [], anchors: ReadonlySet<string> = new Set()): AnchorRef | undefined {
  const fence = fenceAt(lines, line)
  const word = (fence && anchors.has(fence.name) ? fence.arg : fence?.arg.split(/\s/)[0]) ?? ''
  const colon = word.indexOf(':')
  if (!fence || colon <= 0) return undefined
  const scheme = word.slice(0, colon)
  if (!anchors.has(fence.name) && !schemes.includes(scheme)) return undefined
  return { anchor: word as AnchorRef['anchor'], scheme, line, start: fence.argStart, end: fence.argStart + word.length }
}

/** What is being typed at a position, for completion. `start` is the column where the typed word begins. */
export type Typing =
  /** A directive name after the opening `{`; `closed` when the `}` follows. */
  | { kind: 'directive', prefix: string, start: number, closed: boolean }
  /** The argument of a directive. */
  | { kind: 'argument', fence: Fence, prefix: string, start: number }
  /** An option name in the options block. */
  | { kind: 'option', fence: Fence, prefix: string, start: number, written: string[] }
  /** The value of an option; for a list, its last item. */
  | { kind: 'value', fence: Fence, option: string, prefix: string, start: number }

export function typingAt(lines: readonly string[], line: number, character: number): Typing | undefined {
  const text = lines[line] ?? ''
  const before = text.slice(0, character)
  const opening = /^[ \t]*(?:`{3,}|~{3,}|:{3,})\{([\w-]*)$/.exec(before)
  if (opening) return { kind: 'directive', prefix: opening[1]!, start: character - opening[1]!.length, closed: text[character] === '}' }

  const fence = fenceAt(lines, line)
  if (fence) {
    const brace = fence.nameStart + fence.name.length
    if (character <= brace) return undefined
    const prefix = before.slice(brace + 1).trimStart()
    return { kind: 'argument', fence, prefix, start: character - prefix.length }
  }

  const directive = directiveAt(lines, line)
  if (!directive) return undefined
  const option = /^[ \t]*:([\w-]*)$/.exec(before)
  if (option) return { kind: 'option', fence: directive, prefix: option[1]!, start: character - option[1]!.length, written: writtenOptions(lines, directive) }
  const value = /^[ \t]*:([\w-]+):[ \t]*(.*)$/.exec(before)
  if (!value) return undefined
  const prefix = value[2]!.split(',').at(-1)!.trimStart()
  return { kind: 'value', fence: directive, option: value[1]!, prefix, start: character - prefix.length }
}
