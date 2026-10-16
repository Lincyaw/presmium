/**
 * A separate lecture script (`renderers.lecture.script`, docs/ir.md 2.9):
 * a MyST file of narration whose sections carry the labels of the deck's
 * sections (`(merge)=` before a heading). Its paragraphs (and lists and
 * quotes) are the steps' narration of those sections, read with the same
 * inline roles: `{cue …}` and `{say …}`. It is read as CommonMark, the
 * roles found as their text followed by the content in backticks.
 */
import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join, relative } from 'node:path'
import type { Finding, MdastNode, SourcePos } from '@presmium/kernel'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { LECTURE_ID } from '../domain/index.ts'
import type { ScriptSections } from '../domain/index.ts'

/** Blocks that are narration in a script. */
const NARRATION = new Set(['paragraph', 'list', 'blockquote'])

/** `{cue to=code-1 lines=3-5}` or `{say alias="B P E"}` at the end of a text, before the content in backticks. */
const ROLE = /\{(cue|say)((?:\s+[\w-]+=(?:"[^"]*"|'[^']*'|[^\s"'}]+))*)\s*\}$/

function options(text: string): Record<string, string> {
  return Object.fromEntries([...text.matchAll(/([\w-]+)=(?:"([^"]*)"|'([^']*)'|([^\s"'}]+))/g)].map(m => [m[1]!, m[2] ?? m[3] ?? m[4] ?? '']))
}

/** The roles of a list of inline nodes, as the compiler keeps them (`presmiumRole`). */
function roles(children: MdastNode[]): MdastNode[] {
  const out: MdastNode[] = []
  for (const child of children) {
    const previous = out.at(-1)
    const match = child.type === 'inlineCode' && previous?.type === 'text' && typeof previous.value === 'string' ? ROLE.exec(previous.value) : null
    if (match) {
      const before = previous!.value!.slice(0, match.index)
      if (before) previous!.value = before
      else out.pop()
      const value = String(child.value ?? '')
      out.push({ type: 'presmiumRole', plugin: LECTURE_ID, name: match[1], options: { ...options(match[2] ?? ''), value }, children: match[1] === 'say' ? [{ type: 'text', value }] : [] })
      continue
    }
    out.push(child.children ? { ...child, children: roles(child.children) } : child)
  }
  return out
}

function line(node: MdastNode): number {
  const position = node.position as { start?: { line?: number } } | undefined
  return position?.start?.line ?? 1
}

function plain(node: MdastNode): string {
  return typeof node.value === 'string' ? node.value : (node.children ?? []).map(plain).join('')
}

/** A frontmatter block at the start, which CommonMark would read as text, as blank lines (the lines keep their numbers). */
function withoutFrontmatter(text: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(text)
  return match ? match[0].replace(/[^\n]/g, '') + text.slice(match[0].length) : text
}

/** The script's narration by section label; problems as findings (the file missing, sections without a label). */
export function readScript(deckDir: string, path: string): { sections: ScriptSections, file: string, findings: Finding[] } {
  const file = isAbsolute(path) ? path : join(deckDir, path)
  const findings: Finding[] = []
  const sections: ScriptSections = new Map()
  if (relative(deckDir, file).startsWith('..') || !existsSync(file)) {
    findings.push({ checkId: LECTURE_ID, severity: 'error', message: `renderers.lecture.script: ${path} is not a file of the deck` })
    return { sections, file, findings }
  }
  const tree = fromMarkdown(withoutFrontmatter(readFileSync(file, 'utf8'))) as unknown as MdastNode
  let label: string | undefined
  let current: { paragraphs: MdastNode[], source?: SourcePos } | undefined
  for (const node of tree.children ?? []) {
    const text = node.type === 'paragraph' ? plain(node).trim() : ''
    const target = /^\(([^()\s]+)\)=$/.exec(text)
    if (target) {
      label = target[1]
      continue
    }
    if (node.type === 'heading') {
      current = undefined
      if (label) {
        current = { paragraphs: [], source: { file, line: line(node) } }
        sections.set(label, [...sections.get(label) ?? [], current])
      } else {
        findings.push({ checkId: LECTURE_ID, severity: 'warning', message: `the lecture script's section "${plain(node)}" has no label (as "(merge)=" before it), so it replaces no section's narration`, source: { file, line: line(node) } })
      }
      label = undefined
      continue
    }
    if (current && NARRATION.has(node.type)) current.paragraphs.push({ ...node, children: roles(node.children ?? []) })
  }
  return { sections, file, findings }
}
