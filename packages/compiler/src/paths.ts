/**
 * Paths in what the renderers publish (docs/architecture.md 4.2): an output
 * names no path of the machine it was built on, so the same deck builds to
 * the same bytes wherever it is checked out; local files a block names are
 * published with the output under a name that holds their content hash.
 */
import { existsSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { irBlocks } from '@presmium/kernel'
import type { IRDocument, SourcePos } from '@presmium/kernel'
import { fileHash } from './published.ts'

/** URLs that name no local file: a scheme, protocol-relative, or a fragment. */
const REMOTE = /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i

function inRepository(path: string, root: string): boolean {
  if (!isAbsolute(path)) return false
  const rel = relative(root, path)
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

/** `path` relative to the directory `from`, with `/` separators; `.` for `from` itself. */
function relativePath(from: string, path: string): string {
  return relative(from, path).split(sep).join('/') || '.'
}

/** A value whose absolute paths in the repository `root` are made relative to `from`; other values stay. */
export function portable(value: unknown, from: string, root: string): unknown {
  if (typeof value === 'string') return inRepository(value, root) ? relativePath(from, value) : value
  if (Array.isArray(value)) return value.map(item => portable(item, from, root))
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, portable(item, from, root)]))
  return value
}

/**
 * The IR as an output publishes it (`<out>/ir.json`): source positions
 * relative to the deck directory, and the paths of the plugins' configuration
 * in the repository relative to the deck too. `presmium ir` and `presmium
 * dev` keep the absolute paths, which editors open.
 */
export function relativeIR(doc: IRDocument, deckDir: string, workspaceRoot: string): IRDocument {
  const copy = structuredClone(doc)
  const source = (pos: SourcePos) => {
    if (isAbsolute(pos.file)) pos.file = relativePath(deckDir, pos.file)
  }
  if (isAbsolute(copy.meta.entry)) copy.meta.entry = relativePath(deckDir, copy.meta.entry)
  copy.config.presmium = portable(copy.config.presmium, deckDir, workspaceRoot) as IRDocument['config']['presmium']
  for (const section of copy.sections) {
    source(section.source)
    if (section.config) section.config = portable(section.config, deckDir, workspaceRoot) as typeof section.config
    for (const block of irBlocks(section.blocks)) source(block.source)
  }
  for (const finding of copy.diagnostics) {
    if (finding.source) source(finding.source as SourcePos)
  }
  return copy
}

/**
 * The local file a URL of a block names (`RenderContext.localAsset`):
 * relative to the block's source file, or `/...` in the deck's `public/`.
 */
export function localAsset(deckDir: string, source: SourcePos, url: string): { file: string, name: string } | undefined {
  if (REMOTE.test(url)) return undefined
  const path = url.replace(/[?#].*$/s, '')
  if (!path) return undefined
  let name = path
  try {
    name = decodeURIComponent(path)
  } catch {
    // A malformed escape: the URL is read as it is written.
  }
  const file = name.startsWith('/') ? join(deckDir, 'public', name) : resolve(dirname(source.file), name)
  if (!existsSync(file) || !statSync(file).isFile()) return undefined
  return { file, name: `${fileHash(file).slice(0, 8)}-${basename(file)}` }
}
