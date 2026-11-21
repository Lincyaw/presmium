import { generateNKeysBetween } from 'fractional-indexing'
import type { DocumentId, DocumentPlacement } from './contracts/document.ts'

/** `count` ranks in order after `last` (null: the first ranks); a rank that is no fractional index starts over. */
export function ranksAfter(last: string | null, count: number): string[] {
  try { return generateNKeysBetween(last, null, count) } catch { return generateNKeysBetween(null, null, count) }
}

/** `count` ranks between two siblings' ranks (null: open at that end). */
export function ranksBetween(before: string | null, after: string | null, count: number): string[] {
  try { return generateNKeysBetween(before, after, count) } catch { return ranksAfter(before, count) }
}

/** One document as the workspace tree needs it; `path` is the workspace-relative entry file. */
export interface DocumentTreeNode {
  id: DocumentId
  path: string
  title: string
  placement: DocumentPlacement
}

export type DocumentTreeProblem =
  | { code: 'tree.duplicate-id', id: DocumentId, paths: [string, string] }
  | { code: 'tree.unknown-parent', id: DocumentId, path: string, parent: DocumentId }
  | { code: 'tree.cycle', id: DocumentId, path: string }

/** The workspace tree derived from every document's placement; nothing of it is stored. */
export interface DocumentTree {
  /** Depth-first, siblings by rank then ID; the order documents are listed in. */
  order: (DocumentTreeNode & { depth: number, parent: DocumentId | null })[]
  byId: Map<DocumentId, DocumentTreeNode>
  children: Map<DocumentId | null, DocumentId[]>
  /** The document's ancestors, root first, parent last; empty at the top level. */
  ancestors(id: DocumentId): DocumentTreeNode[]
  problems: DocumentTreeProblem[]
}

const byRank = (a: DocumentTreeNode, b: DocumentTreeNode) => a.placement.rank < b.placement.rank ? -1 : a.placement.rank > b.placement.rank ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0

/**
 * Builds the tree. Invalid placements never fail: a document with an unknown parent is shown at the top level, every
 * document of a cycle is shown at the top level, equal ranks are ordered by ID, and of two documents with one ID the
 * first by path is kept.
 */
export function documentTree(documents: readonly DocumentTreeNode[]): DocumentTree {
  const problems: DocumentTreeProblem[] = []
  const byId = new Map<DocumentId, DocumentTreeNode>()
  for (const node of [...documents].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)) {
    const prior = byId.get(node.id)
    if (prior) problems.push({ code: 'tree.duplicate-id', id: node.id, paths: [prior.path, node.path] })
    else byId.set(node.id, node)
  }
  const parent = new Map<DocumentId, DocumentId | null>()
  for (const node of byId.values()) {
    const wanted = node.placement.parent
    if (wanted !== null && !byId.has(wanted)) problems.push({ code: 'tree.unknown-parent', id: node.id, path: node.path, parent: wanted })
    parent.set(node.id, wanted !== null && byId.has(wanted) && wanted !== node.id ? wanted : null)
  }
  for (const node of byId.values()) {
    const seen = new Set<DocumentId>()
    let at: DocumentId | null = node.id
    while (at !== null && !seen.has(at)) { seen.add(at); at = parent.get(at) ?? null }
    if (at === node.id) problems.push({ code: 'tree.cycle', id: node.id, path: node.path })
  }
  for (const problem of problems) if (problem.code === 'tree.cycle') parent.set(problem.id, null)
  const children = new Map<DocumentId | null, DocumentId[]>()
  for (const node of [...byId.values()].sort(byRank)) {
    const key = parent.get(node.id) ?? null
    children.set(key, [...children.get(key) ?? [], node.id])
  }
  const order: DocumentTree['order'] = []
  const walk = (key: DocumentId | null, depth: number) => {
    for (const id of children.get(key) ?? []) { order.push({ ...byId.get(id)!, depth, parent: key }); walk(id, depth + 1) }
  }
  walk(null, 0)
  const ancestors = (id: DocumentId): DocumentTreeNode[] => {
    const chain: DocumentTreeNode[] = []
    for (let at = parent.get(id) ?? null; at !== null; at = parent.get(at) ?? null) chain.unshift(byId.get(at)!)
    return chain
  }
  return { order, byId, children, ancestors, problems }
}
