import { parseAnchor } from '@lincyaw/kernel'
import type { AnchorString } from '@lincyaw/kernel'
import { CodeRefError } from './messages.ts'

export interface CodeRefSpec {
  anchor: AnchorString
  pin?: string
  steps?: string[]
  variants?: string[]
  lang?: string
  repo?: string
}

function optionalString(value: unknown, key: string): string | undefined {
  if (value === undefined) return undefined
  const text = String(value).trim()
  if (text === '') throw new CodeRefError({ code: 'empty-option', option: key })
  return text
}

function names(value: unknown, key: string): string[] | undefined {
  if (value === undefined) return undefined
  const list = (Array.isArray(value) ? value : [value]).map(v => String(v).trim()).filter(Boolean)
  if (list.length === 0) throw new CodeRefError({ code: 'empty-list', option: key })
  return list
}

export function parseCodeRef(arg: string | undefined, options: Record<string, unknown>): CodeRefSpec {
  const anchor = arg?.trim() ?? ''
  if (!parseAnchor(anchor)) throw new CodeRefError({ code: 'anchor' })
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
    if (variants.length < 2) throw new CodeRefError({ code: 'variants-count' })
    if (pin || steps) throw new CodeRefError({ code: 'variants-combined' })
    spec.variants = variants
  }
  return spec
}
