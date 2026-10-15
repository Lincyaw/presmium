import { parseAnchor } from '@presmium/kernel'
import type { AnchorString } from '@presmium/kernel'

/** What a `{code-ref}` directive asks for: its argument and options. */
export interface CodeRefSpec {
  anchor: AnchorString
  /** Commit the code is read from; the working tree when absent. */
  pin?: string
  /** Logical unit names (nested `#region`s) highlighted one per step; `all` and `none` highlight nothing in particular. */
  steps?: string[]
  /** Commits shown one per step. */
  variants?: string[]
  /** Highlighting language; the file extension by default. */
  lang?: string
  /** Web URL of the repository for permalinks; overrides `presmium.code.repo` and the `origin` remote. */
  repo?: string
}

function optionalString(value: unknown, key: string): string | undefined {
  if (value === undefined) return undefined
  const text = String(value).trim()
  if (text === '') throw new Error(`:${key}: needs a value`)
  return text
}

function names(value: unknown, key: string): string[] | undefined {
  if (value === undefined) return undefined
  const list = (Array.isArray(value) ? value : [value]).map(v => String(v).trim()).filter(Boolean)
  if (list.length === 0) throw new Error(`:${key}: needs a list of names`)
  return list
}

/**
 * Validates the argument and options of a `{code-ref}` directive, as typed by
 * the compiler (`steps` and `variants` are lists); throws a readable error.
 */
export function parseCodeRef(arg: string | undefined, options: Record<string, unknown>): CodeRefSpec {
  const anchor = arg?.trim() ?? ''
  if (!parseAnchor(anchor)) throw new Error('the argument must be an anchor scheme:target, e.g. region:src/app.ts#main')
  const spec: CodeRefSpec = { anchor: anchor as AnchorString }
  const pin = optionalString(options.pin, 'pin')
  const lang = optionalString(options.lang, 'lang')
  const repo = optionalString(options.repo, 'repo')
  const steps = names(options.steps, 'steps')
  const variants = names(options.variants, 'variants')
  if (pin) spec.pin = pin
  if (lang) spec.lang = lang
  if (repo) spec.repo = repo
  if (steps) spec.steps = steps
  if (variants) {
    if (variants.length < 2) throw new Error(':variants: needs at least two commits')
    if (pin || steps) throw new Error(':variants: cannot be combined with :pin: or :steps:')
    spec.variants = variants
  }
  return spec
}
