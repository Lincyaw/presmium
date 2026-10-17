/**
 * Narration as it is spoken (docs/ir.md 2.8, 2.9): the text of a paragraph
 * of narration, with the inline roles of the lecture plugin read out. A
 * `{cue}` is a mark at a place of the text; a `{say}` shows its content and
 * is spoken as its `alias`, so the text to synthesize differs from the text
 * shown there (`spans`). Whitespace is collapsed; a line break between two
 * CJK characters is no space.
 */
import { isRecord } from '@presmium/kernel'
import type { MdastNode, WordSpan } from '@presmium/kernel'
import { LECTURE_ID } from './track.ts'
import { isCjk } from './words.ts'

/** A `{cue}` in a text: its command and options, at a place of the shown text (UTF-16 offset). */
export interface CueMark {
  offset: number
  /** The role's content, e.g. `spot` or `pause 800ms`. */
  command: string
  to?: string
  lines?: string
  sel?: string
}

export interface SpokenText {
  /** The text as shown (captions, the transcript). */
  text: string
  /** The text as spoken: `{say}` aliases in place of what they show. */
  spoken: string
  spans: WordSpan[]
  cues: CueMark[]
}

/** Nodes whose text is not spoken. */
const SILENT = new Set(['image', 'imageReference', 'html', 'footnoteReference', 'definition', 'footnoteDefinition', 'comment', 'mystComment', 'target', 'mystTarget'])

const BLOCKS = new Set(['paragraph', 'listItem', 'heading', 'blockquote', 'tableCell', 'tableRow'])

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined
}

/** Builds the shown and the spoken text side by side. */
class Builder {
  text = ''
  spoken = ''
  readonly spans: WordSpan[] = []
  readonly cues: CueMark[] = []
  private pending: 'space' | 'line' | undefined

  /** Appends text to both, or `shown` to the shown text and `spoken` to the spoken one. */
  append(shown: string, spoken = shown): void {
    if (shown === spoken) {
      for (const char of shown) this.char(char, char)
      return
    }
    // A replacement: its whitespace is collapsed apart, and it is one span.
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

  /** A break between blocks or lines. */
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

  /** Writes the whitespace before `next`: none between CJK characters (written without spaces; authors put some around roles). */
  private flush(next: string): void {
    const pending = this.pending
    this.pending = undefined
    if (!pending || !this.text) return
    if (wide(this.text.at(-1)!) && (wide(next) || !next)) return
    this.text += ' '
    this.spoken += ' '
  }
}

/** CJK characters and the punctuation and full-width forms used with them. */
function wide(char: string): boolean {
  return isCjk(char) || /[　-〿＀-￯]/u.test(char)
}

function collapse(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

/** Whether a node is a role of the lecture plugin, by name. */
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

/** The plain text of a node, as shown. */
function plain(node: MdastNode): string {
  if (SILENT.has(node.type)) return ''
  if (typeof node.value === 'string' && !node.children) return node.value
  return (node.children ?? []).map(plain).join('')
}

/** A paragraph (or list, quote …) of narration as shown and as spoken, with its cues. */
export function spokenText(node: MdastNode): SpokenText {
  const out = new Builder()
  walk(node, out)
  return out.done()
}

/** The text of a `pause` cue as ms: `800ms`, `1.5s`, `2` (seconds); undefined when it is no duration. */
export function duration(value: string): number | undefined {
  const match = /^(\d+(?:\.\d+)?)\s*(ms|s)?$/.exec(value.trim())
  if (!match) return undefined
  const n = Number(match[1])
  return Math.round(match[2] === 'ms' ? n : n * 1000)
}

export type CueCommand = 'next' | 'spot' | 'hint' | 'point' | 'click' | 'run' | 'ink' | 'pause' | 'mark'

export const CUE_COMMANDS: readonly CueCommand[] = ['next', 'spot', 'hint', 'point', 'click', 'run', 'ink', 'pause', 'mark']

/** Commands that act on a block. */
export const TARGETED: ReadonlySet<CueCommand> = new Set(['spot', 'hint', 'point', 'click', 'run', 'ink'])

/** A cue's command read: its name and argument (`click <action>`, `pause <duration>`, `mark <name>`), or why it is none. */
export function readCue(command: string): { name: CueCommand, arg: string } | { problem: string } {
  const [name = '', ...rest] = command.trim().split(/\s+/)
  const arg = rest.join(' ')
  if (!(CUE_COMMANDS as readonly string[]).includes(name)) return { problem: `unknown cue command "${name}"; the commands are ${CUE_COMMANDS.join(', ')}` }
  if (name === 'pause' && duration(arg) === undefined) return { problem: `pause needs a duration, e.g. "pause 800ms", not "${arg}"` }
  if ((name === 'click' || name === 'mark') && !arg) return { problem: `${name} needs ${name === 'click' ? 'the action of the component, e.g. "click reset"' : 'a name, e.g. "mark 合并"'}` }
  return { name: name as CueCommand, arg }
}
