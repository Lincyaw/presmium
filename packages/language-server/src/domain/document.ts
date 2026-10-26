import { isRecord, validateDocument } from '@lincyaw/kernel'
import type { TeachingDocument } from '@lincyaw/kernel'
import { findNodeAtLocation, findNodeAtOffset, getNodePath, getNodeValue, parseTree } from 'jsonc-parser'
import type { JSONPath, Node, ParseError } from 'jsonc-parser'

/** Strict JSON syntax, using parser offsets unchanged even when the entry has a BOM. */
export function readDocument(text: string) {
  const errors: ParseError[] = []
  const tree = parseTree(text.replace(/^\uFEFF/, ' '), errors, { disallowComments: true, allowTrailingComma: false, allowEmptyContent: false })
  const validation = tree && !errors.length ? validateDocument(getNodeValue(tree)) : undefined
  return { tree, errors, validation, document: validation?.document }
}

export function nodeAt(tree: Node, offset: number): { node: Node, path: JSONPath } | undefined {
  const node = findNodeAtOffset(tree, offset, true)
  return node ? { node, path: getNodePath(node) } : undefined
}

/** Missing properties point at the closest existing parent, rather than an invented source line. */
export function nodeAtPointer(tree: Node, pointer: string): Node {
  const path = pointer.replace(/^#/, '').split('/').slice(1).map(key => key.replaceAll('~1', '/').replaceAll('~0', '~'))
  let node = tree
  for (const key of path) {
    const found = findNodeAtLocation(node, [node.type === 'array' ? Number(key) : key])
    if (!found) break
    node = found
  }
  return node
}

function owners(document: TeachingDocument): Map<string, string> {
  const result = new Map<string, string>()
  const rich = (node: unknown, section: string) => {
    if (!isRecord(node)) return
    if (typeof node.id === 'string') result.set(node.id, section)
    if (Array.isArray(node.children)) node.children.forEach(child => rich(child, section))
    if (Array.isArray(node.fallback)) node.fallback.forEach(child => rich(child, section))
  }
  const visit = (id: string, section: string) => {
    result.set(id, section)
    const block = document.blocks[id]!
    if (block.type === 'container' || block.type === 'component') block.children?.forEach(child => visit(child, section))
    if (block.type === 'text') block.content.forEach(node => rich(node, section))
  }
  for (const id of document.sectionOrder) {
    result.set(`page:${id}`, id)
    document.sections[id]!.children.forEach(child => visit(child, id))
  }
  return result
}

/** Entity ownership determines the page even if normalized maps are reordered or minified. */
export function sectionAtPath(document: TeachingDocument, path: JSONPath): string | undefined {
  const [map, id, field, key] = path
  const owner = owners(document)
  const narration = (id: string) => document.sectionOrder.find(section => document.sections[section]!.stepOrder.some(step => document.steps[step]!.narrationIds.includes(id)))
  const usedBlock = (predicate: (block: TeachingDocument['blocks'][string]) => boolean) => Object.values(document.blocks).find(predicate)?.id
  if (map === 'sections' && typeof id === 'string') return document.sections[id]?.id
  if (map === 'sectionOrder' && typeof id === 'number') return document.sectionOrder[id]
  if (map === 'blocks' && typeof id === 'string') return owner.get(id)
  if (map === 'steps' && typeof id === 'string') return document.steps[id]?.sectionId
  if (map === 'narrations' && typeof id === 'string') return narration(id)
  if (map === 'definitions' && typeof id === 'string') return owner.get(usedBlock(block => block.type === 'component' && block.definitionId === id) ?? '')
  if (map === 'assets' && typeof id === 'string') return owner.get(usedBlock(block => block.type === 'image' && block.assetId === id) ?? '')
  if (map === 'production') {
    if (id === 'sectionOverrides' && typeof field === 'string') return document.sections[field]?.id
    if (id === 'stepOverrides' && typeof field === 'string') return document.steps[field]?.sectionId
    if (id === 'narrationOverrides' && typeof field === 'string') return narration(field)
    if (id === 'cueTimings' && typeof field === 'string') {
      const owner = Object.values(document.narrations).find(value => value.content.some(node => node.type === 'cue' && node.id === field))
      return owner && narration(owner.id)
    }
    if (id === 'mediaClips' && typeof field === 'number') return document.steps[document.production.mediaClips[field]?.attachment.stepId ?? '']?.sectionId
  }
  if (map === 'comments' && typeof id === 'string') return owner.get(document.comments?.[id]?.anchor?.[key === 'to' ? 'to' : 'from'].blockId ?? '')
  return map === 'metadata' || !path.length ? document.sectionOrder[0] : undefined
}

export function entityReference(document: TeachingDocument, path: JSONPath, value: unknown): JSONPath | undefined {
  if (typeof value !== 'string') return undefined
  const [root, , field] = path, last = path.at(-1)
  const child = path.length === 4 && field === 'children' && (root === 'sections' || root === 'blocks')
  const visual = root === 'steps' && field === 'visuals' && path.length === 5 && last === 'blockId'
  const cue = root === 'narrations' && field === 'content' && path.length === 6 && path.at(-2) === 'target' && last === 'blockId'
  const asset = last === 'assetId' && (root === 'blocks' && path.length === 3 || root === 'production' && (path.at(-2) === 'voiceSource' || path[1] === 'mediaClips' && path.length === 4))
  const map = root === 'sectionOrder' && path.length === 2 || root === 'steps' && field === 'sectionId' && path.length === 3 ? 'sections'
    : root === 'blocks' && field === 'definitionId' && path.length === 3 ? 'definitions'
    : asset ? 'assets' : child || visual || cue ? 'blocks'
    : root === 'sections' && field === 'stepOrder' && path.length === 4 || root === 'steps' && field === 'inherits' && path.length === 3 || root === 'production' && path[1] === 'mediaClips' && path.at(-2) === 'attachment' && last === 'stepId' ? 'steps'
    : root === 'steps' && field === 'narrationIds' && path.length === 4 ? 'narrations' : undefined
  return map && Object.hasOwn(document[map], value) ? [map, value] : undefined
}
