import { irBlocks } from '@lincyaw/kernel'
import type { IRDocument, PreviewSource, SourceAnswer } from '@lincyaw/kernel'

export interface BlockSourceTarget {
  part: 'definition' | 'block'
  path: string
  language: string
  shared: number
  range?: { line: number, endLine: number }
}

/** A source read is a versioned snapshot; a later save never derives ranges from stale IR. */
export interface BlockSourceDraft {
  section: string
  block: string
  target: BlockSourceTarget
  source: SourceAnswer
  content: string
}

export function blockSourceTarget(document: IRDocument, section: string, id: string, part?: 'definition' | 'block'): BlockSourceTarget {
  const page = document.sections.find(page => page.id === section)
  const block = page && [...irBlocks(page.blocks)].find(block => block.id === id)
  if (!block) throw new Error('source-unknown')
  const definition = block.node.type === 'component' ? block.node.definition : undefined
  if (definition && part !== 'block') return {
    part: 'definition',
    path: definition.file,
    language: definition.language,
    shared: document.sections.reduce((count, page) => count + [...irBlocks(page.blocks)].filter(block => block.node.type === 'component' && block.node.definition?.file === definition.file).length, 0),
  }
  return {
    part: 'block',
    path: block.source.file,
    language: 'markdown',
    shared: 1,
    range: { line: block.source.line, endLine: block.source.endLine ?? block.source.line },
  }
}

export function readBlockSource(document: IRDocument, section: string, block: string, source: SourceAnswer, part?: 'definition' | 'block', previous?: BlockSourceDraft): BlockSourceDraft {
  const target = blockSourceTarget(document, section, block, part)
  if (target.path !== source.path) throw new Error('source-changed')
  // The compiler may retain its last valid IR while the author repairs a syntax error.
  // The acknowledged source version gives the editor a newer, exact fragment range.
  if (previous?.source.version === source.version && previous.target.path === target.path && previous.target.part === target.part)
    return { ...previous, target: { ...previous.target, shared: target.shared, language: target.language } }
  const content = target.range
    ? source.content.split('\n').slice(target.range.line - 1, target.range.endLine).join('\n')
    : source.content
  if (content.length > 200_000) throw new Error('source-large')
  return { section, block, target, source, content }
}

export function previewBlockSource(draft: BlockSourceDraft): PreviewSource {
  return { part: draft.target.part, path: draft.source.path, language: draft.target.language, content: draft.content, version: draft.source.version, shared: draft.target.shared }
}

/** Only the IR-bound source opened by this editor may be saved. The file route checks its version again. */
export function writeBlockSource(document: IRDocument, draft: BlockSourceDraft, path: string, version: string, content: string): string {
  const target = blockSourceTarget(document, draft.section, draft.block, draft.target.part)
  if (path !== draft.source.path || path !== target.path || Boolean(target.range) !== Boolean(draft.target.range) || version !== draft.source.version) throw new Error('source-changed')
  if (content.length > 200_000) throw new Error('source-large')
  if (!draft.target.range) return content
  const { line, endLine } = draft.target.range
  const lines = draft.source.content.split('\n')
  lines.splice(line - 1, endLine - line + 1, ...content.split('\n'))
  return lines.join('\n')
}

export function savedBlockSource(draft: BlockSourceDraft, fileContent: string, content: string, version: string): BlockSourceDraft {
  return {
    ...draft,
    source: { ...draft.source, content: fileContent, version },
    target: { ...draft.target, ...draft.target.range ? { range: { line: draft.target.range.line, endLine: draft.target.range.line + content.split('\n').length - 1 } } : {} },
    content,
  }
}
