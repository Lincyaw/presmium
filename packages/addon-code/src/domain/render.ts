import type { PresentationMode } from '@presmium/kernel'
import type { Snippet } from './regions.ts'

/** Props of `<PmCodeRef>`: everything is resolved at build time. */
export interface CodeRefView {
  anchor: string
  /** Workspace-relative path. */
  file?: string
  /** Line range in the file, e.g. `12-20`. */
  lines?: string
  /** Full hash of the commit the code was read from. */
  commit?: string
  pinned?: boolean
  /** Permalink; absent when no remote repository is known. */
  href?: string
  /** For pinned code: whether the working tree still has the same code. */
  drift?: 'synced' | 'drifted'
  error?: string
  variants?: VariantView[]
}

export interface VariantView {
  commit: string
  lines: string
  href?: string
}

export interface CodeVersion {
  code: string
  /** Slidev line highlight sequence, e.g. `2-3|4-5|6`. */
  highlight?: string
  /** Shown as the tab title where versions become tabs. */
  label: string
}

const SLIDEV_RANGES = new Set(['all', 'none'])

/** Converts logical unit names into a Slidev click sequence of line ranges (P-15). */
export function highlightSteps(steps: string[], units: Snippet['units']): string {
  return steps.map((step) => {
    const unit = units.get(step)
    if (unit) return unit.from === unit.to ? `${unit.from}` : `${unit.from}-${unit.to}`
    if (SLIDEV_RANGES.has(step)) return step
    const known = [...units.keys()].join(', ') || 'none'
    throw new Error(`step "${step}" is not a #region inside the referenced code (regions: ${known})`)
  }).join('|')
}

export function lineRange(start: number, end: number): string {
  return end > start ? `${start}-${end}` : `${start}`
}

function escapeAttr(value: string): string {
  return value.replace(/\s+/g, ' ').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function attributes(view: CodeRefView): string {
  const { variants, pinned, ...strings } = view
  const parts = Object.entries(strings)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([name, value]) => ` ${name}="${escapeAttr(value)}"`)
  if (pinned) parts.push(' pinned')
  if (variants) parts.push(` variants="${escapeAttr(JSON.stringify(variants))}"`)
  return parts.join('')
}

/** A backtick fence longer than any backtick run inside `code`. */
function fence(code: string, minimum = 3): string {
  const longest = Math.max(0, ...(code.match(/`+/g) ?? []).map(run => run.length))
  return '`'.repeat(Math.max(minimum, longest + 1))
}

function codeBlock(lang: string, version: CodeVersion, meta = ''): string {
  const f = fence(version.code)
  return `${f}${lang}${meta}\n${version.code}\n${f}`
}

/**
 * Markdown for one code reference: `<PmCodeRef>` around a standard code block.
 * Slides get Slidev's click-driven line highlighting, and Magic Move for
 * several versions; documents get plain blocks, and a VitePress code group for
 * several versions.
 */
export function renderCodeRef(view: CodeRefView, lang: string, versions: CodeVersion[], mode: PresentationMode): string {
  const open = `<PmCodeRef${attributes(view)}>`
  if (view.error || versions.length === 0) return `${open}</PmCodeRef>`
  let body: string
  if (versions.length === 1) {
    const [version] = versions as [CodeVersion]
    body = codeBlock(lang, version, mode === 'slides' && version.highlight ? ` {${version.highlight}}` : '')
  }
  else if (mode === 'slides') {
    const blocks = versions.map(v => codeBlock(lang, v))
    const outer = fence(blocks.join('\n'), 4)
    body = `${outer}md magic-move\n${blocks.join('\n')}\n${outer}`
  }
  else {
    body = `::: code-group\n\n${versions.map(v => codeBlock(lang, v, ` [${v.label}]`)).join('\n\n')}\n\n:::`
  }
  return `${open}\n\n${body}\n\n</PmCodeRef>`
}
