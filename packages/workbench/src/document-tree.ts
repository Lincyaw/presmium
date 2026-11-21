import { errorMessage } from '@lincyaw/kernel'
import type { ReferenceTarget } from '@lincyaw/kernel'
import type { DocumentPreview, DocumentTree, EmbedSource, TreeOperation, TreeOperationResult } from '@lincyaw/kernel/contracts'
import type { ToastMessage } from './knowledge-components.tsx'
import { WorkspaceServerError } from './workspace-client.ts'
import type { WorkspaceClient } from './workspace-client.ts'
import type { WorkbenchStore } from './workbench-state.ts'
import { DOCUMENT_TREE_MESSAGES } from './tree-messages.ts'

const RECENT_KEY = 'presmium.recent-documents'
const RECENT_LIMIT = 12

export interface RecentDocument { id: string, at: string }

/** Where a reference or a search result leads: a document, then a page or a block of it. */
export type DocumentPlace = ReferenceTarget

/**
 * The workspace's document tree as the workbench uses it: read on start and on each tree event, changed through
 * `tree/operation`, with the documents opened recently (kept in this browser) and the one message (toast) that says
 * what an operation did and offers its Undo.
 */
export class DocumentTreeActions {
  readonly #client: WorkspaceClient
  readonly #store: WorkbenchStore
  readonly #open: (dir: string) => Promise<void>
  readonly #reveal: (section: string, block?: string) => void
  #reading?: AbortController
  #treeText?: string
  readonly #previews = new Map<string, Promise<DocumentPreview>>()
  readonly #embeds = new Map<string, Promise<EmbedSource>>()
  #unsubscribe?: () => void
  #toastSequence = 0

  constructor(options: { client: WorkspaceClient, store: WorkbenchStore, open(dir: string): Promise<void>, reveal(section: string, block?: string): void }) {
    this.#client = options.client
    this.#store = options.store
    this.#open = options.open
    this.#reveal = options.reveal
    this.#store.set({ recentDocuments: readRecent() })
  }

