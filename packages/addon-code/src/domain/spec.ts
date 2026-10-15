import { parseAnchor } from '@presmium/kernel'
import type { AnchorString } from '@presmium/kernel'
import { parse } from 'yaml'

/** The YAML content of a ```` ```coderef ```` block. */
export interface CodeRefSpec {
  anchor: AnchorString
  /** Commit the code is read from; the working tree when absent. */
  pin?: string
  /** Logical unit names (nested `#region`s) highlighted one per step; `all` and `none` as in Slidev. */
  steps?: string[]
  /** Commits shown one per step with Magic Move. */
  variants?: string[]
  /**
   * Click at which the second step or version appears, as Slidev's `at`.
   * Variants default to 1; steps by default follow the slide's earlier clicks.
   */
  at?: number
  /** Highlighting language; the file extension by default. */
  lang?: string
}

export interface CodeRefBlock {
  /** Offsets of the whole fenced block in the Markdown. */
  start: number
  end: number
  /** 0-based line of the opening fence. */
  line: number
  /** Indentation of the opening fence, e.g. inside a list item. */
  indent: string
  body: string
}

const FENCE = /^( *)(`{3,}|~{3,})(.*)$/

/** Top-level ```` ```coderef ```` blocks; blocks nested in other fences (e.g. shown as examples) are skipped. */
export function findCodeRefBlocks(markdown: string): CodeRefBlock[] {
  const blocks: CodeRefBlock[] = []
  const lines = markdown.split('\n')
  let offset = 0
  let open: { fence: string, indent: string, coderef: boolean, start: number, line: number, body: string[] } | undefined
  lines.forEach((text, i) => {
    const lineEnd = offset + text.length
    const m = FENCE.exec(text.replace(/\r$/, ''))
    if (!open && m) {
      open = { fence: m[2]!, indent: m[1]!, coderef: m[3]!.trim() === 'coderef', start: offset, line: i, body: [] }
    }
    // A closing fence repeats the opening character at least as many times and has no info string.
    else if (open && m && m[2]!.startsWith(open.fence) && m[3]!.trim() === '') {
      if (open.coderef) blocks.push({ start: open.start, end: lineEnd, line: open.line, indent: open.indent, body: open.body.join('\n') })
      open = undefined
    }
    else if (open) {
      // Body lines lose up to the fence's indentation, as in CommonMark.
      open.body.push(text.slice(Math.min(open.indent.length, /^ */.exec(text)![0].length)))
    }
    offset = lineEnd + 1
  })
  return blocks
}

/** Indents every non-blank line of `text`, to put a rendered block back where its fence was. */
export function indent(text: string, prefix: string): string {
  return prefix ? text.split('\n').map(line => (line.trim() ? prefix + line : line)).join('\n') : text
}

const KEYS = new Set(['anchor', 'pin', 'steps', 'variants', 'at', 'lang'])

function stringList(value: unknown, key: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every(v => typeof v === 'string' && v.trim() !== '')) {
    throw new Error(`"${key}" must be a non-empty list of names`)
  }
  return value.map(v => v.trim())
}

/** Parses and validates a coderef block body; throws a readable error. */
export function parseCodeRef(body: string): CodeRefSpec {
  let data: unknown
  try {
    // Failsafe schema: every scalar stays a string, so commits like 1234567 are not numbers.
    data = parse(body, { schema: 'failsafe' })
  }
  catch (error) {
    throw new Error(`invalid YAML: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`)
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) throw new Error('expected a YAML mapping with an "anchor"')
  const fields = data as Record<string, unknown>
  const unknown = Object.keys(fields).filter(k => !KEYS.has(k))
  if (unknown.length > 0) throw new Error(`unknown key "${unknown[0]}" (allowed: ${[...KEYS].join(', ')})`)

  const { anchor, pin, steps, variants, at, lang } = fields
  if (typeof anchor !== 'string' || !parseAnchor(anchor.trim())) throw new Error('"anchor" must be scheme:target, e.g. region:src/app.ts#main')
  const spec: CodeRefSpec = { anchor: anchor.trim() as AnchorString }
  for (const [key, value] of Object.entries({ pin, lang })) {
    if (value === undefined) continue
    if (typeof value !== 'string' || value.trim() === '') throw new Error(`"${key}" must be a string`)
    spec[key as 'pin' | 'lang'] = value.trim()
  }
  if (steps !== undefined) spec.steps = stringList(steps, 'steps')
  if (variants !== undefined) {
    spec.variants = stringList(variants, 'variants')
    if (spec.variants.length < 2) throw new Error('"variants" needs at least two commits')
    if (spec.pin || spec.steps) throw new Error('"variants" cannot be combined with "pin" or "steps"')
  }
  if (at !== undefined) {
    if (typeof at !== 'string' || !/^[1-9]\d*$/.test(at.trim())) throw new Error('"at" must be a click number, 1 or more')
    if (!spec.steps && !spec.variants) throw new Error('"at" needs "steps" or "variants"')
    spec.at = Number(at)
  }
  return spec
}
