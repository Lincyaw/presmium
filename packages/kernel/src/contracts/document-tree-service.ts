import type { BlockId, DocumentId, SectionId } from './document.ts'
import type { DocumentLinks, DocumentPreview, DocumentSearchHit, DocumentTree, EmbedSource, TreeOperation, TreeOperationResult } from './document-tree.ts'
import type { Member } from './server.ts'

/** The workspace's document tree as the workspace service offers it to MCP and its other in-process clients. */
export interface DocumentTreeService {
  tree(): DocumentTree
  /** Applies one tree operation atomically; `origin` marks the revisions as the author's or an agent's. */
  apply(operation: TreeOperation, member: Member, origin: 'editor' | 'agent'): Promise<TreeOperationResult>
  links(id: DocumentId): DocumentLinks
  search(query: string, limit: number): DocumentSearchHit[]
  preview(id: DocumentId, target: { section?: SectionId, block?: BlockId }): DocumentPreview
  embedSource(document: DocumentId, block: BlockId): EmbedSource
}
