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
  /** Highlighting language; the file extension by default. */
  lang?: string
}

export interface CodeRefBlock {
  /** Offsets of the whole fenced block in the Markdown. */
  start: number
  end: number
  /** 0-based line of the opening fence. */
  line: number
  body: string
}

const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/

/** Top-level ```` ```coderef ```` blocks; blocks nested in other fences (e.g. shown as examples) are skipped. */
export function findCodeRefBlocks(markdown: string): CodeRefBlock[] {
  const blocks: CodeRefBlock[] = []
  const lines = markdown.split('\n')
  let offset = 0
  let open: { fence: string, coderef: boolean, start: number, line: number, bodyStart: number } | undefined
  lines.forEach((text, i) => {
    const lineEnd = offset + text.length
    const m = FENCE.exec(text.replace(/\r$/, ''))
    if (!open && m) {
      open = { fence: m[1]!, coderef: m[2]!.trim() === 'coderef', start: offset, line: i, bodyStart: lineEnd + 1 }
    }
    // A closing fence repeats the opening character at least as many times and has no info string.
    else if (open && m && m[1]!.startsWith(open.fence) && m[2]!.trim() === '') {
      if (open.coderef) blocks.push({ start: open.start, end: lineEnd, line: open.line, body: markdown.slice(open.bodyStart, Math.max(open.bodyStart, offset - 1)) })
      open = undefined
    }
    offset = lineEnd + 1
  })
  return blocks
}

const KEYS = new Set(['anchor', 'pin', 'steps', 'variants', 'lang'])

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

  const { anchor, pin, steps, variants, lang } = fields
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
  return spec
}
