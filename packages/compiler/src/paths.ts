import { isAbsolute, relative, sep } from 'node:path'
import { irBlocks } from '@lincyaw/kernel'
import type { IRDocument, SourcePos } from '@lincyaw/kernel'
import { isInside } from '@lincyaw/kernel/node'

export const DECK_ENTRY = 'lecture.md'

/** The deck's directory of generated files: renderer work directories, staged files, caches. */
export const WORK_DIR = '.presmium'

function relativePath(from: string, path: string): string {
  return relative(from, path).split(sep).join('/') || '.'
}

export function portable(value: unknown, from: string, root: string): unknown {
  if (typeof value === 'string') return isAbsolute(value) && isInside(value, root) ? relativePath(from, value) : value
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
    for (const block of irBlocks(section.blocks)) {
      source(block.source)
      if (block.node.type === 'component' && block.node.definition && isAbsolute(block.node.definition.file))
        block.node.definition.file = relativePath(deckDir, block.node.definition.file)
    }
  }
  for (const finding of copy.diagnostics) {
    if (finding.source) source(finding.source as SourcePos)
  }
  return copy
}
