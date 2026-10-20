import { existsSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { irBlocks } from '@lincyaw/kernel'
import type { IRDocument, SourcePos } from '@lincyaw/kernel'
import { fileHash } from './published.ts'

const REMOTE = /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i

function inRepository(path: string, root: string): boolean {
  if (!isAbsolute(path)) return false
  const rel = relative(root, path)
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

function relativePath(from: string, path: string): string {
  return relative(from, path).split(sep).join('/') || '.'
}

export function portable(value: unknown, from: string, root: string): unknown {
  if (typeof value === 'string') return inRepository(value, root) ? relativePath(from, value) : value
  if (Array.isArray(value)) return value.map(item => portable(item, from, root))
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, portable(item, from, root)]))
  return value
}

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

export function localAsset(deckDir: string, source: SourcePos, url: string): { file: string, name: string } | undefined {
  if (REMOTE.test(url)) return undefined
  const path = url.replace(/[?#].*$/s, '')
  if (!path) return undefined
  let name = path
  try {
    name = decodeURIComponent(path)
  } catch {
  }
  const file = name.startsWith('/') ? join(deckDir, 'public', name) : resolve(dirname(source.file), name)
  if (!existsSync(file) || !statSync(file).isFile()) return undefined
  return { file, name: `${fileHash(file).slice(0, 8)}-${basename(file)}` }
}
