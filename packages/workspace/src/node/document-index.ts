import { existsSync, readFileSync, watch } from 'node:fs'
import type { FSWatcher } from 'node:fs'
import { readdir, readFile, realpath, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { setImmediate as yieldToEvents } from 'node:timers/promises'
import { provideDocumentEntries } from '@lincyaw/compiler'
import type { ScannedDocument } from '@lincyaw/compiler'
import { blockFirstText, blockSubtree, DOCUMENT_ENTRY, documentCitationSites, documentSearchText, documentTree, isRecord, targetExcerpt } from '@lincyaw/kernel'
import type { BlockId, DocumentCitation, DocumentId, DocumentLinks, DocumentPlacement, DocumentPreview, DocumentSearchHit, DocumentTree, EmbedSource, OutgoingLink, PlacementTree, PresmiumDocument, ReferenceTarget, SectionId, TrashEntry, TreeIssue, TreeNode } from '@lincyaw/kernel'
import type { WorkspaceConfig } from './config.ts'

/** The workspace folder trashed documents are moved to, one folder per document ID. */
export const TRASH_DIR = '.trash'
/** The record beside a trashed document: where it came from and where it sat in the tree. */
export const TRASH_RECORD = 'trashed.json'
/** Folders discovery never enters, as in the compiler's scan; `locales/<lang>/` holds translations. */
const SKIPPED = new Set(['node_modules', '.git', '.presmium', 'dist', TRASH_DIR])
/** How long file events are gathered before the index reads the files they name. */
const SETTLE_MS = 40
/** A walk of the whole workspace also runs this often, for what file events cannot tell (watching unavailable, new folders deep in a document). */
const SWEEP_MS = 30_000
/** Work done between two yields to the event loop while reading many files. */
const SLICE_MS = 8
const READ_CONCURRENCY = 8

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

/** A reference or synced block in a document, as the index keeps it. */
interface Site { kind: 'reference' | 'embed', target: ReferenceTarget, block: BlockId, section?: SectionId, excerpt: string, label?: string, fallback?: string }

/** What the index keeps of one document: never the whole document, which is read again when needed. */
export interface IndexEntry {
  id: DocumentId
  /** The document folder, relative to the workspace root. */
  dir: string
  title: string
  placement: DocumentPlacement
  sites: Site[]
  /** The current titles its pages and blocks give references to them. */
  pages: Map<SectionId, string>
  blocks: Map<BlockId, string>
  /** The first text of the document and of each page, for previews. */
  excerpt: string
  pageExcerpts: Map<SectionId, string>
  steps: number
  /** Lowercase search text: the title, then everything (for a quick test), then page titles and blocks. */
  search: { title: string, all: string, pages: { id: SectionId, title: string, lower: string }[], blocks: { id: BlockId, section?: SectionId, text: string, lower: string }[] }
  schemaVersion: unknown
  /** What a client's tree shows of it; a change of this is a change of the tree. */
  treeKey: string
  /** What references to it show; a change of this can make other documents' fallbacks outdated. */
  titleKey: string
}

export interface TrashedEntry extends IndexEntry { record: TrashRecord }

interface FileState { mtimeMs: number, size: number, entry?: IndexEntry }

const dirOf = (entry: string) => entry.split('/').slice(0, -1).join('/')

/** The index's view of one parsed document. */
function indexEntry(document: PresmiumDocument, dir: string): IndexEntry {
  const sites = documentCitationSites(document).map(site => ({ kind: site.kind, target: site.target, block: site.block, ...site.section !== undefined ? { section: site.section } : {}, excerpt: site.excerpt, ...site.node?.label !== undefined ? { label: site.node.label } : {}, ...site.node ? { fallback: site.node.fallback } : {} }))
  const text = documentSearchText(document)
  const pages = new Map(document.sectionOrder.flatMap(id => document.sections[id] ? [[id, document.sections[id]!.title] as const] : []))
  const blocks = new Map(Object.keys(document.blocks).map(id => [id, blockFirstText(document, id) || document.metadata.title]))
  const pageExcerpts = new Map(document.sectionOrder.map(id => [id, targetExcerpt(document, { section: id })]))
  const title = document.metadata.title
  const searchPages = text.pages.map(page => ({ ...page, lower: page.title.toLowerCase() }))
  const searchBlocks = text.blocks.map(block => ({ ...block, lower: block.text.toLowerCase() }))
  return {
    id: document.id, dir, title, placement: document.placement, sites, pages, blocks, schemaVersion: document.schemaVersion,
    excerpt: targetExcerpt(document, {}), pageExcerpts,
    steps: document.sectionOrder.reduce((sum, section) => sum + (document.sections[section]?.stepOrder.length ?? 0), 0),
    search: { title: title.toLowerCase(), all: [title, ...text.pages.map(page => page.title), ...text.blocks.map(block => block.text)].join('\n').toLowerCase(), pages: searchPages, blocks: searchBlocks },
    treeKey: JSON.stringify([document.id, title, document.placement?.parent ?? null, document.placement?.rank ?? '', dir]),
    titleKey: JSON.stringify([title, [...pages], [...blocks]]),
  }
}

function parseDocument(text: string): PresmiumDocument | undefined {
  let value: unknown
  try { value = JSON.parse(text.replace(/^﻿/, '')) } catch { return undefined }
  if (!isRecord(value) || typeof value.id !== 'string' || !isRecord(value.metadata) || !isRecord(value.blocks) || !isRecord(value.sections) || !Array.isArray(value.sectionOrder) || !isRecord(value.steps) || !isRecord(value.definitions)) return undefined
  return value as unknown as PresmiumDocument
}

function trashRecord(value: unknown): TrashRecord | undefined {
  if (!isRecord(value) || typeof value.from !== 'string') return undefined
  return { deletedAt: typeof value.deletedAt === 'string' ? value.deletedAt : '', from: value.from, parent: typeof value.parent === 'string' ? value.parent : null, rank: typeof value.rank === 'string' ? value.rank : '', children: Array.isArray(value.children) ? value.children.filter((id): id is string => typeof id === 'string') : [], ...typeof value.with === 'string' ? { with: value.with } : {} }
}

/** The tree, the references in both directions, and what is derived from them; rebuilt only when what they depend on changed. */
interface Derived {
  documents: Map<DocumentId, IndexEntry>
  order: DocumentId[]
  tree?: PlacementTree
  incoming: Map<DocumentId, { citing: IndexEntry, site: Site }[]>
  clientTree?: DocumentTree
  /** Every entry file as the compiler's scan describes it. */
  scanned: ScannedDocument[]
}

/**
 * The workspace's document index (docs/authoring-actions.md, section 15): the tree from every document's placement,
 * the trash, the references and synced blocks between documents in both directions, and a search over titles and text.
 * Derived from the files and never stored. File events on the document folders (and on the folders that hold them)
 * mark what to read again; reading is asynchronous, parses only the files that changed and yields to the event loop
 * between slices, and every answer is computed from what is already in memory. A slow walk of the whole workspace
 * now and then catches what file events cannot report.
 */
export class DocumentIndex {
  readonly #config: WorkspaceConfig
  /** Every entry file found, by its path relative to the root. */
  readonly #files = new Map<string, FileState>()
  readonly #trash = new Map<string, TrashedEntry>()
  readonly #watchers = new Map<string, FSWatcher>()
  readonly #listeners = new Set<() => void>()
  readonly #titleListeners = new Set<(changed: DocumentId[]) => void>()
  #derived?: Derived
  #dirty = new Set<string>()
  readonly #folders = new Set<string>()
  #walk = true
  #trashDirty = true
  #pending?: Promise<void>
  #timer?: ReturnType<typeof setTimeout>
  #sweep?: ReturnType<typeof setInterval>
  #watching = true
  #closed = false
  /** What the compiler's scans see of each file: its time and size. */
  readonly #stamps = new Map<string, string>()
  readonly #trashStamps = new Map<string, string>()
  #generation = 0
  #stopProviding?: () => void

  constructor(config: WorkspaceConfig) {
    this.#config = config
  }

  /** Starts watching and the occasional walk, and builds the index; until this, `ready` builds it on first use. */
  async start(): Promise<void> {
    this.#sweep = setInterval(() => { this.#walk = true; this.#trashDirty = true; this.#schedule() }, SWEEP_MS)
    this.#sweep.unref()
    // The compiler's scans in this process list the documents from the index instead of walking the workspace.
    if (!this.#config.singleDeck) this.#stopProviding = provideDocumentEntries(this.#config.root, () => this.#derived && !this.#walk ? { generation: this.#generation, documents: this.#derived.scanned, stamps: this.#stamps } : undefined)
    await this.ready()
  }

  close(): void {
    this.#closed = true
    clearTimeout(this.#timer)
    clearInterval(this.#sweep)
    this.#stopProviding?.()
    for (const watcher of this.#watchers.values()) watcher.close()
    this.#watchers.clear()
    this.#listeners.clear()
    this.#titleListeners.clear()
  }

  /** Resolves once everything known to have changed has been read. */
  ready(): Promise<void> {
    if (!this.#derived || this.#walk || this.#dirty.size || this.#folders.size || this.#trashDirty) return this.#refresh()
    return this.#pending ?? Promise.resolve()
  }

  /** Tell the index which files an operation of this process changed (paths relative to the root); `structure` when folders appeared or went. */
  async changed(paths: string[], structure = false): Promise<void> {
    for (const path of paths) {
      if (path.startsWith(`${TRASH_DIR}/`) || path === TRASH_DIR) this.#trashDirty = true
      else this.#dirty.add(path.endsWith(DOCUMENT_ENTRY) ? path : path ? `${path}/${DOCUMENT_ENTRY}` : DOCUMENT_ENTRY)
    }
    if (structure) this.#walk = true
    await this.#refresh()
  }

  #schedule(): void {
    if (this.#closed || this.#timer) return
    this.#timer = setTimeout(() => { this.#timer = undefined; void this.#refresh().catch(() => {}) }, SETTLE_MS)
    this.#timer.unref?.()
  }

  #refresh(): Promise<void> {
    const run = (this.#pending ?? Promise.resolve()).then(() => this.#update())
    const tracked: Promise<void> = run.finally(() => { if (this.#pending === tracked) this.#pending = undefined })
    this.#pending = tracked
    return tracked
  }

  #watch(dir: string, onEvent: (name: string | null) => void): void {
    if (!this.#watching || this.#watchers.has(dir)) return
    try {
      const watcher = watch(join(this.#config.root, dir), { persistent: false }, (_event, name) => onEvent(name === null ? null : String(name)))
      watcher.on('error', () => { watcher.close(); this.#watchers.delete(dir); this.#walk = true; this.#schedule() })
      this.#watchers.set(dir, watcher)
    } catch (error) {
      // Too many watches (or none at all): the occasional walk keeps the index current, if later. A folder that is
      // gone by now is simply not watched.
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOSPC' || code === 'EMFILE' || code === 'ENOSYS') this.#watching = false
    }
  }

  /** Every entry file and the folders worth watching, walked without blocking. */
  async #discover(): Promise<{ entries: string[], containers: string[] }> {
    const root = this.#config.root
    if (this.#config.singleDeck) return { entries: [DOCUMENT_ENTRY], containers: [] }
    const entries: string[] = [], containers: string[] = [], seen = new Set<string>()
    const walk = async (rel: string, inDocument: boolean): Promise<void> => {
      const path = rel ? join(root, rel) : root
      let names
      try {
        const real = await realpath(path)
        if (seen.has(real)) return
        seen.add(real)
        names = await readdir(path, { withFileTypes: true })
      } catch { return }
      const holds = names.some(item => item.name === DOCUMENT_ENTRY && (item.isFile() || item.isSymbolicLink()))
      if (holds) entries.push(rel ? `${rel}/${DOCUMENT_ENTRY}` : DOCUMENT_ENTRY)
      if (!inDocument || holds) containers.push(rel)
      const folders = names.filter(item => !SKIPPED.has(item.name) && !item.name.startsWith('.') && item.name !== DOCUMENT_ENTRY && (item.isDirectory() || item.isSymbolicLink()))
      for (const item of folders.sort((a, b) => a.name < b.name ? -1 : 1)) {
        const next = rel ? `${rel}/${item.name}` : item.name
        if (item.isSymbolicLink()) { try { if (!(await stat(join(root, next))).isDirectory()) continue } catch { continue } }
        if (item.name !== 'locales') await walk(next, inDocument || holds)
      }
    }
    await walk('', false)
    return { entries, containers }
  }

  /** Reads the given entry files (relative paths), in slices that leave the event loop free. */
  async #read(paths: string[], into: (path: string, state: FileState | undefined) => void): Promise<void> {
    let slice = performance.now()
    for (let at = 0; at < paths.length; at += READ_CONCURRENCY) {
      const batch = paths.slice(at, at + READ_CONCURRENCY)
      const read = await Promise.all(batch.map(async (path) => {
        const file = join(this.#config.root, path)
        try {
          const info = await stat(file)
          const known = this.#files.get(path)
          if (known && known.mtimeMs === info.mtimeMs && known.size === info.size) return { path, state: known, text: undefined }
          return { path, state: { mtimeMs: info.mtimeMs, size: info.size } as FileState, text: await readFile(file, 'utf8') }
        } catch { return { path, state: undefined, text: undefined } }
      }))
      for (const { path, state, text } of read) {
        if (state && text !== undefined) {
          const document = parseDocument(text)
          try { if (document) state.entry = indexEntry(document, dirOf(path)) } catch { /* Indexed as a file without a document. */ }
        }
        into(path, state)
        if (performance.now() - slice > SLICE_MS) { await yieldToEvents(); slice = performance.now() }
      }
    }
  }

  /** The callback of a watched folder that holds documents (`document`: it is one itself). */
  #folderEvents(dir: string, document: boolean): (name: string | null) => void {
    const entryOf = (folder: string) => folder ? `${folder}/${DOCUMENT_ENTRY}` : DOCUMENT_ENTRY
    return (name) => {
      // An entry file written here: this folder's document (new or changed).
      if (name === DOCUMENT_ENTRY) this.#dirty.add(entryOf(dir))
      else if (name === null) this.#walk = true
      // A folder appeared or went: looked at when the index next reads (an operation of this process has usually told it already).
      else if (!document) this.#folders.add(dir ? `${dir}/${name}` : name)
      this.#schedule()
    }
  }

  /** Folders file events named: their documents are read again; only a folder that may hold documents deeper is walked. */
  #lookAtFolders(): void {
    for (const folder of this.#folders) {
      // The trash folder itself appeared (or went): it is read, and watched while it exists.
      if (folder === TRASH_DIR) { this.#trashDirty = true; continue }
      const entry = `${folder}/${DOCUMENT_ENTRY}`
      if (existsSync(join(this.#config.root, entry))) { if (!this.#files.has(entry)) this.#dirty.add(entry) }
      else if (existsSync(join(this.#config.root, folder))) {
        // A new folder without a document yet: watched, so the document written into it is seen (deeper ones by the walk).
        const name = folder.split('/').at(-1)!
        if (!SKIPPED.has(name) && !name.startsWith('.') && name !== 'locales') this.#watch(folder, this.#folderEvents(folder, false))
      }
      else for (const path of this.#files.keys()) if (path.startsWith(`${folder}/`)) this.#dirty.add(path)
    }
    this.#folders.clear()
  }

  async #update(): Promise<void> {
    if (this.#closed) return
    this.#lookAtFolders()
    const before = this.#derived
    const changes: { path: string, before?: IndexEntry, after?: IndexEntry }[] = []
    let structural = false
    if (this.#walk) {
      this.#walk = false
      const { entries, containers } = await this.#discover()
      const found = new Set(entries)
      for (const [path, state] of [...this.#files]) if (!found.has(path)) { this.#files.delete(path); this.#stamps.delete(path); changes.push({ path, ...state.entry ? { before: state.entry } : {} }); structural = true }
      // Watched folders: those that hold documents, and those on the way to them; never a document's own subfolders.
      const wanted = new Set(containers)
      for (const [dir, watcher] of this.#watchers) if (dir !== TRASH_DIR && !wanted.has(dir)) { watcher.close(); this.#watchers.delete(dir) }
      for (const dir of containers) this.#watch(dir, this.#folderEvents(dir, found.has(dir ? `${dir}/${DOCUMENT_ENTRY}` : DOCUMENT_ENTRY)))
      for (const entry of entries) if (!this.#files.has(entry)) this.#dirty.add(entry)
      // Known files are looked at again only on the occasional walk (their events may have been missed).
      if (before) for (const entry of entries) this.#dirty.add(entry)
    }
    if (this.#dirty.size) {
      const paths = [...this.#dirty]
      this.#dirty.clear()
      await this.#read(paths, (path, state) => {
        const known = this.#files.get(path)
        if (state === known) return
        changes.push({ path, ...known?.entry ? { before: known.entry } : {}, ...state?.entry ? { after: state.entry } : {} })
        if (state) {
          if (!known) {
            structural = true
            // A document this index did not know: watch its folder and the folder holding it.
            const dir = dirOf(path)
            this.#watch(dir, this.#folderEvents(dir, true))
            const parent = dirOf(dir)
            if (dir) this.#watch(parent, this.#folderEvents(parent, this.#files.has(parent ? `${parent}/${DOCUMENT_ENTRY}` : DOCUMENT_ENTRY)))
          }
          this.#files.set(path, state)
          this.#stamps.set(path, `${state.mtimeMs}:${state.size}`)
        } else {
          this.#stamps.delete(path)
          structural = true
          this.#files.delete(path)
          this.#watchers.get(dirOf(path))?.close()
          this.#watchers.delete(dirOf(path))
        }
      })
    }
    let trashChanged = false
    if (this.#trashDirty) {
      this.#trashDirty = false
      trashChanged = await this.#readTrash()
    }
    if (before && !changes.length && !trashChanged) return
    this.#generation++
    const treeChanged = !before || structural || trashChanged || changes.some(change => change.before?.treeKey !== change.after?.treeKey)
    if (treeChanged) this.#derived = this.#derive()
    else for (const change of changes) if (change.before && change.after) this.#replace(before, change.before, change.after)
    const titleChanged = changes.flatMap(change => change.after && change.before?.titleKey !== change.after.titleKey ? [change.after.id] : [])
    if (before && treeChanged) for (const listener of [...this.#listeners]) listener()
    if (before && titleChanged.length) for (const listener of [...this.#titleListeners]) listener(titleChanged)
  }

  /** One document changed without changing the tree: only its own entries are replaced. */
  #replace(derived: Derived, before: IndexEntry, after: IndexEntry): void {
    if (derived.documents.get(after.id) !== before) return
    derived.documents.set(after.id, after)
    for (const site of before.sites) {
      const list = derived.incoming.get(site.target.document)
      if (!list) continue
      const kept = list.filter(item => item.citing !== before)
      if (kept.length) derived.incoming.set(site.target.document, kept)
      else derived.incoming.delete(site.target.document)
    }
    for (const site of after.sites) {
      const list = derived.incoming.get(site.target.document)
      if (list) list.push({ citing: after, site })
      else derived.incoming.set(site.target.document, [{ citing: after, site }])
    }
  }

  async #readTrash(): Promise<boolean> {
    const folder = join(this.#config.root, TRASH_DIR)
    let names: string[] = []
    try {
      names = (await readdir(folder)).sort()
      this.#watch(TRASH_DIR, () => { this.#trashDirty = true; this.#schedule() })
    } catch {
      // No trash (any more): the workspace root's watcher reports when it appears.
      this.#watchers.get(TRASH_DIR)?.close()
      this.#watchers.delete(TRASH_DIR)
    }
    const signature = [...this.#trash.values()].map(entry => entry.treeKey + entry.record.deletedAt).join()
    const known = new Map([...this.#trash.values()].map(entry => [entry.dir, entry]))
    this.#trash.clear()
    for (const name of names) {
      const dir = `${TRASH_DIR}/${name}`
      try {
        const record = trashRecord(JSON.parse(await readFile(join(this.#config.root, dir, TRASH_RECORD), 'utf8')))
        const info = await stat(join(this.#config.root, dir, DOCUMENT_ENTRY))
        const stamp = `${info.mtimeMs}:${info.size}`
        const reused = known.get(dir)
        // A trashed document is parsed once; only its record is read again.
        const entry = reused && this.#trashStamps.get(dir) === stamp ? reused : (() => { const document = parseDocument(readFileSync(join(this.#config.root, dir, DOCUMENT_ENTRY), 'utf8')); return document && indexEntry(document, dir) })()
        if (record && entry) { this.#trash.set(entry.id, { ...entry, record }); this.#trashStamps.set(dir, stamp) }
      } catch { /* Not a trashed document. */ }
    }
    return signature !== [...this.#trash.values()].map(entry => entry.treeKey + entry.record.deletedAt).join()
  }

  /** The tree, the references and the compiler's scan, from every document: when the tree changed. */
  #derive(): Derived {
    const entries = [...this.#files.entries()].flatMap(([path, state]) => state.entry ? [{ path, entry: state.entry }] : [])
    const documents = new Map<DocumentId, IndexEntry>()
    let tree: PlacementTree | undefined
    if (this.#config.singleDeck) for (const { entry } of entries) documents.set(entry.id, entry)
    else {
      tree = documentTree(entries.map(({ path, entry }) => ({ id: entry.id, path, title: entry.title, placement: { parent: entry.placement?.parent ?? null, rank: entry.placement?.rank ?? '' } })))
      for (const { entry } of entries) if (!documents.has(entry.id) && tree!.byId.get(entry.id)?.path === (entry.dir ? `${entry.dir}/${DOCUMENT_ENTRY}` : DOCUMENT_ENTRY)) documents.set(entry.id, entry)
    }
    const incoming = new Map<DocumentId, { citing: IndexEntry, site: Site }[]>()
    for (const citing of documents.values()) for (const site of citing.sites) {
      const list = incoming.get(site.target.document)
      if (list) list.push({ citing, site })
      else incoming.set(site.target.document, [{ citing, site }])
    }
    const order = tree ? tree.order.map(node => node.id) : [...documents.keys()]
    const scanned = [...this.#files.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([path, state]): ScannedDocument => state.entry
      ? { id: state.entry.id, path, title: state.entry.title.trim() || dirOf(path) || path, placement: { parent: state.entry.placement?.parent ?? null, rank: state.entry.placement?.rank ?? '' }, schemaVersion: state.entry.schemaVersion }
      : { id: `path:${path}`, path, title: dirOf(path) || path, placement: { parent: null, rank: '' }, schemaVersion: undefined, problem: 'not a document' })
    return { documents, order, scanned, ...tree ? { tree } : {}, incoming }
  }

  #now(): Derived {
    if (!this.#derived) throw new Error('document-index-not-ready')
    return this.#derived
  }

  /** The documents in the workspace (not in the trash) and the tree their placements make. */
  scan(): { documents: Map<DocumentId, IndexEntry>, tree?: PlacementTree, order: DocumentId[] } {
    const { documents, tree, order } = this.#now()
    return { documents, ...tree ? { tree } : {}, order }
  }

  /** Every trashed document by ID, the ones trashed along with an ancestor included. */
  trashed(): Map<DocumentId, TrashedEntry> {
    this.#now()
    return this.#trash
  }

  /** The whole document by ID, read from its file (in the workspace or in the trash). */
  async read(id: DocumentId): Promise<{ document: PresmiumDocument, dir: string, trashed: boolean } | undefined> {
    const entry = this.#now().documents.get(id) ?? this.#trash.get(id)
    if (!entry) return undefined
    try {
      const document = parseDocument(await readFile(join(this.#config.root, entry.dir, DOCUMENT_ENTRY), 'utf8'))
      return document && document.id === id ? { document, dir: entry.dir, trashed: !this.#now().documents.has(id) } : undefined
    } catch { return undefined }
  }

  tree(): DocumentTree {
    const derived = this.#now()
    if (derived.clientTree) return derived.clientTree
    const { documents, tree } = derived
    const nodes: Record<DocumentId, TreeNode> = {}
    if (!tree) {
      for (const entry of documents.values()) nodes[entry.id] = { id: entry.id, title: entry.title, path: entry.dir, parent: null, rank: entry.placement?.rank ?? '', depth: 0, children: [] }
      return derived.clientTree = { roots: Object.keys(nodes), nodes, trash: [] }
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
    const trash: TrashEntry[] = [...this.#trash.values()].filter(entry => !entry.record.with).map(entry => ({ id: entry.id, title: entry.title, deletedAt: entry.record.deletedAt, from: entry.record.from, parent: entry.record.parent, children: entry.record.children }))
    trash.sort((a, b) => a.deletedAt < b.deletedAt ? 1 : a.deletedAt > b.deletedAt ? -1 : 0)
    return derived.clientTree = { roots: [...tree.children.get(null) ?? []], nodes, trash }
  }

  /** The titles of the document's ancestors, root first. */
  ancestors(id: DocumentId): string[] {
    const { tree } = this.#now()
    return tree && tree.byId.has(id) ? tree.ancestors(id).map(node => node.title) : []
  }

  /** The current title of a reference's target, or undefined when the document, page or block is gone (or trashed, with `live`). */
  titleOf(target: ReferenceTarget, live = false): string | undefined {
    const entry = this.#now().documents.get(target.document) ?? (live ? undefined : this.#trash.get(target.document))
    if (!entry) return undefined
    if (target.block !== undefined) return entry.blocks.get(target.block)
    if (target.section !== undefined) return entry.pages.get(target.section)
    return entry.title
  }

  links(id: DocumentId): DocumentLinks {
    const { documents, incoming } = this.#now()
    const own = documents.get(id) ?? this.#trash.get(id)
    if (!own) return { document: id, incoming: [], outgoing: [] }
    const outgoing: OutgoingLink[] = own.sites.map((site) => {
      const title = this.titleOf(site.target)
      const trashed = !documents.has(site.target.document) && this.#trash.has(site.target.document)
      return { kind: site.kind, target: site.target, title: site.label ?? title ?? site.fallback ?? site.target.document, missing: title === undefined, ...trashed ? { trashed: true } : {} }
    })
    const cited: DocumentCitation[] = (incoming.get(id) ?? []).map(({ citing, site }) => ({
      kind: site.kind, document: citing.id, title: citing.title, ...site.section !== undefined ? { section: site.section } : {}, block: site.block,
      excerpt: site.kind === 'embed' ? (site.target.block !== undefined ? own.blocks.get(site.target.block) ?? '' : '') : site.excerpt,
    }))
    return { document: id, incoming: cited, outgoing }
  }

  /** Titles first (in tree order), then page titles and block text; the text was made lowercase when it was indexed. */
  search(query: string, limit: number): DocumentSearchHit[] {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const { documents, order } = this.#now()
    const hits: DocumentSearchHit[] = []
    for (const id of order) {
      if (hits.length >= limit) return hits
      const entry = documents.get(id)
      if (entry?.search.title.includes(q)) hits.push({ id, title: entry.title, ancestors: this.ancestors(id), match: 'title' })
    }
    const titled = new Set(hits.map(hit => hit.id))
    for (const id of order) {
      if (hits.length >= limit) break
      const entry = documents.get(id)
      if (!entry || titled.has(id) || !entry.search.all.includes(q)) continue
      const page = entry.search.pages.find(page => page.lower.includes(q))
      const block = page ? undefined : entry.search.blocks.find(block => block.lower.includes(q))
      if (!page && !block) continue
      hits.push({ id, title: entry.title, ancestors: this.ancestors(id), match: 'content', excerpt: page ? page.title : sentenceOf(block!.text, block!.lower.indexOf(q)), ...page ? { section: page.id } : block!.section !== undefined ? { section: block!.section, block: block!.id } : { block: block!.id } })
    }
    return hits
  }

  preview(id: DocumentId, target: { section?: SectionId, block?: BlockId }): DocumentPreview {
    const { documents, incoming } = this.#now()
    const entry = documents.get(id) ?? this.#trash.get(id)
    if (!entry) return { id, title: '', ancestors: [], excerpt: '', pages: 0, steps: 0, citedBy: 0, missing: true }
    const trashed = !documents.has(id)
    const missing = (target.block !== undefined && !entry.blocks.has(target.block)) || (target.section !== undefined && !entry.pages.has(target.section))
    const excerpt = missing ? '' : target.block !== undefined ? entry.blocks.get(target.block)! : target.section !== undefined ? entry.pageExcerpts.get(target.section) ?? '' : entry.excerpt
    return {
      id,
      title: (target.block !== undefined ? entry.blocks.get(target.block) : target.section !== undefined ? entry.pages.get(target.section) : undefined) ?? entry.title,
      ancestors: trashed ? [] : this.ancestors(id),
      excerpt,
      pages: entry.pages.size,
      steps: entry.steps,
      citedBy: new Set((incoming.get(id) ?? []).map(item => item.citing.id)).size,
      ...trashed ? { trashed: true } : {},
      ...missing ? { missing: true } : {},
    }
  }

  async embedSource(id: DocumentId, block: BlockId): Promise<EmbedSource> {
    const located = await this.read(id)
    const blocks = located && blockSubtree(located.document, block)
    if (!located || !blocks) return { document: id, title: located?.document.metadata.title ?? '', block, missing: true, ...located?.trashed ? { trashed: true } : {} }
    const { document } = located
    const root = blocks[block]!
    const used = Object.values(blocks).flatMap(item => item.type === 'image' && item.assetId && Object.hasOwn(document.assets, item.assetId) ? [item.assetId] : [])
    // Relative to the workspace routes, as the client reaches the document's own assets.
    const assets = located.trashed ? {} : Object.fromEntries(used.map(asset => [asset, `document/asset?${new URLSearchParams({ document: located.dir, asset })}`]))
    const states = root.type === 'component' ? document.definitions[root.definitionId]?.states.map(state => state.id) : undefined
    return { document: id, title: document.metadata.title, block, blocks, ...Object.keys(assets).length ? { assets } : {}, ...states ? { states } : {}, ...located.trashed ? { trashed: true } : {} }
  }

  /** The documents whose references may show an outdated fallback after the titles of `changed` changed: those citing them, and themselves. */
  citing(changed: DocumentId[]): IndexEntry[] {
    const { documents, incoming } = this.#now()
    const out = new Map<DocumentId, IndexEntry>()
    for (const id of changed) {
      const own = documents.get(id)
      if (own?.sites.some(site => site.kind === 'reference')) out.set(id, own)
      for (const { citing, site } of incoming.get(id) ?? []) if (site.kind === 'reference') out.set(citing.id, citing)
    }
    return [...out.values()]
  }

  /** Called with no argument whenever the tree or the trash has changed. */
  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }

  /** Called with the documents whose titles (document, pages or blocks) changed. */
  onTitles(listener: (changed: DocumentId[]) => void): () => void {
    this.#titleListeners.add(listener)
    return () => { this.#titleListeners.delete(listener) }
  }
}

/** The sentence of `text` around `at`, at most about 120 characters. */
function sentenceOf(text: string, at: number): string {
  const ends = /[.!?。！？；;\n]/
  let start = at, end = at
  while (start > 0 && !ends.test(text[start - 1]!)) start--
  while (end < text.length && !ends.test(text[end]!)) end++
  const sentence = text.slice(start, Math.min(text.length, end + 1)).trim()
  return [...sentence].length <= 120 ? sentence : `${[...sentence].slice(0, 119).join('')}…`
}
