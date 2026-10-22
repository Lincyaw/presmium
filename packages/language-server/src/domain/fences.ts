export interface Fence {
  line: number
  name: string
  nameStart: number
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

export function directiveAt(lines: readonly string[], line: number): Fence | undefined {
  for (let i = line; i >= 0; i--) {
    const fence = fenceAt(lines, i)
    if (fence) return fence
    if (!OPTION.test(lines[i] ?? '')) return undefined
  }
  return undefined
}

export function writtenOptions(lines: readonly string[], fence: Fence): string[] {
  const names: string[] = []
  for (let i = fence.line + 1; i < lines.length && OPTION.test(lines[i]!); i++) {
    const name = /^[ \t]*:([\w-]+):/.exec(lines[i]!)?.[1]
    if (name) names.push(name)
  }
  return names
}

export interface AnchorRef {
  anchor: `${string}:${string}`
  scheme: string
  line: number
  start: number
  end: number
}

export function anchorAt(lines: readonly string[], line: number, schemes: readonly string[] = [], anchors: ReadonlySet<string> = new Set()): AnchorRef | undefined {
  const fence = fenceAt(lines, line)
  const word = (fence && anchors.has(fence.name) ? fence.arg : fence?.arg.split(/\s/)[0]) ?? ''
  const colon = word.indexOf(':')
  if (!fence || colon <= 0) return undefined
  const scheme = word.slice(0, colon)
  if (!anchors.has(fence.name) && !schemes.includes(scheme)) return undefined
  return { anchor: word as AnchorRef['anchor'], scheme, line, start: fence.argStart, end: fence.argStart + word.length }
}

export type Typing =
  | { kind: 'directive', prefix: string, start: number, closed: boolean }
  | { kind: 'argument', fence: Fence, prefix: string, start: number }
  | { kind: 'option', fence: Fence, prefix: string, start: number, written: string[] }
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
