import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { workspaceDocuments } from '@lincyaw/compiler'
import { blockSubtree, DOCUMENT_ENTRY, documentCitationSites, documentSearchText, isRecord, matchingSentence, referenceTargetTitle, targetExcerpt, withReferenceFallbacks } from '@lincyaw/kernel'
import type { BlockId, DocumentCitation, DocumentId, DocumentLinks, DocumentPreview, DocumentSearchHit, DocumentTree, EmbedSource, OutgoingLink, PresmiumDocument, ReferenceNode, ReferenceTarget, SectionId, TrashEntry, TreeIssue, TreeNode } from '@lincyaw/kernel'
import type { DocumentCitationSite } from '@lincyaw/kernel'
import type { WorkspaceConfig } from './config.ts'

/** The workspace folder trashed documents are moved to, one folder per document ID. */
export const TRASH_DIR = '.trash'
/** The record beside a trashed document: where it came from and where it sat in the tree. */
export const TRASH_RECORD = 'trashed.json'

export interface TrashRecord {
  deletedAt: string
  /** The document folder it was trashed from, relative to the workspace root. */
  from: string
  parent: DocumentId | null
  rank: string
  /** The documents trashed with it, its descendants at the time. */
  children: DocumentId[]
  /** Set on a descendant: the document whose trashing took it along. */
  with?: DocumentId
}

/** One document the index knows: its folder, the parsed document and what is derived from it. */
export interface IndexedDocument {
  id: DocumentId
  dir: string
  document: PresmiumDocument
  sites: DocumentCitationSite[]
  search: ReturnType<typeof documentSearchText>
}

export interface TrashedDocument extends IndexedDocument { record: TrashRecord }

interface Cached { mtimeMs: number, size: number, value: IndexedDocument | undefined }

const dirOf = (entry: string) => entry.split('/').slice(0, -1).join('/')

function parse(file: string, dir: string): IndexedDocument | undefined {
  let value: unknown
  try { value = JSON.parse(readFileSync(file, 'utf8').replace(/^﻿/, '')) } catch { return undefined }
  if (!isRecord(value) || typeof value.id !== 'string' || !isRecord(value.metadata) || !isRecord(value.blocks) || !isRecord(value.sections) || !Array.isArray(value.sectionOrder) || !isRecord(value.steps) || !isRecord(value.definitions)) return undefined
  const document = value as unknown as PresmiumDocument
  try {
    return { id: document.id, dir, document, sites: documentCitationSites(document), search: documentSearchText(document) }
  } catch {
    return undefined
  }
}

/**
 * The workspace's document index: the tree from every document's placement, the trash, the references and synced
 * blocks between documents in both directions, and a search over titles and text. Derived from the files and never
 * stored; each read looks at the files' sizes and times and parses only those that changed, so saves, migrations,
 * tree operations, reverted history and edits outside Presmium all show without being reported to it.
 */
export class DocumentIndex {
  readonly #config: WorkspaceConfig
  readonly #files = new Map<string, Cached>()
  readonly #listeners = new Set<() => void>()
  #signature = ''

  constructor(config: WorkspaceConfig) {
    this.#config = config
  }

  #read(file: string, dir: string): IndexedDocument | undefined {
    let stat
    try { stat = statSync(file) } catch { this.#files.delete(file); return undefined }
    const known = this.#files.get(file)
    if (known && known.mtimeMs === stat.mtimeMs && known.size === stat.size) return known.value
    const value = parse(file, dir)
    this.#files.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, value })
    return value
  }

  /** The documents in the workspace (not in the trash) and the tree their placements make. */
  scan() {
    const root = this.#config.root
    if (this.#config.singleDeck) {
      const only = this.#read(join(root, DOCUMENT_ENTRY), '')
      const documents = new Map(only ? [[only.id, only]] : [])
      return { documents, tree: undefined, order: only ? [only.id] : [] }
    }
    const scanned = workspaceDocuments(root)
    const documents = new Map<DocumentId, IndexedDocument>()
    for (const node of scanned.tree.order) {
      const found = this.#read(join(root, node.path), dirOf(node.path))
      if (found && found.id === node.id) documents.set(node.id, found)
    }
    return { documents, tree: scanned.tree, order: scanned.tree.order.map(node => node.id) }
  }

