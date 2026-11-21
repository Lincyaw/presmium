/**
 * The workspace's document tree, references and synced blocks as the workspace service exposes them.
 * Shared by the workspace service (server), the workbench (client), MCP tools and the compiler.
 * Lives at packages/kernel/src/contracts/document-tree.ts and is re-exported from packages/kernel/src/contracts.ts.
 */
import type { BlockId, DocumentBlock, DocumentId, ReferenceTarget, SectionId } from './document.ts'

export type TreeIssueCode = 'tree.unknown-parent' | 'tree.cycle' | 'tree.duplicate-id'
export interface TreeIssue { code: TreeIssueCode, message: string }

/** One document in the tree. `path` is the document folder relative to the workspace root. */
export interface TreeNode {
  id: DocumentId
  title: string
  path: string
  parent: DocumentId | null
  rank: string
  depth: number
  children: DocumentId[]
  issues?: TreeIssue[]
}

export interface TrashEntry { id: DocumentId, title: string, deletedAt: string, from: string, parent: DocumentId | null, children: DocumentId[] }

/** `roots` and every `children` list are already in display order (rank, then id). */
export interface DocumentTree { roots: DocumentId[], nodes: Record<DocumentId, TreeNode>, trash: TrashEntry[] }

/** A place that cites a document: an inline reference or a synced block in another (or the same) document. */
export interface Citation {
  kind: 'reference' | 'embed'
  document: DocumentId
  title: string
  section?: SectionId
  block: BlockId
  /** The sentence around the reference, or the synced block's first text; plain text, at most ~120 characters. */
  excerpt: string
}

export interface OutgoingLink { kind: 'reference' | 'embed', target: ReferenceTarget, title: string, missing: boolean, trashed?: boolean }

export interface DocumentLinks { document: DocumentId, incoming: Citation[], outgoing: OutgoingLink[] }

export interface DocumentSearchHit {
  id: DocumentId
  title: string
  /** Titles of the ancestors, root first, for the breadcrumb that tells same-named documents apart. */
  ancestors: string[]
  match: 'title' | 'content'
  /** For content matches: the matching sentence. */
  excerpt?: string
  /** When the query matched a page title or a block inside the document. */
  section?: SectionId
  block?: BlockId
}

export interface DocumentPreview {
  id: DocumentId
  title: string
  ancestors: string[]
  /** The first paragraph of the target (document, page or block), plain text. */
  excerpt: string
  pages: number
  steps: number
  citedBy: number
  trashed?: boolean
  missing?: boolean
}

/** A synced block's source for read-only display in the editor: the source block and its content subtree. */
export interface EmbedSource {
  document: DocumentId
  title: string
  block: BlockId
  /** The source block and every block below it, keyed by id. Missing when the source no longer exists. */
  blocks?: Record<BlockId, DocumentBlock>
  /** Asset URLs the client can load directly (already resolved for the source document). */
  assets?: Record<string, string>
  /** Named states of the source block when it is a component, in declaration order. */
  states?: string[]
  missing?: boolean
  trashed?: boolean
}

export type TreeOperation =
  | { type: 'create', title: string, parent: DocumentId | null, after?: DocumentId | null }
  | { type: 'move', id: DocumentId, parent: DocumentId | null, after?: DocumentId | null }
  | { type: 'rename', id: DocumentId, title: string }
  | { type: 'duplicate', id: DocumentId }
  | { type: 'trash', id: DocumentId }
  | { type: 'restore', id: DocumentId }
  | { type: 'purge', id: DocumentId }
  | { type: 'embed-to-copy', document: DocumentId, block: BlockId }
// `after`: the sibling to place after; null or absent = first among the parent's children.

export interface TreeOperationResult {
  tree: DocumentTree
  /** Set by create and duplicate. */
  created?: DocumentId
  /** One revision per touched document. */
  revisions: { document: DocumentId, revision: string }[]
  /** Set by purge: synced blocks that were converted to copies first. */
  converted?: { document: DocumentId, block: BlockId }[]
}

/**
 * Workspace service routes (same route table and conventions as the existing workspace routes in
 * packages/workspace/src/node/routes.ts; JSON bodies; errors as problem responses with stable codes):
 *
 *   GET  tree                                    → DocumentTree
 *   POST tree/operation      body TreeOperation  → TreeOperationResult
 *   GET  document/links      ?id=<DocumentId>    → DocumentLinks
 *   GET  documents/search    ?q=<text>&limit=20  → DocumentSearchHit[]
 *   GET  document/preview    ?id=&section=&block= → DocumentPreview
 *   GET  embed/source        ?document=&block=   → EmbedSource
 *
 * Tree changes are also pushed on the existing workspace change event stream as { type: 'tree' } so open clients refetch.
 * Error codes: tree.not-found, tree.cycle (moving under its own descendant), tree.trash-not-found, tree.title-empty.
 */
