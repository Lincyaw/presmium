import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { copyEmbeddedBlock, DOCUMENT_ENTRY, withReferenceFallbacks, freshDocumentId, hasRole, isRecord, ranksBetween, validateDocument } from '@lincyaw/kernel'
import type { BlockId, DocumentId, Member, PresmiumDocument, TreeOperation, TreeOperationResult } from '@lincyaw/kernel'
import { isWithin } from '../domain/paths.ts'
import { effectiveContent, isDocumentDir } from './config.ts'
import type { WorkspaceConfig } from './config.ts'
import { TRASH_DIR, TRASH_RECORD } from './document-index.ts'
import type { DocumentIndex, TrashRecord } from './document-index.ts'
import { documentsDiff } from './document-operations.ts'
import type { DocumentsChange } from './document-operations.ts'
import { RequestError } from './errors.ts'
import { lockedError } from './locks.ts'
import type { DocumentLocks } from './locks.ts'
import type { Revisions } from './revisions.ts'
import { DEFAULT_TEMPLATE, listTemplates } from './templates.ts'
import { makeDocumentDir } from './writer.ts'
import type { DocumentWriter } from './writer.ts'

/** Where new documents are created, one folder each. */
export const NEW_DOCUMENTS_DIR = 'docs'
const TITLE_MAX = 200
/** Settings a document created under a parent leaves to it (see the inherited settings in docs/ir.md). */
const INHERITED_METADATA = ['lang', 'plugins', 'presmium', 'renderers', 'execute', 'checks'] as const
const AUTOMATIC_TRAILER = 'Presmium-Automatic'
/** How long titles must stay the same before references to them are updated. */
const TITLES_SETTLE_MS = 2000
/** The author of the revisions Presmium records on its own (reference titles brought up to date). */
const AUTOMATIC_MEMBER: Member = { id: 'presmium', name: 'Presmium', roles: ['owner'] }

export interface TreeOperationsOptions {
  config: WorkspaceConfig
  index: DocumentIndex
  writer: DocumentWriter
  locks: DocumentLocks
  revisions?: Revisions
  /** Documents were added or removed. */
  changed(change: DocumentsChange): Promise<void> | void
  /** Documents (by folder) changed title or place without any being added or removed. */
  placed?(dirs: string[]): Promise<void> | void
  warn?(message: string): void
}