  /** Every trashed document by ID, the ones trashed along with an ancestor included. */
  trashed(): Map<DocumentId, TrashedDocument> {
    const out = new Map<DocumentId, TrashedDocument>()
    const folder = join(this.#config.root, TRASH_DIR)
    let names: string[] = []
    try { names = readdirSync(folder).sort() } catch { return out }
    for (const name of names) {
      const dir = `${TRASH_DIR}/${name}`
      let record: unknown
      try { record = JSON.parse(readFileSync(join(this.#config.root, dir, TRASH_RECORD), 'utf8')) } catch { continue }
      if (!isRecord(record) || typeof record.from !== 'string') continue
      const found = this.#read(join(this.#config.root, dir, DOCUMENT_ENTRY), dir)
      if (!found) continue
      out.set(found.id, { ...found, record: { deletedAt: typeof record.deletedAt === 'string' ? record.deletedAt : '', from: record.from, parent: typeof record.parent === 'string' ? record.parent : null, rank: typeof record.rank === 'string' ? record.rank : '', children: Array.isArray(record.children) ? record.children.filter((id): id is string => typeof id === 'string') : [], ...typeof record.with === 'string' ? { with: record.with } : {} } })
    }
    return out
  }

  tree(): DocumentTree {
    const { documents, tree } = this.scan()
    const nodes: Record<DocumentId, TreeNode> = {}
    if (!tree) {
      for (const found of documents.values()) nodes[found.id] = { id: found.id, title: found.document.metadata.title, path: found.dir, parent: null, rank: found.document.placement?.rank ?? '', depth: 0, children: [] }
      return { roots: Object.keys(nodes), nodes, trash: [] }
    }
    const issues = new Map<DocumentId, TreeIssue[]>()
    const add = (id: DocumentId, issue: TreeIssue) => issues.set(id, [...issues.get(id) ?? [], issue])
    for (const problem of tree.problems) {
      if (problem.code === 'tree.duplicate-id') add(problem.id, { code: problem.code, message: `Two documents have the ID ${problem.id}: ${problem.paths.join(' and ')}; only the first is in the tree.` })
      else if (problem.code === 'tree.unknown-parent') add(problem.id, { code: problem.code, message: `The parent ${problem.parent} does not exist; the document is shown at the top level.` })
      else add(problem.id, { code: problem.code, message: 'The document is placed under its own descendant; it is shown at the top level.' })
    }
    for (const node of tree.order) {
      nodes[node.id] = { id: node.id, title: node.title, path: dirOf(node.path), parent: node.parent, rank: node.placement.rank, depth: node.depth, children: [...tree.children.get(node.id) ?? []], ...issues.has(node.id) ? { issues: issues.get(node.id) } : {} }
    }
    const trash: TrashEntry[] = [...this.trashed().values()].filter(entry => !entry.record.with).map(entry => ({ id: entry.id, title: entry.document.metadata.title, deletedAt: entry.record.deletedAt, from: entry.record.from, parent: entry.record.parent, children: entry.record.children }))
    trash.sort((a, b) => a.deletedAt < b.deletedAt ? 1 : a.deletedAt > b.deletedAt ? -1 : 0)
    return { roots: [...tree.children.get(null) ?? []], nodes, trash }
  }

  /** The titles of the document's ancestors, root first. */
  ancestors(id: DocumentId): string[] {
    const { tree } = this.scan()
    return tree ? tree.ancestors(id).map(node => node.title) : []
  }

  /** The document by ID, in the workspace or in the trash. */
  find(id: DocumentId): { found: IndexedDocument, trashed: boolean } | undefined {
    const live = this.scan().documents.get(id)
    if (live) return { found: live, trashed: false }
    const trashed = this.trashed().get(id)
    return trashed ? { found: trashed, trashed: true } : undefined
  }

  /** The current title of a reference's target, or undefined when the document, page or block is gone. */
  titleOf(target: ReferenceTarget, documents = this.scan().documents): string | undefined {
    const found = documents.get(target.document) ?? this.trashed().get(target.document)
    return found ? referenceTargetTitle(found.document, target) : undefined
  }

  links(id: DocumentId): DocumentLinks {
    const { documents } = this.scan()
    const trashed = this.trashed()
    const own = documents.get(id) ?? trashed.get(id)
    if (!own) return { document: id, incoming: [], outgoing: [] }
    const titleOf = (target: ReferenceTarget) => {
      const found = documents.get(target.document) ?? trashed.get(target.document)
      return found ? referenceTargetTitle(found.document, target) : undefined
    }
    const outgoing: OutgoingLink[] = own.sites.map((site) => {
      const title = titleOf(site.target)
      const isTrashed = !documents.has(site.target.document) && trashed.has(site.target.document)
      return { kind: site.kind, target: site.target, title: site.node?.label ?? title ?? site.node?.fallback ?? site.target.document, missing: title === undefined, ...isTrashed ? { trashed: true } : {} }
    })
    const incoming: DocumentCitation[] = []
    for (const citing of documents.values()) {
      for (const site of citing.sites) {
        if (site.target.document !== id) continue
        const node = (reference: ReferenceNode) => reference.label ?? titleOf(reference.target) ?? reference.fallback
        const excerpt = site.kind === 'embed' ? targetExcerpt(own.document, { block: site.target.block }) : documentCitationSites(citing.document, node).find(other => other.block === site.block && other.node === site.node)?.excerpt ?? site.excerpt
        incoming.push({ kind: site.kind, document: citing.id, title: citing.document.metadata.title, ...site.section !== undefined ? { section: site.section } : {}, block: site.block, excerpt })
      }
    }
    return { document: id, incoming, outgoing }
  }

  /** Titles first (in tree order), then page titles and block text. */
  search(query: string, limit: number): DocumentSearchHit[] {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const { documents, order } = this.scan()
    const listed = order.flatMap(id => documents.get(id) ?? [])
    const ancestors = new Map<DocumentId, string[]>()
    const ancestorsOf = (id: DocumentId) => { let known = ancestors.get(id); if (!known) ancestors.set(id, known = this.ancestors(id)); return known }
    const hits: DocumentSearchHit[] = []
    for (const found of listed) {
      if (hits.length >= limit) return hits
      if (found.document.metadata.title.toLowerCase().includes(q)) hits.push({ id: found.id, title: found.document.metadata.title, ancestors: ancestorsOf(found.id), match: 'title' })
    }
    const titled = new Set(hits.map(hit => hit.id))
    for (const found of listed) {
      if (hits.length >= limit) break
      if (titled.has(found.id)) continue
      const page = found.search.pages.find(page => page.title.toLowerCase().includes(q))
      const block = page ? undefined : found.search.blocks.find(block => block.text.toLowerCase().includes(q))
      if (!page && !block) continue
      hits.push({ id: found.id, title: found.document.metadata.title, ancestors: ancestorsOf(found.id), match: 'content', excerpt: page ? page.title : matchingSentence(block!.text, q) ?? block!.text, ...page ? { section: page.id } : block!.section !== undefined ? { section: block!.section, block: block!.id } : { block: block!.id } })
    }
    return hits
  }

  preview(id: DocumentId, target: { section?: SectionId, block?: BlockId }): DocumentPreview {
    const located = this.find(id)
    if (!located) return { id, title: '', ancestors: [], excerpt: '', pages: 0, steps: 0, citedBy: 0, missing: true }
    const { document } = located.found
    const missing = (target.block !== undefined && !Object.hasOwn(document.blocks, target.block)) || (target.section !== undefined && !Object.hasOwn(document.sections, target.section))
    const citedBy = new Set([...this.scan().documents.values()].filter(other => other.sites.some(site => site.target.document === id)).map(other => other.id)).size
    return {
      id,
      title: referenceTargetTitle(document, { document: id, ...target }) ?? document.metadata.title,
      ancestors: located.trashed ? [] : this.ancestors(id),
      excerpt: missing ? '' : targetExcerpt(document, target),
      pages: document.sectionOrder.length,
      steps: document.sectionOrder.reduce((sum, section) => sum + (document.sections[section]?.stepOrder.length ?? 0), 0),
      citedBy,
      ...located.trashed ? { trashed: true } : {},
      ...missing ? { missing: true } : {},
    }
  }

  embedSource(id: DocumentId, block: BlockId): EmbedSource {
    const located = this.find(id)
    const blocks = located && blockSubtree(located.found.document, block)
    if (!located || !blocks) return { document: id, title: located?.found.document.metadata.title ?? '', block, missing: true, ...located?.trashed ? { trashed: true } : {} }
    const { document } = located.found
    const root = blocks[block]!
    const used = Object.values(blocks).flatMap(item => item.type === 'image' && item.assetId && Object.hasOwn(document.assets, item.assetId) ? [item.assetId] : [])
    // Relative to the workspace routes, as the client reaches the document's own assets.
    const assets = located.trashed ? {} : Object.fromEntries(used.map(asset => [asset, `document/asset?${new URLSearchParams({ document: located.found.dir, asset })}`]))
    const states = root.type === 'component' ? document.definitions[root.definitionId]?.states.map(state => state.id) : undefined
    return { document: id, title: document.metadata.title, block, blocks, ...Object.keys(assets).length ? { assets } : {}, ...states ? { states } : {}, ...located.trashed ? { trashed: true } : {} }
  }

  /** Documents whose references carry an outdated fallback, each with its fallbacks brought up to date. */
  staleFallbacks(): { dir: string, id: DocumentId, document: PresmiumDocument }[] {
    const { documents } = this.scan()
    const out: { dir: string, id: DocumentId, document: PresmiumDocument }[] = []
    for (const found of documents.values()) {
      if (!found.sites.some(site => site.kind === 'reference')) continue
      const next = withReferenceFallbacks(found.document, target => this.titleOf(target, documents))
      if (next !== found.document) out.push({ dir: found.dir, id: found.id, document: next })
    }
    return out
  }

  /** What a client's tree shows; when it changes, subscribers are told. */
  #treeSignature(): string {
    try { return JSON.stringify(this.tree()) } catch { return '' }
  }

  /** Tell subscribers when the tree has changed, whatever changed it; `force` tells them anyway. */
  check(force = false): void {
    const next = this.#treeSignature()
    if (!force && next === this.#signature) return
    this.#signature = next
    for (const listener of [...this.#listeners]) listener()
  }

  /** Called with no argument whenever the tree has changed (see `check`). */
  subscribe(listener: () => void): () => void {
    if (!this.#listeners.size) this.#signature = this.#treeSignature()
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  get watched(): boolean { return this.#listeners.size > 0 }

  close(): void {
    this.#listeners.clear()
  }

  /** Whether a file exists in the workspace. */
  exists(path: string): boolean {
    return existsSync(join(this.#config.root, path))
  }
}
