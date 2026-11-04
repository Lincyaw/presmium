import type { NarrationNode, TeachingDocument } from '@lincyaw/kernel'

// The narration of a document as one Markdown file to polish, and back; lecture.json stays the only source. Each step
// is a heading; under it each narration follows its marker line `<!-- n: <narration> -->` up to the next marker or
// heading. Each line break of a narration starts a new line of the file, and a blank line stands for a blank line
// (`\n\n`; several read back as one).
// A word shown one way and spoken another is `{shown|spoken}`, a cue `⟦cue:<id>⟧`; a backslash before `\`, `{`, `}`,
// `|`, `⟦` or `⟧` keeps that character as text, and a line that would read as a heading or a comment starts with one.

export class ScriptError extends Error {
  readonly code: 'script-duplicate' | 'script-stray' | 'script-unknown' | 'script-missing' | 'script-empty' | 'script-cue-unknown' | 'script-cue-repeated' | 'script-cue-removed' | 'script-node'
  readonly detail: string[]
  readonly line?: number
  constructor(code: ScriptError['code'], detail: string[], line?: number) {
    super(code)
    this.code = code
    this.detail = detail
    if (line !== undefined) this.line = line
  }
}

const MARKER = /^<!-- n: (\S+) -->$/
const HEADING = /^#{1,6}(?:\s|$)/
const COMMENT = /^<!--[\s\S]*-->$/
// An escaped character, a pronunciation (its parts may hold escaped characters) or a cue; anything else is text.
const TOKEN = /\\([\\{}|⟦⟧#<])|\{((?:\\[\s\S]|[^\\{}|])+)\|((?:\\[\s\S]|[^\\{}])+)\}|⟦cue:([^⟧]+)⟧/g

const escaped = (text: string, special: RegExp) => text.replace(special, '\\$&')
const unescaped = (text: string) => text.replace(/\\([\\{}|⟦⟧#<])/g, '$1')

/** A narration's content as the lines of the file: escaped, trimmed, a line that reads as a heading or comment marked. */
export function scriptLines(content: NarrationNode[]): string[] {
  return content.map((node) => {
    if (node.type === 'text') return escaped(node.text, /[\\{}⟦⟧]/g)
    if (node.type === 'pronunciation') return `{${escaped(node.display, /[\\{}|⟦⟧]/g)}|${escaped(node.spoken, /[\\{}|⟦⟧]/g)}}`
    if (node.type === 'cue') return `⟦cue:${node.id}⟧`
    throw new ScriptError('script-node', [(node as { type: string }).type])
  }).join('').split('\n').map(line => line.trim()).map(line => /^(?:#|<!--)/.test(line) ? `\\${line}` : line)
}

/** A narration's lines read back: joined by line breaks, a run of blank lines one blank line, none at either end. */
function linesToText(lines: readonly string[]): string {
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '')
}

/** The narrated steps in reading order, each with the narrations it is the first to say (a shared one is listed once). */
export function narratedSteps(document: TeachingDocument): { section: string, title: string, step: string, stepTitle: string, narrations: string[] }[] {
  const seen = new Set<string>()
  return document.sectionOrder.flatMap(sectionId => {
    const section = document.sections[sectionId]!
    return section.stepOrder.flatMap(stepId => {
      const step = document.steps[stepId]!
      const narrations = step.narrationIds.filter(id => document.narrations[id] && !seen.has(id))
      for (const id of narrations) seen.add(id)
      return narrations.length ? [{ section: sectionId, title: section.title || sectionId, step: stepId, stepTitle: step.title || stepId, narrations }] : []
    })
  })
}

export function exportScript(document: TeachingDocument, instructions: string): { text: string, steps: number, narrations: number } {
  const steps = narratedSteps(document)
  const parts = [`# ${document.metadata.title}`, '', `<!-- ${instructions} -->`, '']
  let page: string | undefined
  for (const step of steps) {
    if (step.section !== page) { parts.push(`## ${step.title}`, ''); page = step.section }
    parts.push(`### ${step.stepTitle}`, '')
    for (const id of step.narrations) {
      parts.push(`<!-- n: ${id} -->`, ...scriptLines(document.narrations[id]!.content), '')
    }
  }
  return { text: parts.join('\n'), steps: steps.length, narrations: steps.reduce((n, step) => n + step.narrations.length, 0) }
}

/** The narration below each marker; text outside a narration (under a heading, before the first marker) is refused. */
export function readScript(text: string): Map<string, { body: string, line: number }> {
  const found = new Map<string, { body: string, line: number }>()
  let current: { id: string, line: number, lines: string[] } | undefined
  const close = () => { if (current) found.set(current.id, { body: linesToText(current.lines), line: current.line }); current = undefined }
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  lines.forEach((raw, index) => {
    const line = raw.trim()
    const marker = MARKER.exec(line)
    if (marker) {
      close()
      if (found.has(marker[1]!)) throw new ScriptError('script-duplicate', [marker[1]!], index + 1)
      current = { id: marker[1]!, line: index + 1, lines: [] }
    } else if (HEADING.test(line)) close()
    else if (COMMENT.test(line)) return
    else if (!line) current?.lines.push(line)
    else if (!current) throw new ScriptError('script-stray', [line.slice(0, 40)], index + 1)
    else current.lines.push(line)
  })
  close()
  return found
}

/** One edited narration back to its content; cues are taken from the narration it came from. */
function contentOf(id: string, text: string, before: NarrationNode[]): NarrationNode[] {
  const cues = new Map(before.flatMap(node => node.type === 'cue' ? [[node.id, node] as const] : []))
  const used = new Set<string>()
  const nodes: NarrationNode[] = []
  const plain = (value: string) => {
    if (!value) return
    const last = nodes.at(-1)
    if (last?.type === 'text') last.text += value
    else nodes.push({ type: 'text', text: value })
  }
  let from = 0
  for (const match of text.matchAll(TOKEN)) {
    plain(text.slice(from, match.index))
    from = match.index + match[0].length
    const [, character, display, spoken, cue] = match
    if (character) plain(character)
    else if (display !== undefined && spoken !== undefined) nodes.push({ type: 'pronunciation', display: unescaped(display), spoken: unescaped(spoken) })
    else if (cue) {
      if (used.has(cue)) throw new ScriptError('script-cue-repeated', [id, cue])
      const known = cues.get(cue)
      if (!known) throw new ScriptError('script-cue-unknown', [id, cue])
      nodes.push(structuredClone(known))
      used.add(cue)
    }
  }
  plain(text.slice(from))
  const removed = [...cues.keys()].filter(cue => !used.has(cue))
  if (removed.length) throw new ScriptError('script-cue-removed', [id, ...removed])
  return nodes
}

/**
 * Applies the file to the document: every narrated step's markers must be there exactly once; only the narrations whose
 * text differs from what an untouched export reads back as are changed. Returns the same document when nothing changed.
 */
export function importScript(document: TeachingDocument, text: string): { document: TeachingDocument, changed: string[] } {
  const found = readScript(text)
  const expected = narratedSteps(document).flatMap(step => step.narrations)
  const unknown = [...found.keys()].filter(id => !expected.includes(id))
  if (unknown.length) throw new ScriptError('script-unknown', unknown, found.get(unknown[0]!)!.line)
  const missing = expected.filter(id => !found.has(id))
  if (missing.length) throw new ScriptError('script-missing', missing)
  const changed: string[] = []
  let narrations = document.narrations
  for (const id of expected) {
    const { body, line } = found.get(id)!
    const before = document.narrations[id]!
    if (linesToText(scriptLines(before.content)) === body) continue
    if (!body) throw new ScriptError('script-empty', [id], line)
    if (narrations === document.narrations) narrations = { ...narrations }
    narrations[id] = { ...before, content: contentOf(id, body, before.content) }
    changed.push(id)
  }
  return { document: changed.length ? { ...document, narrations } : document, changed }
}