/** The undo log of one operation: what it moved, wrote and created, undone in reverse when it fails. */
class Journal {
  readonly #root: string
  readonly #before: (paths: string[]) => Promise<void>
  readonly #undo: (() => void)[] = []
  readonly #after: (() => void)[] = []
  readonly paths = new Set<string>()
  /** `before` records the files' state before they change, so the revision shows the change (the local history's baseline). */
  constructor(root: string, before: (paths: string[]) => Promise<void>) { this.#root = root; this.#before = before }
  #abs(path: string) { return join(this.#root, path) }
  async #touch(...paths: string[]) {
    const fresh = paths.filter(path => !this.paths.has(path))
    if (fresh.length) await this.#before(fresh)
    for (const path of fresh) this.paths.add(path)
  }
  async write(path: string, content: string) {
    await this.#touch(path)
    const file = this.#abs(path), before = existsSync(file) ? readFileSync(file) : undefined
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
    this.#undo.push(() => { if (before) writeFileSync(file, before); else rmSync(file, { force: true }) })
  }
  async move(from: string, to: string) {
    await this.#touch(from, to)
    const target = this.#abs(to)
    if (existsSync(target)) await this.discard(to)
    mkdirSync(dirname(target), { recursive: true })
    renameSync(this.#abs(from), target)
    this.#undo.push(() => renameSync(target, this.#abs(from)))
  }
  async created(path: string) {
    await this.#touch(path)
    this.#undo.push(() => rmSync(this.#abs(path), { recursive: true, force: true }))
  }
  async copyFile(from: string, to: string) {
    const target = this.#abs(to)
    if (existsSync(target)) return
    await this.created(to)
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(this.#abs(from), target)
  }
  /** Removed for good only once the operation is recorded; until then it waits beside the workspace's state. */
  async discard(path: string) {
    await this.#touch(path)
    const parked = join(this.#root, '.presmium', `discarded-${randomBytes(6).toString('hex')}`)
    mkdirSync(dirname(parked), { recursive: true })
    renameSync(this.#abs(path), parked)
    this.#undo.push(() => renameSync(parked, this.#abs(path)))
    this.#after.push(() => rmSync(parked, { recursive: true, force: true }))
  }
  rollback() { for (const undo of this.#undo.reverse()) { try { undo() } catch { /* Every other step is still undone. */ } } }
  finish() { for (const done of this.#after) { try { done() } catch { /* A leftover in .presmium is harmless. */ } } }
}

const slugOf = (title: string) => title.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'document'

/**
 * The workspace's tree operations (docs/authoring-actions.md): each is atomic, the documents it changes are written
 * together and recorded as one revision, under the documents' locks. Folders are never moved by a move or rename;
 * only trash and restore move a document's folder, to `.trash/<id>/` and back.
 */
export class TreeOperations {
  readonly #options: TreeOperationsOptions
  /** Documents whose titles changed, waiting for them to settle before the references to them are updated. */
  readonly #titled = new Set<DocumentId>()
  #titleTimer?: ReturnType<typeof setTimeout>
  #refreshing = false
  #stop: () => void

  constructor(options: TreeOperationsOptions) {
    this.#options = options
    this.#stop = options.index.onTitles((changed) => {
      for (const id of changed) this.#titled.add(id)
      clearTimeout(this.#titleTimer)
      this.#titleTimer = setTimeout(() => { void this.refreshFallbacks() }, TITLES_SETTLE_MS)
      this.#titleTimer.unref?.()
    })
  }

  close(): void {
    this.#stop()
    clearTimeout(this.#titleTimer)
  }

  /** The document folders of the workspace, from the index. */
  #dirs(): string[] {
    return [...this.#options.index.scan().documents.values()].map(entry => entry.dir)
  }

  get #root() { return this.#options.config.root }

  #read(dir: string): PresmiumDocument {
    try { return JSON.parse(readFileSync(join(this.#root, dir, DOCUMENT_ENTRY), 'utf8').replace(/^﻿/, '')) as PresmiumDocument }
    catch { throw new RequestError(422, 'document-invalid') }
  }

  async #write(journal: Journal, dir: string, document: PresmiumDocument) {
    const checked = validateDocument(document)
    if (!checked.document || checked.issues.some(issue => issue.severity === 'error')) throw new RequestError(422, 'document-invalid', { issues: checked.issues.filter(issue => issue.severity === 'error').slice(0, 3) })
    await journal.write(`${dir}/${DOCUMENT_ENTRY}`, `${JSON.stringify(document, null, 2)}\n`)
  }

  #live(id: DocumentId) {
    const found = this.#options.index.scan().documents.get(id)
    if (!found) throw new RequestError(404, 'tree.not-found', { id })
    return found
  }

  /** The rank between `after` (or the start) and the sibling following it, among `parent`'s children other than `moving`. */
  #rankAfter(parent: DocumentId | null, after: DocumentId | null | undefined, moving?: DocumentId): string {
    const { tree, documents } = this.#options.index.scan()
    const siblings = (tree?.children.get(parent) ?? []).filter(id => id !== moving)
    const rank = (id: DocumentId | undefined) => id === undefined ? null : documents.get(id)?.placement.rank || null
    if (after === null || after === undefined) return ranksBetween(null, rank(siblings[0]), 1)[0]!
    const at = siblings.indexOf(after)
    if (at < 0) throw new RequestError(400, 'tree.not-found', { after })
    return ranksBetween(rank(after), rank(siblings[at + 1]), 1)[0]!
  }

  #freshDir(title: string): string {
    const taken = this.#dirs()
    const base = `${NEW_DOCUMENTS_DIR}/${slugOf(title)}`
    for (let n = 1; ; n++) {
      const dir = n === 1 ? base : `${base}-${n}`
      if (!existsSync(join(this.#root, dir)) && isDocumentDir(this.#options.config, dir) && !taken.some(other => other !== '' && (isWithin(dir, other) || isWithin(other, dir)))) return dir
    }
  }

  #title(value: string): string {
    const title = value.replace(/\s+/g, ' ').trim()
    if (!title) throw new RequestError(400, 'tree.title-empty')
    return [...title].slice(0, TITLE_MAX).join('')
  }

  /** The documents below `id` in tree order, deepest last. */
  #descendants(id: DocumentId): DocumentId[] {
    const { tree } = this.#options.index.scan()
    const out: DocumentId[] = []
    const walk = (at: DocumentId) => { for (const child of tree?.children.get(at) ?? []) { out.push(child); walk(child) } }
    walk(id)
    return out
  }

  /**
   * Runs the operation's changes under the documents' locks and the history's lock, then records them as one revision;
   * on any failure every change is undone and nothing is recorded.
   */
  async #run(kind: TreeOperation['type'], locked: string[], member: Member, origin: 'editor' | 'agent', work: (journal: Journal) => Promise<{ summary: string, body?: string, documents: DocumentId[], created?: DocumentId, converted?: TreeOperationResult['converted'], toTopLevel?: TreeOperationResult['toTopLevel'] }>, automatic = false): Promise<TreeOperationResult> {
    const { locks, revisions, index } = this.#options
    await index.ready()
    const before = this.#dirs()
    const execute = async () => {
      const claim = locks.claimAll(locked, `document:tree-${kind}`)
      if ('holder' in claim) throw lockedError(claim.document, claim.holder)
      const journal = new Journal(this.#root, async paths => { await revisions?.checkpoint(paths) })
      try {
        const done = await work(journal)
        const paths = [...journal.paths]
        const revision = revisions ? await revisions.commitWhileLocked({ paths, summary: done.summary, body: done.body ?? '', origin: { kind: origin, member }, ...automatic ? { trailers: [[AUTOMATIC_TRAILER, 'reference-titles']] } : {} }) : undefined
        journal.finish()
        return { ...done, revision: revision?.id, paths: [...journal.paths], dirs: [...locked, ...[...journal.paths].map(path => path.endsWith(`/${DOCUMENT_ENTRY}`) ? path.slice(0, -DOCUMENT_ENTRY.length - 1) : path)] }
      } catch (error) {
        journal.rollback()
        throw error
      } finally { claim.release() }
    }
    const done = revisions ? await revisions.transaction(execute) : await execute()
    // Only the files and folders this operation changed are read again; no walk of the workspace.
    await index.changed(done.paths)
    const change = documentsDiff(before, this.#dirs())
    if (change.added.length || change.removed.length) await this.#options.changed(change)
    else await this.#options.placed?.(done.dirs)
    return {
      tree: this.#options.index.tree(),
      ...done.created ? { created: done.created } : {},
      revisions: done.revision ? done.documents.map(document => ({ document, revision: done.revision! })) : [],
      ...done.converted?.length ? { converted: done.converted } : {},
      ...done.toTopLevel?.length ? { toTopLevel: done.toTopLevel } : {},
    }
  }

  async apply(operation: TreeOperation, member: Member, origin: 'editor' | 'agent' = 'editor'): Promise<TreeOperationResult> {
    if (!hasRole(member, 'editor')) throw new RequestError(403, 'authoring-permission-denied')
    if (this.#options.config.singleDeck) throw new RequestError(409, 'tree.single-document')
    const { index } = this.#options
    switch (operation.type) {
      case 'create': {
        const title = this.#title(operation.title)
        if (operation.parent !== null) this.#live(operation.parent)
        const dir = this.#freshDir(title)
        return this.#run('create', [dir], member, origin, async (journal) => {
          const templates = listTemplates(this.#options.config)
          const template = templates.includes(DEFAULT_TEMPLATE) ? DEFAULT_TEMPLATE : templates[0]
          if (!template) throw new RequestError(409, 'tree.template-missing')
          const id = freshDocumentId(new Set(index.scan().documents.keys()))
          makeDocumentDir(this.#root, dir)
          await journal.created(dir)
          await this.#options.writer.template(dir, template, title, id)
          const document = this.#read(dir)
          document.placement = { parent: operation.parent, rank: this.#rankAfter(operation.parent, operation.after) }
          if (operation.parent !== null) for (const field of INHERITED_METADATA) delete document.metadata[field]
          await this.#write(journal, dir, document)
          return { summary: `Create document ${title}`, body: `Folder: ${dir}`, documents: [id], created: id }
        })
      }
      case 'move': {
        const moved = this.#live(operation.id)
        if (operation.parent !== null) {
          this.#live(operation.parent)
          if (operation.parent === operation.id || this.#descendants(operation.id).includes(operation.parent)) throw new RequestError(409, 'tree.cycle')
        }
        return this.#run('move', [moved.dir], member, origin, async (journal) => {
          const document = this.#read(moved.dir)
          document.placement = { parent: operation.parent, rank: this.#rankAfter(operation.parent, operation.after, operation.id) }
          await this.#write(journal, moved.dir, document)
          const under = operation.parent === null ? 'to the top level' : `under ${index.scan().documents.get(operation.parent)?.title ?? operation.parent}`
          return { summary: `Move document ${document.metadata.title} ${under}`, documents: [operation.id] }
        })
      }
      case 'rename': {
        const title = this.#title(operation.title)
        const renamed = this.#live(operation.id)
        return this.#run('rename', [renamed.dir], member, origin, async (journal) => {
          const document = this.#read(renamed.dir)
          const was = document.metadata.title
          document.metadata.title = title
          await this.#write(journal, renamed.dir, document)
          return { summary: `Rename document ${was} to ${title}`, documents: [operation.id] }
        })
      }
      case 'duplicate': {
        const original = this.#live(operation.id)
        const english = (effectiveContent(this.#options.config, original.dir, this.#read(original.dir)).metadata.lang ?? '').startsWith('en')
        const title = [...`${original.title}${english ? ' (copy)' : ' 副本'}`].slice(0, TITLE_MAX).join('')
        const dir = this.#freshDir(title)
        return this.#run('duplicate', [dir], member, origin, async (journal) => {
          const id = freshDocumentId(new Set(index.scan().documents.keys()))
          makeDocumentDir(this.#root, dir)
          await journal.created(dir)
          await this.#options.writer.copy(original.dir, dir, id, title)
          return { summary: `Duplicate document ${original.title}`, body: `Folder: ${dir}`, documents: [id], created: id }
        })
      }
      case 'trash': {
        const root = this.#live(operation.id)
        const ids = [operation.id, ...this.#descendants(operation.id)]
        const found = ids.map(id => this.#live(id))
        return this.#run('trash', found.map(item => item.dir), member, origin, async (journal) => {
          const deletedAt = new Date().toISOString()
          for (const item of found) {
            const record: TrashRecord = { deletedAt, from: item.dir, parent: item.placement.parent, rank: item.placement.rank, children: item.id === operation.id ? ids.slice(1) : [], ...item.id === operation.id ? {} : { with: operation.id } }
            const target = `${TRASH_DIR}/${item.id}`
            await journal.move(item.dir, target)
            await journal.write(`${target}/${TRASH_RECORD}`, `${JSON.stringify(record, null, 2)}\n`)
          }
          return { summary: `Move document ${root.title} to the trash`, body: ids.length > 1 ? `With: ${found.slice(1).map(item => item.title).join(', ')}` : '', documents: ids }
        })
      }
      case 'restore': {
        const trashed = index.trashed()
        const entry = trashed.get(operation.id)
        if (!entry) throw new RequestError(404, 'tree.trash-not-found', { id: operation.id })
        const ids = [operation.id, ...entry.record.children.filter(id => trashed.get(id)?.record.with === operation.id)]
        return this.#run('restore', [], member, origin, async (journal) => {
          const live = index.scan().documents
          const taken = this.#dirs()
          const restored = new Set(ids)
          const toTopLevel: NonNullable<TreeOperationResult['toTopLevel']> = []
          for (const id of ids) {
            const item = trashed.get(id)!
            const free = (dir: string) => isDocumentDir(this.#options.config, dir) && !existsSync(join(this.#root, dir)) && !taken.some(other => other !== '' && (isWithin(dir, other) || isWithin(other, dir)))
            const dir = free(item.record.from) ? item.record.from : this.#freshDir(item.title)
            await journal.move(item.dir, dir)
            taken.push(dir)
            const record = `${dir}/${TRASH_RECORD}`
            await journal.discard(record)
            const parent = item.record.parent
            if (parent !== null && !live.has(parent) && !restored.has(parent)) {
              const document = this.#read(dir)
              document.placement = { parent: null, rank: this.#rankAfter(null, (index.scan().tree?.children.get(null) ?? []).at(-1)) }
              await this.#write(journal, dir, document)
              toTopLevel.push({ document: id, parent: trashed.has(parent) ? 'trashed' : 'missing' })
            }
          }
          return { summary: `Restore document ${entry.title}`, documents: ids, toTopLevel }
        })
      }
      case 'purge': {
        const trashed = index.trashed()
        const entry = trashed.get(operation.id)
        if (!entry) throw new RequestError(404, 'tree.trash-not-found', { id: operation.id })
        const ids = [operation.id, ...entry.record.children.filter(id => trashed.get(id)?.record.with === operation.id)]
        const purged = new Set(ids)
        const hosts = [...index.scan().documents.values()].filter(host => host.sites.some(site => site.kind === 'embed' && purged.has(site.target.document)))
        return this.#run('purge', hosts.map(host => host.dir), member, origin, async (journal) => {
          const converted: { document: DocumentId, block: BlockId }[] = []
          for (const host of hosts) {
            let document = this.#read(host.dir)
            for (const site of host.sites) {
              if (site.kind !== 'embed' || !purged.has(site.target.document)) continue
              const source = await index.read(site.target.document)
              if (!source) throw new RequestError(409, 'embed.missing')
              document = await this.#copyEmbed(journal, host.dir, document, site.block, source.dir, source.document)
              converted.push({ document: host.id, block: site.block })
            }
            await this.#write(journal, host.dir, document)
          }
          for (const id of ids) await journal.discard(trashed.get(id)!.dir)
          return { summary: `Delete document ${entry.title} for good`, body: converted.length ? `Synced blocks converted to copies in: ${[...new Set(hosts.map(host => host.title))].join(', ')}` : '', documents: [...ids, ...new Set(converted.map(item => item.document))], converted }
        })
      }
      case 'embed-to-copy': {
        const host = this.#live(operation.document)
        const block = this.#read(host.dir).blocks[operation.block]
        if (block?.type !== 'embed') throw new RequestError(404, 'tree.not-found', { block: operation.block })
        const located = await index.read(block.source.document)
        if (!located || !Object.hasOwn(located.document.blocks, block.source.block)) throw new RequestError(409, 'embed.missing')
        return this.#run('embed-to-copy', [host.dir], member, origin, async (journal) => {
          const document = await this.#copyEmbed(journal, host.dir, this.#read(host.dir), operation.block, located.dir, located.document)
          await this.#write(journal, host.dir, document)
          return { summary: `Convert a synced block from ${located.document.metadata.title} to a copy`, documents: [operation.document] }
        })
      }
    }
  }

  /** The host with the synced block replaced by a copy; the files it needs are copied into the host's folder. */
  async #copyEmbed(journal: Journal, hostDir: string, host: PresmiumDocument, block: BlockId, sourceDir: string, source: PresmiumDocument): Promise<PresmiumDocument> {
    const hostRoot = join(this.#root, hostDir), sourceRoot = join(this.#root, sourceDir)
    const located = (location: string): string => {
      if (/^[a-z][a-z0-9+.-]*:/i.test(location) || location.startsWith('/')) return location
      const file = resolve(sourceRoot, location)
      const inside = relative(sourceRoot, file)
      // A file outside the source's folder stays where it is; the copy points at it from the host.
      if (inside.startsWith('..') || inside.startsWith(sep)) return relative(hostRoot, file).split(sep).join('/')
      const plain = inside.split(sep).join('/')
      const same = join(hostRoot, plain)
      if (!existsSync(same) || (existsSync(file) && readFileSync(same).equals(readFileSync(file)))) return plain
      return `synced/${source.id.slice(0, 8)}/${plain}`
    }
    const copied = copyEmbeddedBlock(host, block, source, located)
    for (const file of copied.files) {
      const from = resolve(sourceRoot, file.from), to = resolve(hostRoot, file.to)
      if (from === to || !existsSync(from) || !isWithin(relative(this.#root, to).split(sep).join('/'), hostDir)) continue
      await journal.copyFile(relative(this.#root, from).split(sep).join('/'), relative(this.#root, to).split(sep).join('/'))
    }
    return copied.document
  }

  /**
   * Brings reference fallbacks up to date in the documents that cite a title which changed (and in the documents whose
   * titles changed, for their own new references), one automatic revision per document that needs it; a busy (locked)
   * document is tried again with the next change. Runs once titles have not changed for a moment, so typing a title
   * does not record a revision per keystroke, and reads only those documents.
   */
  async refreshFallbacks(): Promise<void> {
    if (this.#refreshing || this.#options.config.singleDeck || !this.#titled.size) return
    this.#refreshing = true
    const { index } = this.#options
    try {
      await index.ready()
      const candidates = index.citing([...this.#titled])
      this.#titled.clear()
      for (const item of candidates) {
        if (this.#options.locks.holder(item.dir) !== undefined) continue
        let current: PresmiumDocument
        try { current = this.#read(item.dir) } catch { continue }
        if (current.id !== item.id || withReferenceFallbacks(current, target => index.titleOf(target)) === current) continue
        try {
          await this.#run('rename', [item.dir], AUTOMATIC_MEMBER, 'editor', async (journal) => {
            const latest = this.#read(item.dir)
            if (!isRecord(latest) || latest.id !== item.id) throw new RequestError(409, 'document-version-changed')
            const document = withReferenceFallbacks(latest, target => index.titleOf(target))
            if (document !== latest) await this.#write(journal, item.dir, document)
            return { summary: (latest.metadata.lang ?? '').startsWith('en') ? 'Update the titles of references' : '更新引用的标题', documents: [item.id] }
          }, true)
        } catch (error) {
          this.#options.warn?.(`the reference titles in ${item.dir} were not updated: ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    } finally { this.#refreshing = false }
  }
}