  get available(): boolean { return Boolean(this.#client.readTree && this.#client.operateTree) }

  get #t() { return DOCUMENT_TREE_MESSAGES[this.#store.state.locale] }

  async load(): Promise<void> {
    if (!this.#client.readTree) return
    // Other clients' changes (and the AI's) arrive as tree events; the first read starts listening.
    this.#unsubscribe ??= this.#client.subscribeTree?.(() => void this.load(), () => {})
    this.#reading?.abort()
    const reading = this.#reading = new AbortController()
    if (!this.#store.state.documentTree) this.#store.set({ isDocumentTreeLoading: true })
    try {
      const tree = await this.#client.readTree(reading.signal)
      if (reading.signal.aborted) return
      this.#adopt(tree)
      if (this.#store.state.documentTreeFailure || this.#store.state.isDocumentTreeLoading) this.#store.set({ documentTreeFailure: undefined, isDocumentTreeLoading: false })
    } catch (error) {
      if (reading.signal.aborted) return
      this.#store.set({ documentTreeFailure: error instanceof WorkspaceServerError && error.status === 404 ? 'tree-unavailable' : errorMessage(error), isDocumentTreeLoading: false })
    }
  }

  /** The folder of the document, as the workbench opens it. */
  dirOf(id: string): string | undefined {
    const state = this.#store.state
    return state.documents?.documents.find(doc => doc.id === id)?.dir ?? state.documentTree?.nodes[id]?.path
  }

  /** The ID of the document in a folder. */
  idOf(dir: string | undefined): string | undefined {
    if (dir === undefined) return undefined
    const state = this.#store.state
    return state.documents?.documents.find(doc => doc.dir === dir)?.id ?? Object.values(state.documentTree?.nodes ?? {}).find(node => node.path === dir)?.id
  }

  /** The titles of the document's ancestors, the top level first. */
  ancestors(id: string): { id: string, title: string }[] {
    const nodes = this.#store.state.documentTree?.nodes ?? {}
    const trail: { id: string, title: string }[] = []
    for (let node = nodes[nodes[id]?.parent ?? '']; node && trail.length < 64; node = nodes[node.parent ?? '']) trail.unshift({ id: node.id, title: node.title })
    return trail
  }

  title(id: string): string | undefined {
    return this.#store.state.documentTree?.nodes[id]?.title ?? this.#store.state.documents?.documents.find(doc => doc.id === id)?.title
  }

  /** Opens a document by its ID, then shows the page or block of `place`. */
  async openPlace(place: DocumentPlace): Promise<boolean> {
    const dir = this.dirOf(place.document)
    if (dir === undefined) { this.toast(this.#t.openFailed, 'danger'); return false }
    await this.#open(dir)
    if (place.section) this.#reveal(place.section, place.block)
    return true
  }

  /** Remembers that the author opened the document. */
  visited(id: string | undefined): void {
    if (!id) return
    const recent = [{ id, at: new Date().toISOString() }, ...(this.#store.state.recentDocuments ?? []).filter(entry => entry.id !== id)].slice(0, RECENT_LIMIT)
    this.#store.set({ recentDocuments: recent })
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)) } catch {}
  }

  async operate(operation: TreeOperation): Promise<TreeOperationResult | undefined> {
    if (!this.#client.operateTree) return undefined
    this.#store.set({ isDocumentTreeBusy: true })
    try {
      const result = await this.#client.operateTree(operation)
      this.#adopt(result.tree, true)
      return result
    } catch (error) {
      const code = error instanceof WorkspaceServerError ? (error.answer as { code?: string }).code ?? error.answer.error : undefined
      this.toast(this.#t.operationFailed(this.#t.failures[code ?? ''] ?? this.#t.failureGeneric), 'danger')
      return undefined
    } finally {
      this.#store.set({ isDocumentTreeBusy: false })
    }
  }

  /** Creates a document under `parent` (the top level when null), opens it and selects its title in the tree. */
  async create(parent: string | null, title = this.#t.untitled): Promise<string | undefined> {
    const siblings = parent ? this.#store.state.documentTree?.nodes[parent]?.children : this.#store.state.documentTree?.roots
    const result = await this.operate({ type: 'create', title, parent, after: siblings?.at(-1) ?? null })
    if (!result?.created) return undefined
    this.#store.set({ renamingDocument: result.created })
    void this.loadDocumentsThenOpen(result.created)
    return result.created
  }

  async loadDocumentsThenOpen(id: string): Promise<void> {
    if (this.dirOf(id) === undefined) this.#store.set({ documents: await this.#client.readDocuments().catch(() => this.#store.state.documents) })
    await this.openPlace({ document: id })
  }

  /** A tree read again keeps its identity when nothing changed, so that what depends on it does not render or read again. */
  #adopt(tree: DocumentTree, changed = false): void {
    const text = JSON.stringify(tree)
    if (!changed && text === this.#treeText) return
    this.#treeText = text
    this.invalidateLinks()
    this.#store.set({ documentTree: tree })
  }

  /** Forgets the cached previews and synced block sources (after a tree change, or a document saved). */
  invalidateLinks(): void {
    this.#previews.clear(); this.#embeds.clear()
    this.#store.set({ documentLinksGeneration: (this.#store.state.documentLinksGeneration ?? 0) + 1 })
  }

  /** One read per target until the next tree change: hovering again, or many chips of the same target, reuse it. */
  preview(target: ReferenceTarget): Promise<DocumentPreview> | undefined {
    if (!this.#client.readDocumentPreview) return undefined
    const key = JSON.stringify([target.document, target.section ?? '', target.block ?? ''])
    let read = this.#previews.get(key)
    if (!read) { read = this.#client.readDocumentPreview(target); this.#previews.set(key, read); read.catch(() => this.#previews.delete(key)) }
    return read
  }

  embedSource(source: { document: string, block: string }): Promise<EmbedSource> | undefined {
    if (!this.#client.readEmbedSource) return undefined
    const key = `${source.document}\0${source.block}`
    let read = this.#embeds.get(key)
    if (!read) { read = this.#client.readEmbedSource(source); this.#embeds.set(key, read); read.catch(() => this.#embeds.delete(key)) }
    return read
  }

  startRenaming(id: string | undefined): void {
    if (this.#store.state.renamingDocument !== id) this.#store.set({ renamingDocument: id })
  }

  async rename(id: string, title: string): Promise<void> {
    await this.operate({ type: 'rename', id, title })
  }

  async duplicate(id: string): Promise<void> {
    const result = await this.operate({ type: 'duplicate', id })
    if (result?.created) this.toast(this.#t.duplicated(this.title(result.created) ?? ''))
  }

  async move(id: string, parent: string | null, after: string | null): Promise<void> {
    const tree = this.#store.state.documentTree
    const node = tree?.nodes[id]
    if (!tree || !node) return
    const siblings = node.parent ? tree.nodes[node.parent]?.children ?? [] : tree.roots
    const before = { parent: node.parent, after: siblings[siblings.indexOf(id) - 1] ?? null }
    if (before.parent === parent && before.after === after) return
    const result = await this.operate({ type: 'move', id, parent, after })
    if (!result) return
    const where = parent ? this.title(parent) ?? '' : undefined
    this.toast(where === undefined ? this.#t.movedToTop(node.title) : this.#t.movedUnder(node.title, where), 'neutral', { label: this.#t.undo, run: () => void this.operate({ type: 'move', id, parent: before.parent, after: before.after }) })
  }

  async trash(id: string): Promise<void> {
    const title = this.title(id) ?? ''
    const result = await this.operate({ type: 'trash', id })
    if (!result) return
    this.toast(this.#t.trashed(title), 'neutral', { label: this.#t.undo, run: () => void this.restore(id) })
  }

  async restore(id: string): Promise<void> {
    const result = await this.operate({ type: 'restore', id })
    if (result) this.#store.set({ documents: await this.#client.readDocuments().catch(() => this.#store.state.documents) })
  }

  async purge(id: string): Promise<boolean> {
    const result = await this.operate({ type: 'purge', id })
    if (result?.converted?.length) this.toast(this.#t.purgedConverted(result.converted.length))
    return Boolean(result)
  }

  async embedToCopy(document: string, block: string): Promise<boolean> {
    return Boolean(await this.operate({ type: 'embed-to-copy', document, block }))
  }

  toast(text: string, tone: 'neutral' | 'danger' = 'neutral', action?: ToastMessage['action']): void {
    this.#store.set({ toast: { id: String(++this.#toastSequence), text, tone, ...action ? { action } : {} } })
  }

  closeToast = (id: string): void => {
    if (this.#store.state.toast?.id === id) this.#store.set({ toast: undefined })
  }

  dispose(): void { this.#reading?.abort(); this.#unsubscribe?.() }
}

function readRecent(): RecentDocument[] {
  try {
    const value = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]') as unknown
    return Array.isArray(value) ? value.filter((entry): entry is RecentDocument => typeof entry?.id === 'string' && typeof entry.at === 'string').slice(0, RECENT_LIMIT) : []
  } catch { return [] }
}

/** The document's tree that is ready for the tree view: a missing tree is an empty one. */
export function treeOrEmpty(tree: DocumentTree | undefined): DocumentTree {
  return tree ?? { roots: [], nodes: {}, trash: [] }
}
