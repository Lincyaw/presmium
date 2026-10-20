import { isRecord } from '@lincyaw/kernel'
import type { MdastNode, WordSpan } from '@lincyaw/kernel'
import { LECTURE_ID } from './track.ts'
import { isCjk } from './words.ts'

export interface CueMark {
  offset: number
  command: string
  to?: string
  lines?: string
  sel?: string
}

export interface SpokenText {
  text: string
  spoken: string
  spans: WordSpan[]
  cues: CueMark[]
}

const SILENT = new Set(['image', 'imageReference', 'html', 'footnoteReference', 'definition', 'footnoteDefinition', 'comment', 'mystComment', 'target', 'mystTarget'])

const BLOCKS = new Set(['paragraph', 'listItem', 'heading', 'blockquote', 'tableCell', 'tableRow'])

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

class Builder {
  text = ''
  spoken = ''
  readonly spans: WordSpan[] = []
  readonly cues: CueMark[] = []
  private pending: 'space' | 'line' | undefined

  append(shown: string, spoken = shown): void {
    if (shown === spoken) {
      for (const char of shown) this.char(char, char)
      return
    }
    const [lead] = /^\s*/.exec(shown)!
    for (const char of lead) this.char(char, char)
    this.flush(shown.trim()[0] ?? '')
    const start = this.text.length
    const from = this.spoken.length
    this.text += collapse(shown)
    this.spoken += collapse(spoken)
    this.spans.push({ from, to: this.spoken.length, start, end: this.text.length })
    if (/\s$/.test(shown)) this.pending = 'space'
  }

  cue(mark: Omit<CueMark, 'offset'>): void {
    this.cues.push({ ...mark, offset: this.text.length })
  }

  line(): void {
    if (this.text) this.pending = 'line'
  }

  done(): SpokenText {
    return { text: this.text, spoken: this.spoken, spans: this.spans, cues: this.cues.map(c => ({ ...c, offset: Math.min(c.offset, this.text.length) })) }
  }

  private char(shown: string, spoken: string): void {
    if (/\s/.test(shown)) {
      if (this.text) this.pending = shown === '\n' || this.pending === 'line' ? 'line' : 'space'
      return
    }
    this.flush(shown)
    this.text += shown
    this.spoken += spoken
  }

  private flush(next: string): void {
    const pending = this.pending
    this.pending = undefined
    if (!pending || !this.text) return
    if (wide(this.text.at(-1)!) && (wide(next) || !next)) return
    this.text += ' '
    this.spoken += ' '
  }
}

function wide(char: string): boolean {
  return isCjk(char) || /[　-〿＀-￯]/u.test(char)
}

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function lectureRole(node: MdastNode, name: 'cue' | 'say'): boolean {
  return node.type === 'presmiumRole' && node.plugin === LECTURE_ID && node.name === name
}

function walk(node: MdastNode, out: Builder): void {
  if (SILENT.has(node.type)) return
  if (node.type === 'presmiumRole') {
    const options = isRecord(node.options) ? node.options : {}
    if (lectureRole(node, 'cue')) {
      out.cue({
        command: (text(options.value) ?? '').trim(),
        ...text(options.to) ? { to: text(options.to) } : {},
        ...options.lines !== undefined && options.lines !== '' ? { lines: String(options.lines) } : {},
        ...text(options.sel) ? { sel: text(options.sel) } : {},
      })
      return
    }
    if (lectureRole(node, 'say')) {
      const shown = (node.children ?? []).map(child => plain(child)).join('') || (text(options.value) ?? '')
      out.append(shown, text(options.alias) ?? shown)
      return
    }
  }
  if (node.type === 'break') {
    out.line()
    return
  }
  if (typeof node.value === 'string' && !node.children) {
    out.append(node.value)
    return
  }
  const block = BLOCKS.has(node.type)
  if (block) out.line()
  for (const child of node.children ?? []) walk(child, out)
  if (block) out.line()
}

function plain(node: MdastNode): string {
  if (SILENT.has(node.type)) return ''
  if (typeof node.value === 'string' && !node.children) return node.value
  return (node.children ?? []).map(plain).join('')
}

export function spokenText(node: MdastNode): SpokenText {
  const out = new Builder()
  walk(node, out)
  return out.done()
}

export function duration(value: string): number | undefined {
  const match = /^(\d+(?:\.\d+)?)\s*(ms|s)?$/.exec(value.trim())
  if (!match) return undefined
  const n = Number(match[1])
  return Math.round(match[2] === 'ms' ? n : n * 1000)
}

export type CueCommand = 'next' | 'spot' | 'hint' | 'point' | 'click' | 'run' | 'ink' | 'pause' | 'mark'

export const CUE_COMMANDS: readonly CueCommand[] = ['next', 'spot', 'hint', 'point', 'click', 'run', 'ink', 'pause', 'mark']

export const TARGETED: ReadonlySet<CueCommand> = new Set(['spot', 'hint', 'point', 'click', 'run', 'ink'])

export function readCue(command: string): { name: CueCommand, arg: string } | { problem: string } {
  const [name = '', ...rest] = command.trim().split(/\s+/)
  const arg = rest.join(' ')
  if (!(CUE_COMMANDS as readonly string[]).includes(name)) return { problem: `unknown cue command "${name}"; the commands are ${CUE_COMMANDS.join(', ')}` }
  if (name === 'pause' && duration(arg) === undefined) return { problem: `pause needs a duration, e.g. "pause 800ms", not "${arg}"` }
  if ((name === 'click' || name === 'mark') && !arg) return { problem: `${name} needs ${name === 'click' ? 'the action of the component, e.g. "click reset"' : 'a name, e.g. "mark 合并"'}` }
  return { name: name as CueCommand, arg }
}
