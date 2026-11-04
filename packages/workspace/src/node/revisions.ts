import { randomUUID } from 'node:crypto'
import { closeSync, constants, existsSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import type { DocumentFileChange, HistoryRevision, Member, RevertResult, Revision, RevisionsAnswer, RevisionService, UncommittedFile } from '@lincyaw/kernel'
import { CHANGES_MAX_BYTES, LOCAL_AUTHOR, SOURCE_MAX_BYTES } from '@lincyaw/kernel'
import { leavesRoot } from '../domain/paths.ts'
import { commitMessage, memberAddress, originOf } from '../domain/commit-message.ts'
import type { CommitOrigin } from '../domain/commit-message.ts'
import type { WorkspaceConfig } from './config.ts'
import { isDocumentDir } from './config.ts'
import { RequestError } from './errors.ts'
import type { Git } from './git.ts'
import { documentDirOf, isGeneratedPath, makeDocumentDir, writeChanges } from './writer.ts'
import type { DocumentWriter } from './writer.ts'
import { revisionDigest, revisionFiles } from './revision-files.ts'
import type { RevisionFile } from './revision-files.ts'

const FIELD = '\x00'
const RECORD = '\x1e'
const FORMAT = '--format=%x1e%H%x00%an <%ae>%x00%aI%x00%B%x00'

interface LogEntry {
  id: string
  author: string
  date: string
  message: string
  files: string[]
  root?: true
}

function parseLog(output: string): LogEntry[] {
  return output.split(RECORD).filter(Boolean).map(record => {
    const [id = '', author = '', date = '', message = '', ...paths] = record.split(FIELD)
    const first = paths.findIndex(path => path !== '')
    // Git inserts one LF between the formatted header and its NUL-delimited paths.
    if (first >= 0 && paths[first]!.startsWith('\n')) paths[first] = paths[first]!.slice(1)
    return { id, author, date, message: message.trim(), files: paths.filter(Boolean) }
  })
}

function revertedOf(message: string): string | undefined {
  return originOf(message)?.revert ?? /This reverts commit ([0-9a-f]{7,64})/.exec(message)?.[1]
}

function finder(entries: LogEntry[]): (id: string) => LogEntry | undefined {
  return id => entries.find(entry => entry.id === id || (id.length >= 7 && entry.id.startsWith(id)))
}

function redoPredicate(entries: LogEntry[]): (entry: LogEntry) => boolean {
  const find = finder(entries)
  const known = new Map<string, boolean>()
  const redo = (entry: LogEntry): boolean => {
    let found = known.get(entry.id)
    if (found !== undefined) return found
    known.set(entry.id, false)
    const reverted = revertedOf(entry.message)
    const target = reverted === undefined ? undefined : find(reverted)
    found = target !== undefined && revertedOf(target.message) !== undefined && !redo(target)
    known.set(entry.id, found)
    return found
  }
  return redo
}

export type UndoTargets = Pick<RevisionsAnswer, 'undo' | 'redo'>

/**
 * The change the next undo takes back and the undo the next redo takes back. Over the Presmium revisions, oldest
 * first: a change goes on the done stack and empties the undone one; an undo takes its change off done and goes on
 * undone; a redo takes its undo off undone and puts the change back on done. A document operation empties both.
 */
function undoTargets(entries: LogEntry[]): UndoTargets {
  const find = finder(entries)
  const isRedo = redoPredicate(entries)
  const changeOf = (entry: LogEntry): string => {
    let current = entry
    for (let hops = 0; hops < entries.length; hops++) {
      const reverted = revertedOf(current.message)
      const next = reverted === undefined ? undefined : find(reverted)
      if (!next) break
      current = next
    }
    return current.id
  }
  const done: string[] = []
  const undone: string[] = []
  const drop = (stack: string[], id: string) => {
    const at = stack.lastIndexOf(id)
    if (at >= 0) stack.splice(at, 1)
  }
  for (const entry of [...entries].reverse()) {
    const origin = originOf(entry.message)
    if (!origin) continue
    if (entry.root) { done.length = 0; undone.length = 0; continue }
    if (origin.operation) {
      done.length = 0
      undone.length = 0
      continue
    }
    const reverted = revertedOf(entry.message)
    const target = reverted === undefined ? undefined : find(reverted)
    if (!target) {
      done.push(entry.id)
      undone.length = 0
    } else if (isRedo(entry)) {
      drop(undone, target.id)
      done.push(changeOf(target))
    } else {
      drop(done, changeOf(target))
      undone.push(entry.id)
    }
  }
  return { ...done.length ? { undo: done.at(-1)! } : {}, ...undone.length ? { redo: undone.at(-1)! } : {} }
}

function listed(entries: LogEntry[], filter: { task?: string, limit?: number }): HistoryRevision[] {
  const revertedBy = new Map<string, string>()
  for (const entry of entries) {
    const reverted = revertedOf(entry.message)
    if (reverted && !revertedBy.has(reverted)) revertedBy.set(reverted, entry.id)
  }
  const isRedo = redoPredicate(entries)
  const revisions = entries.flatMap((entry) => {
    const found = revision(entry, revertedBy.get(entry.id), isRedo(entry))
    return found && (!filter.task || found.origin.task === filter.task) ? [found] : []
  })
  const roots = new Map<string, string>(), parity = new Map<string, boolean>()
  const states = new Map<string, { undone: boolean, target: string }>()
  for (const entry of [...revisions].reverse()) {
    const root = entry.reverts ? roots.get(entry.reverts) : entry.id
    if (!root) continue
    const undone = entry.reverts ? !parity.get(entry.reverts) : false
    roots.set(entry.id, root); parity.set(entry.id, undone)
    states.set(root, { undone, target: undone ? entry.id : root })
  }
  const complete = revisions.map(entry => {
    const state = !entry.reverts && states.get(entry.id)
    return state && entry.revertible !== false ? { ...entry, undone: state.undone, revertTarget: state.target } : entry
  })
  return filter.limit ? complete.slice(0, filter.limit) : complete
}

function revision(entry: LogEntry, revertedBy?: string, redo = false): HistoryRevision | undefined {
  const origin = originOf(entry.message)
  if (!origin) return undefined
  const { revert, coAuthor: _coAuthor, operation, ...plain } = origin
  return {
    id: entry.id,
    message: entry.message,
    author: entry.author,
    date: entry.date,
    origin: plain,
    files: entry.files,
    ...revertedBy ? { revertedBy } : {},
    ...operation ? { operation } : {},
    ...revert ? { reverts: revert } : {},
    ...revert && redo ? { redo: true as const } : {},
    ...entry.root ? { revertible: false as const } : {},
  }
}

interface TreeFile {
  path: string
  mode: string
  oid: string
}

export interface RevisionFiles {
  config: WorkspaceConfig
  writer: DocumentWriter
}

export interface LockedCommit {
  paths: string[]
  summary: string
  body: string
  origin: CommitOrigin
  /** The commit this one undoes. */
  revert?: string
  trailers?: [string, string][]
}

export interface RevisionChanges {
  head?: string
  ref?: string
  index?: Buffer
  indexPath: string
  indexStamp: string
  snapshot: string
  files: UncommittedFile[]
  encoded?: TreeFile[]
  raw: RevisionFile[]
}

export class Revisions implements RevisionService {
  readonly #git: Git
  readonly #files: RevisionFiles

  constructor(git: Git, files: RevisionFiles) {
    this.#git = git
    this.#files = files
  }

  /** Serialize authoring work; commitWhileLocked owns its index changes and rollback. */
  transaction<T>(work: () => Promise<T>): Promise<T> {
    return this.#git.exclusive(work)
  }

  commit(change: { files: string[], message: string, origin: CommitOrigin, trailers?: [string, string][] }): Promise<Revision | undefined> {
    const [summary = '', ...body] = change.message.trim().split('\n')
    return this.transaction(() => this.commitWhileLocked({ paths: change.files, summary, body: body.join('\n'), origin: change.origin, ...change.trailers ? { trailers: change.trailers } : {} }))
  }

  /** Commits the paths; the caller holds the git lock (`Git.exclusive`). */
  async commitWhileLocked(commit: LockedCommit): Promise<Revision | undefined> {
    const unique = [...new Set(commit.paths.map(path => path.replace(/^\.?\/+|\/+$/g, '')).filter(path => path && !leavesRoot(path)))]
    if (unique.length === 0) return undefined
    const captured = await this.observeChanges(unique)
    if (!captured.raw.length) return undefined
    return this.#applyFrozen('commit', await this.freezeCommit(captured), commit)
  }

  /** Exact current raw bytes, HEAD/ref and index observation; never compiles or stages the real index. */
  async observeChanges(roots: string[] = ['']): Promise<RevisionChanges> {
    const before = await this.#changeState(), files = await this.uncommittedFiles(roots)
    const raw = revisionFiles(this.#files.config.root, files.map(file => file.path))
    const after = await this.#changeState()
    if (!this.#sameState(before, after)) throw new RequestError(409, 'changes-state-changed')
    return { ...before, files, raw, snapshot: revisionDigest(JSON.stringify([before.head, before.ref, before.indexStamp, raw.map(file => [file.path, file.mode, file.stamp])])) }
  }

  /** Encode approved raw bytes before an external confirmation; later filters cannot change these blobs. */
  async freezeCommit(captured: RevisionChanges): Promise<RevisionChanges> {
    await this.#verifyChanges(captured)
    const encoded: TreeFile[] = []
    for (const file of captured.raw) {
      const data = file.change
      if (!data) throw new RequestError(409, 'changes-file-unsupported')
      if ('remove' in data) { encoded.push({ path: file.path, mode: '000000', oid: '' }); continue }
      const bytes = 'link' in data ? Buffer.from(data.link) : Buffer.from(data.content)
      const blob = await this.#git.run(['hash-object', '-w', ...'link' in data ? ['--no-filters'] : [`--path=${file.path}`], '--stdin'], {}, bytes)
      if (blob.code !== 0) throw new RequestError(409, 'changes-encoding-failed')
      encoded.push({ path: file.path, mode: file.mode, oid: blob.stdout.toString('utf8').trim() })
    }
    await this.#verifyChanges(captured)
    return { ...captured, encoded }
  }

  /** Caller holds document locks; this is the only Git queue entry for a reviewed changes operation. */
  applyChanges(which: 'commit' | 'discard', captured: RevisionChanges, commit?: LockedCommit, check?: () => void): Promise<Revision | undefined> {
    return this.#git.exclusive(async () => this.#applyFrozen(which, which === 'commit' && !captured.encoded ? await this.freezeCommit(captured) : captured, commit, check))
  }

  async #changeState() {
    const [head, ref, indexName] = await Promise.all([
      this.#git.run(['rev-parse', '--verify', '--quiet', 'HEAD']),
      this.#git.run(['symbolic-ref', '--quiet', 'HEAD']),
      this.#git.output(['rev-parse', '--git-path', 'index']),
    ])
    if (ref.code !== 0 && ref.code !== 1 || head.code !== 0 && !(head.code === 1 && ref.code === 0)) throw new RequestError(409, 'changes-repository-unavailable')
    const indexPath = resolve(this.#git.root, indexName.trim()), index = existsSync(indexPath) ? readFileSync(indexPath) : undefined
    return { ...head.code === 0 ? { head: head.stdout.toString('utf8').trim() } : {}, ...ref.code === 0 ? { ref: ref.stdout.toString('utf8').trim() } : {}, indexPath, index, indexStamp: index ? revisionDigest(index) : 'absent' }
  }

  #sameState(a: Pick<RevisionChanges, 'head' | 'ref' | 'indexStamp'>, b: Pick<RevisionChanges, 'head' | 'ref' | 'indexStamp'>): boolean {
    return a.head === b.head && a.ref === b.ref && a.indexStamp === b.indexStamp
  }

  async #verifyChanges(captured: RevisionChanges, files = true): Promise<void> {
    if (!this.#sameState(captured, await this.#changeState())) throw new RequestError(409, 'changes-state-changed')
    if (files) {
      const current = revisionFiles(this.#files.config.root, captured.raw.map(file => file.path))
      if (JSON.stringify(current.map(file => [file.path, file.mode, file.stamp])) !== JSON.stringify(captured.raw.map(file => [file.path, file.mode, file.stamp]))) throw new RequestError(409, 'changes-state-changed')
    }
  }

  async #applyFrozen(which: 'commit' | 'discard', captured: RevisionChanges, commit?: LockedCommit, check?: () => void): Promise<Revision | undefined> {
    if (!captured.raw.length || captured.raw.some(file => !file.change)) throw new RequestError(409, 'changes-file-unsupported')
    const gitDir = resolve(this.#git.root, (await this.#git.output(['rev-parse', '--git-dir'])).trim())
    if (['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'rebase-merge', 'rebase-apply', 'sequencer'].some(name => existsSync(join(gitDir, name)))
      || (await this.#git.output(['ls-files', '--unmerged', '-z'])).length) throw new RequestError(409, 'changes-repository-busy')
    const lock = `${captured.indexPath}.lock`
    let fd: number
    try { fd = openSync(lock, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600) }
    catch { throw new RequestError(409, 'changes-index-busy') }
    // The review Git guard already excludes *.lock entries; active private indexes must share that lifetime.
    let identity: ReturnType<typeof fstatSync> | undefined
    const work = join(dirname(captured.indexPath), `presmium-index-${randomUUID()}.lock`)
    let installed = false, published = false, wrote = false, created = false, recovery = false
    const restoreIndex = () => {
      if (captured.index) { const previous = join(work, 'previous'); writeFileSync(previous, captured.index, { mode: 0o600 }); renameSync(previous, captured.indexPath) }
      else rmSync(captured.indexPath, { force: true })
    }
    try {
      identity = fstatSync(fd)
      mkdirSync(work, { mode: 0o700 }); created = true
      await this.#verifyChanges(captured); check?.()
      const env = (name: string) => ({ GIT_INDEX_FILE: join(work, name), GIT_LITERAL_PATHSPECS: '1', GIT_OPTIONAL_LOCKS: '0' })
      const next = env('next'), selected = env('selected')
      if (captured.index) writeFileSync(next.GIT_INDEX_FILE, captured.index)
      else await this.#git.output(['read-tree', '--empty'], next)
      await this.#git.output(['read-tree', captured.head ?? '--empty'], selected)
      const base = (await this.#git.output(['write-tree'], selected)).trim()
      const files: TreeFile[] = []
      const targets: DocumentFileChange[] = []
      const encoded = new Map(captured.encoded?.map(file => [file.path, file]))
      let targetBytes = 0
      for (const file of captured.raw) {
        if (which === 'discard') {
          const item = await this.#atTree(captured.head, file.path)
          files.push(item)
          const target = await this.#treeChange(item, CHANGES_MAX_BYTES - targetBytes)
          targetBytes += 'content' in target ? Buffer.byteLength(target.content) : 'link' in target ? Buffer.byteLength(target.link) : 0
          targets.push(target)
        } else {
          const frozen = encoded.get(file.path)
          if (!frozen) throw new RequestError(409, 'changes-encoding-failed')
          files.push(frozen)
        }
      }
      const zero = '0'.repeat(base.length)
      const input = Buffer.from(files.map(file => `${/^0+$/.test(file.mode) ? '0' : file.mode} ${file.oid || zero}\t${relative(this.#git.top, join(this.#files.config.root, file.path)).split(sep).join('/')}\0`).join(''))
      for (const index of [next, selected]) {
        const updated = await this.#git.run(['-C', this.#git.top, 'update-index', '-z', '--index-info'], index, input)
        if (updated.code !== 0) throw new RequestError(409, 'changes-index-update-failed')
      }
      let revision: Revision | undefined
      if (which === 'commit') {
        if (!commit) throw new RequestError(400, 'changes-request-invalid')
        const tree = (await this.#git.output(['write-tree'], selected)).trim()
        if (tree !== base) {
          const member = await this.#author(commit.origin.member), origin = { ...commit.origin, ...member ? { member } : {} }
          const message = withTrailers(commitMessage(commit.summary, commit.body, origin, commit.revert), commit.trailers ?? [])
          const author = member && /^(.*) <([^>]*)>$/.exec(memberAddress(member))
          const hash = (await this.#git.output([...await this.#identity(), 'commit-tree', tree, ...captured.head ? ['-p', captured.head] : [], '-m', message], { ...selected, ...author ? { GIT_AUTHOR_NAME: author[1]!, GIT_AUTHOR_EMAIL: author[2]! } : {} })).trim()
          revision = await this.#revision(hash)
          if (!revision) throw new RequestError(409, 'changes-revision-unavailable')
        }
      }
      // Blobs are already fixed; preserve late working edits while verifying the real index and branch.
      await this.#verifyChanges(captured, which === 'discard'); check?.()
      if (which === 'discard') { wrote = true; await this.#writeChanges(targets) }
      renameSync(next.GIT_INDEX_FILE, captured.indexPath); installed = true
      if (revision) {
        const result = await this.#git.run(['update-ref', captured.ref ?? 'HEAD', revision.id, captured.head ?? zero])
        if (result.code !== 0) throw new RequestError(409, 'changes-state-changed')
        published = true
      }
      return revision
    } catch (error) {
      if (!published) {
        try { if (wrote) await this.#writeChanges(captured.raw.map(file => file.change!)) } catch { recovery = true }
        try { if (installed) restoreIndex() } catch { recovery = true }
        if (recovery) throw new RequestError(500, 'changes-recovery-required')
      }
      throw error
    } finally {
      // Cleanup cannot turn an already published commit into a reported failure.
      try { closeSync(fd) } catch {}
      try {
        const current = lstatSync(lock, { throwIfNoEntry: false })
        if (identity && current?.ino === identity.ino && current.dev === identity.dev) rmSync(lock, { force: true })
      } catch {}
      try { if (created && !recovery) rmSync(work, { recursive: true, force: true }) } catch {}
    }
  }

  async #atTree(head: string | undefined, path: string): Promise<TreeFile> {
    if (!head) return { path, mode: '000000', oid: '' }
    const raw = await this.#git.output(['ls-tree', '-z', head, '--', path], { GIT_LITERAL_PATHSPECS: '1' })
    const entry = raw.split('\0')[0] ?? '', at = entry.indexOf('\t'), meta = entry.slice(0, at).split(' ')
    if (at < 0) return { path, mode: '000000', oid: '' }
    if (!['100644', '100755', '120000'].includes(meta[0] ?? '')) throw new RequestError(409, 'changes-file-unsupported')
    return { path, mode: meta[0]!, oid: meta[2]! }
  }

  async #treeChange(file: TreeFile, maxBytes = CHANGES_MAX_BYTES): Promise<DocumentFileChange> {
    if (/^0+$/.test(file.mode)) return { path: file.path, remove: true }
    const size = Number((await this.#git.output(['cat-file', '-s', file.oid])).trim())
    if (!Number.isSafeInteger(size) || size > maxBytes) throw new RequestError(413, 'changes-selection-too-large')
    const blob = await this.#git.run(['cat-file', 'blob', file.oid])
    if (blob.code !== 0) throw new RequestError(409, 'changes-object-unavailable')
    return file.mode === '120000' ? { path: file.path, link: blob.stdout.toString('utf8') } : { path: file.path, content: blob.stdout, executable: file.mode === '100755' }
  }

  async status(paths: string[] = ['']): Promise<{ branch?: string, uncommitted: number }> {
    const branch = await this.#git.tryOutput(['symbolic-ref', '--quiet', '--short', 'HEAD'])
    return { ...branch.ok ? { branch: branch.output.trim() } : {}, uncommitted: (await this.#statusOf(paths)).length }
  }

  async uncommittedFiles(paths: string[]): Promise<UncommittedFile[]> {
    const specs = paths.map(path => path || '.')
    const status = await this.#statusOf(paths)
    const counts = new Map<string, [number, number]>()
    const numstat = await this.#git.tryOutput(['-c', 'diff.autoRefreshIndex=false', 'diff', '--numstat', '-z', '--no-renames', '--no-ext-diff', '--no-textconv', 'HEAD', '--', ...specs], { GIT_LITERAL_PATHSPECS: '1', GIT_OPTIONAL_LOCKS: '0' })
    if (numstat.ok) {
      for (const entry of numstat.output.split('\0').filter(Boolean)) {
        const [added = '-', removed = '-', ...named] = entry.split('\t'), path = named.join('\t')
        if (added !== '-') counts.set(this.#fromTop(path), [Number(added), Number(removed)])
      }
    }
    return status.map(({ code, path }): UncommittedFile => {
      const kind = code.includes('D') ? 'deleted' : code === '??' || code[0] === 'A' ? 'added' : 'modified'
      const counted = counts.get(path) ?? (kind === 'added' ? lineCount(join(this.#files.config.root, path)) : undefined)
      return { path, kind, ...counted ? { added: counted[0], removed: counted[1] } : {} }
    }).sort((a, b) => a.path.localeCompare(b.path))
  }

  discard(paths: string[]): Promise<void> {
    return this.#git.exclusive(async () => {
      const captured = await this.observeChanges(paths)
      if (captured.raw.length) await this.#applyFrozen('discard', captured)
    })
  }

  async history(filter: { document?: string, task?: string, limit?: number } = {}): Promise<HistoryRevision[]> {
    return listed(await this.#entries(filter.document), filter)
  }

  /** The history and the revisions its next undo and redo take back, which count the document's whole history whatever the limit. */
  async historyWithUndo(filter: { document?: string, task?: string, limit?: number } = {}): Promise<RevisionsAnswer> {
    const entries = await this.#entries(filter.document)
    return { revisions: listed(entries, filter), ...undoTargets(entries) }
  }

  /** The revision the next undo or redo of the document's history takes back, read under the git lock. */
  next(which: keyof UndoTargets, document?: string): Promise<string | undefined> {
    return this.#git.exclusive(async () => undoTargets(await this.#entries(document))[which])
  }

  async head(): Promise<string | undefined> {
    const result = await this.#git.tryOutput(['rev-parse', '--verify', 'HEAD'])
    return result.ok ? result.output.trim() : undefined
  }

  /** Reads one regular historical text blob. The caller enforces document/path policy. */
  async readFile(id: string, path: string, maxBytes: number, document?: string): Promise<Uint8Array> {
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(id) || leavesRoot(path)) throw new RequestError(400, 'history-file-invalid')
    if (!(await this.#git.tryOutput(['merge-base', '--is-ancestor', id, 'HEAD'])).ok) throw new RequestError(404, 'history-revision-not-found')
    const topPath = relative(this.#git.top, resolve(this.#files.config.root, path)).split(sep).join('/')
    const listed = await this.#git.output(['-C', this.#git.top, 'ls-tree', '-z', id, '--', topPath], { GIT_LITERAL_PATHSPECS: '1' })
    const record = listed.split('\0')[0] ?? '', at = record.indexOf('\t'), meta = record.slice(0, at), named = record.slice(at + 1)
    const [mode, type, oid] = meta.split(' ')
    if (named !== topPath || !oid) throw new RequestError(404, 'history-file-not-found')
    if (type !== 'blob' || !['100644', '100755'].includes(mode!)) throw new RequestError(422, 'history-file-not-regular-text')
    if (document !== undefined && await this.ownerAt(id, path) !== document) throw new RequestError(403, 'history-file-outside-document')
    const size = Number((await this.#git.output(['cat-file', '-s', oid])).trim())
    if (!Number.isSafeInteger(size) || size > maxBytes) throw new RequestError(413, 'history-file-too-large')
    const result = await this.#git.run(['cat-file', 'blob', oid])
    if (result.code !== 0 || result.stdout.length !== size) throw new RequestError(409, 'history-file-read-failed')
    return result.stdout
  }

  /** The historical canonical ancestor, shared by reads and history selection. */
  async ownerAt(id: string, path: string): Promise<string | undefined> {
    if (!/^(?:[a-f0-9]{40}|[a-f0-9]{64})(?:\^1)?$/.test(id) || leavesRoot(path)) throw new RequestError(400, 'history-file-invalid')
    return (await this.#owners([{ id, path }]))[0]
  }

  async #owners(files: { id: string, path: string }[]): Promise<(string | undefined)[]> {
    const maxTreeBytes = 4 << 20, queries = new Set<string>()
    const candidates = files.map(({ id, path }) => {
      const parts = path.split('/'), found: { directory: string, query: string }[] = []
      for (let i = parts.length - 1; i >= 0; i--) {
        const directory = parts.slice(0, i).join('/')
        if (!isDocumentDir(this.#files.config, directory)) continue
        const topPath = relative(this.#git.top, resolve(this.#files.config.root, directory)).split(sep).join('/')
        const query = topPath ? `${id}:${topPath}` : `${id}^{tree}`
        found.push({ directory, query }); queries.add(query)
      }
      return found
    })
    const trees = new Map<string, { oid: string, bytes: number }>(), objects = new Map<string, number>(), all = [...queries]
    for (let offset = 0; offset < all.length; offset += 512) {
      const batch = all.slice(offset, offset + 512)
      const result = await this.#git.run(['cat-file', '--batch-check=%(objectname) %(objecttype) %(objectsize)', '-Z'], {}, Buffer.from(batch.join('\0') + '\0'))
      if (result.code !== 0) throw new RequestError(500, 'history-tree-read-failed')
      const lines = result.stdout.toString('utf8').split('\0'); lines.pop()
      if (lines.length !== batch.length) throw new RequestError(500, 'history-tree-read-failed')
      batch.forEach((query, index) => {
        const match = /^([a-f0-9]{40}|[a-f0-9]{64}) tree (\d+)$/.exec(lines[index]!)
        if (!match) return
        const bytes = Number(match[2])
        if (!Number.isSafeInteger(bytes) || bytes > maxTreeBytes) throw new RequestError(413, 'history-tree-too-large')
        trees.set(query, { oid: match[1]!, bytes }); objects.set(match[1]!, bytes)
      })
    }
    const regular = new Map<string, boolean>(), pending = [...objects]
    for (let offset = 0; offset < pending.length;) {
      const batch: [string, number][] = []; let bytes = 0
      while (offset < pending.length && batch.length < 512 && (!batch.length || bytes + pending[offset]![1] <= maxTreeBytes)) { const item = pending[offset++]!; batch.push(item); bytes += item[1] }
      const result = await this.#git.run(['cat-file', '--batch', '-Z'], {}, Buffer.from(batch.map(([oid]) => oid).join('\0') + '\0'))
      if (result.code !== 0) throw new RequestError(500, 'history-tree-read-failed')
      let cursor = 0
      for (const [oid, expectedBytes] of batch) {
        const endHeader = result.stdout.indexOf(0, cursor)
        if (endHeader < 0 || result.stdout.subarray(cursor, endHeader).toString('ascii') !== `${oid} tree ${expectedBytes}`) throw new RequestError(500, 'history-tree-read-failed')
        const start = endHeader + 1, end = start + expectedBytes
        if (result.stdout[end] !== 0) throw new RequestError(500, 'history-tree-read-failed')
        const tree = result.stdout.subarray(start, end), oidBytes = oid.length / 2
        let at = 0, found = false
        while (at < tree.length) {
          const space = tree.indexOf(32, at), zero = tree.indexOf(0, space + 1)
          if (space < at || zero < space || zero + 1 + oidBytes > tree.length) throw new RequestError(500, 'history-tree-read-failed')
          if (tree.subarray(space + 1, zero).toString('utf8') === 'lecture.json') found = ['100644', '100755'].includes(tree.subarray(at, space).toString('ascii'))
          at = zero + 1 + oidBytes
        }
        regular.set(oid, found); cursor = end + 1
      }
      if (cursor !== result.stdout.length) throw new RequestError(500, 'history-tree-read-failed')
    }
    return candidates.map(found => found.find(item => { const tree = trees.get(item.query); return tree && regular.get(tree.oid) })?.directory)
  }

  /** The revert's checks under the git queue without writing: next target, ancestry, conflicts, scope, guard and uncommitted files. */
  checkRevert(id: string, member: Member, still?: { which: keyof UndoTargets, document?: string }, guard?: (paths: string[]) => Promise<void> | void): Promise<{ ok: true } | { ok: false, conflicts: string[] }> {
    return this.#git.exclusive(async () => {
      const planned = await this.#planRevert(id, member, still, guard)
      return planned.ok ? { ok: true } : planned
    })
  }

  async #planRevert(id: string, member: Member, still?: { which: keyof UndoTargets, document?: string }, guard?: (paths: string[]) => Promise<void> | void) {
    if (still && undoTargets(await this.#entries(still.document))[still.which] !== id) throw new RequestError(409, 'history-target-changed', { revision: id, which: still.which })
    const verified = await this.#git.tryOutput(['rev-parse', '--verify', '--quiet', `${id}^{commit}`])
    if (!verified.ok) throw new RequestError(404, 'history-revision-not-found')
    const target = (await this.#log(verified.output.trim()))!
    if (!(await this.#git.tryOutput(['merge-base', '--is-ancestor', target.id, 'HEAD'])).ok) throw new RequestError(404, 'history-revision-not-found')
    const parent = await this.#git.tryOutput(['rev-parse', '--verify', '--quiet', `${target.id}^1`])
    if (!parent.ok) throw new RequestError(409, 'history-baseline-has-no-parent')
    const merged = await this.#git.run(['merge-tree', '--write-tree', '--no-messages', '--name-only', `--merge-base=${target.id}`, 'HEAD', parent.output.trim()])
    const lines = merged.stdout.toString('utf8').split('\n').map(line => line.trim()).filter(Boolean)
    if (merged.code === 1) return { ok: false as const, conflicts: [...new Set(lines.slice(1).map(this.#fromTop))] }
    if (merged.code !== 0 || !lines[0]) throw new Error(`git merge-tree failed: ${merged.stderr.trim()}`)
    const changes = await this.#changes('HEAD', lines[0])
    if (changes.length === 0) throw new RequestError(409, 'history-change-already-undone')
    const outside = changes.filter(change => documentDirOf(this.#files.config, change.path) === undefined).map(change => change.path)
    if (outside.length > 0 && !member.roles.includes('owner')) throw new RequestError(403, 'history-revert-outside-documents', { paths: outside.slice(0, 6) })
    await guard?.(changes.map(change => change.path))
    const blocked = await this.#uncommitted(changes.map(change => change.path))
    if (blocked.length > 0) return { ok: false as const, conflicts: blocked }
    return { ok: true as const, target, tree: lines[0], changes }
  }

  /** Reverts the commit; guards and next-target checks run under the existing git queue. */
  revert(id: string, member: Member, still?: { which: keyof UndoTargets, document?: string }, guard?: (paths: string[]) => Promise<void> | void, kind?: 'editor' | 'agent'): Promise<RevertResult> {
    return this.#git.exclusive(async () => {
      const planned = await this.#planRevert(id, member, still, guard)
      if (!planned.ok) return planned
      const { target, tree, changes } = planned
      const originalHead = await this.head()
      const restore = await this.#changes(tree, 'HEAD')
      try {
      await this.#write(changes)
      const subject = target.message.split('\n')[0] ?? target.id
      const undone = originOf(target.message)
      const origin: CommitOrigin = { kind: kind ?? undone?.kind ?? 'editor', member, ...undone?.operation ? { operation: undone.operation } : {} }
      const done = await this.commitWhileLocked({ paths: changes.map(change => change.path), summary: `Revert "${subject}"`, body: `This reverts commit ${target.id}.`, origin, revert: target.id })
      if (!done) throw new Error(`the revert of ${target.id} committed nothing`)
      return { ok: true, revision: done }
      } catch (error) {
        const afterHead = await this.head()
        if (afterHead !== originalHead) throw new RequestError(409, 'history-readback-changed', { committed: true, snapshot: afterHead })
        await this.#write(restore)
        throw error
      }
    })
  }

  /** Whether git ignores the path, which a commit then leaves out. */
  async ignores(path: string): Promise<boolean> {
    return (await this.#git.run(['check-ignore', '-q', '--', path])).code === 0
  }

  async messageOf(id: string): Promise<string | undefined> {
    const shown = await this.#git.tryOutput(['show', '-s', '--format=%B', `${id}^{commit}`])
    return shown.ok ? shown.output : undefined
  }

  async filesOf(id: string): Promise<string[]> {
    const shown = await this.#git.tryOutput(['show', '--no-renames', '--name-only', '-z', '--format=', `${id}^{commit}`])
    return shown.ok ? shown.output.split('\0').filter(Boolean).map(this.#fromTop) : []
  }

  async documentsOf(id: string): Promise<string[]> {
    const verified = await this.#git.tryOutput(['rev-parse', '--verify', '--quiet', `${id}^{commit}`])
    if (!verified.ok) return []
    const files = (await this.#git.output(['show', '--no-renames', '--name-only', '-z', '--format=', verified.output.trim()])).split('\0').filter(Boolean).map(this.#fromTop)
    return [...new Set(files.flatMap(file => documentDirOf(this.#files.config, file) ?? []))]
  }

  async #entries(document?: string): Promise<LogEntry[]> {
    const log = await this.#git.tryOutput(['log', FORMAT, '--name-only', '--no-renames', '-z'], { GIT_LITERAL_PATHSPECS: '1' })
    const entries = log.ok ? parseLog(log.output).map(entry => ({ ...entry, files: entry.files.map(this.#fromTop) })) : []
    if (entries.length) {
      const rootIds = new Set((await this.#git.output(['rev-list', '--max-parents=0', 'HEAD'])).trim().split('\n'))
      for (const entry of entries) if (rootIds.has(entry.id)) entry.root = true
    }
    if (document === undefined) return entries
    const candidates = entries.flatMap((entry, index) => entry.files.filter(path => !leavesRoot(path) && (document === '' || path.startsWith(document + '/'))).map(path => ({ index, path, id: entry.id })))
    const probes = candidates.flatMap(({ id, path }) => [{ id, path }, { id: `${id}^1`, path }])
    const owners = await this.#owners(probes), accepted = new Set<number>()
    candidates.forEach((item, index) => {
      const deepest = [owners[index * 2], owners[index * 2 + 1]].filter((owner): owner is string => owner !== undefined).sort((a, b) => b.length - a.length)[0]
      if (deepest === document) accepted.add(item.index)
    })
    return entries.filter((_, index) => accepted.has(index))
  }

  async #statusOf(paths: string[]): Promise<{ code: string, path: string }[]> {
    const status = await this.#git.tryOutput(['status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=all', '--', ...paths.map(path => path || '.')], { GIT_LITERAL_PATHSPECS: '1', GIT_OPTIONAL_LOCKS: '0' })
    if (!status.ok) throw new RequestError(409, 'changes-repository-unavailable')
    return status.output.split('\0').filter(Boolean)
      .map(entry => ({ code: entry.slice(0, 2), path: this.#fromTop(entry.slice(3)) }))
      .filter(({ path }) => !isGeneratedPath(path))
  }

  #fromTop = (path: string): string => relative(this.#files.config.root, join(this.#git.top, path)).split(sep).join('/')

  async #changes(from: string, to: string): Promise<TreeFile[]> {
    const fields = (await this.#git.output(['diff-tree', '-r', '-z', '--no-renames', from, to])).split('\0').filter(Boolean)
    const out: TreeFile[] = []
    for (let i = 0; i + 1 < fields.length; i += 2) {
      const [, mode = '', , oid = ''] = fields[i]!.slice(1).split(' ')
      const path = this.#fromTop(fields[i + 1]!)
      if (leavesRoot(path)) throw new Error(`the revert changes ${fields[i + 1]}, outside the workspace`)
      out.push({ path, mode, oid })
    }
    return out
  }

  async #uncommitted(paths: string[]): Promise<string[]> {
    const work = mkdtempSync(join(tmpdir(), 'presmium-revert-'))
    const env = { GIT_INDEX_FILE: join(work, 'index'), GIT_LITERAL_PATHSPECS: '1' }
    try {
      await this.#git.output(['read-tree', 'HEAD'], env)
      const staged = await this.#git.output(['diff', '--cached', '--name-only', '-z', 'HEAD', '--', ...paths], { GIT_LITERAL_PATHSPECS: '1' })
      const blocked = new Set<string>(staged.split('\0').filter(Boolean).map(this.#fromTop))
      for (const path of paths) {
        const tracked = (await this.#git.tryOutput(['ls-files', '--', path], env)).output.trim() !== ''
        let present = true
        try {
          lstatSync(join(this.#files.config.root, path))
        } catch {
          present = false
        }
        if (!tracked && !present) continue
        if (!(await this.#git.tryOutput(['add', '-A', '--', path], env)).ok) blocked.add(path)
      }
      const differ = (await this.#git.output(['diff-index', '--cached', '--name-only', '-z', 'HEAD', '--', ...paths], env)).split('\0').filter(Boolean).map(this.#fromTop)
      for (const path of differ) blocked.add(path)
      return [...blocked].sort()
    } finally {
      rmSync(work, { recursive: true, force: true })
    }
  }

  async #write(files: TreeFile[]): Promise<void> {
    const changes = await Promise.all(files.map(file => this.#treeChange(file)))
    return this.#writeChanges(changes)
  }

  async #writeChanges(files: DocumentFileChange[]): Promise<void> {
    const { config, writer } = this.#files
    const changes: { change: DocumentFileChange, dir?: string }[] = []
    for (const change of files) changes.push({ change, dir: documentDirOf(config, change.path) })
    const outside = changes.filter(({ dir }) => dir === undefined).map(({ change }) => change)
    for (const { path } of outside) {
      const open = writableByOthers(config.root, path)
      if (open) throw new Error(`the revert would write ${path}, in ${open}, which more than serve may write`)
    }
    const inDocuments = changes.filter(({ dir }) => dir !== undefined)
    for (const dir of new Set(inDocuments.filter(({ change }) => !('remove' in change)).map(({ dir }) => dir!))) {
      if (!exists(join(config.root, dir))) makeDocumentDir(config.root, dir)
    }
    if (inDocuments.length > 0) await writer.write(inDocuments.map(({ change }) => change))
    if (outside.length > 0) writeChanges(config, outside, true)
    for (const dir of new Set(inDocuments.map(({ dir }) => dir!))) {
      if (!dir) continue
      try {
        if (readdirSync(join(config.root, dir)).length === 0) rmdirSync(join(config.root, dir))
      } catch {
      }
    }
  }

  async #log(id: string): Promise<LogEntry | undefined> {
    const entry = parseLog(await this.#git.output(['show', '--no-renames', '--name-only', '-z', FORMAT, id]))[0]
    return entry && { ...entry, files: entry.files.map(this.#fromTop) }
  }

  async #revision(id: string): Promise<Revision | undefined> {
    const entry = await this.#log(id)
    return entry && revision(entry)
  }

  /**
   * The member a commit names as its author. The local author (the one person a local service serves) is the
   * repository's configured git user when git has one, so that their saves are theirs; members of a shared service
   * have their own name and email.
   */
  async #author(member: Member | undefined): Promise<Member | undefined> {
    if (!member || member.email || member.id !== LOCAL_AUTHOR.id || member.name !== LOCAL_AUTHOR.name) return member
    const [name, email] = await Promise.all([this.#git.tryOutput(['config', 'user.name']), this.#git.tryOutput(['config', 'user.email'])])
    return name.ok && email.ok && name.output.trim() && email.output.trim() ? { ...member, name: name.output.trim(), email: email.output.trim() } : member
  }

  async #identity(): Promise<string[]> {
    const email = await this.#git.tryOutput(['config', 'user.email'])
    return email.ok && email.output.trim() ? [] : ['-c', 'user.name=Presmium', '-c', 'user.email=presmium@presmium.invalid']
  }
}

function withTrailers(message: string, more: [string, string][]): string {
  if (more.length === 0) return message
  const lines = message.trimEnd().split('\n')
  const at = lines.at(-1)?.startsWith('Co-authored-by: ') ? lines.length - 1 : lines.length
  lines.splice(at, 0, ...more.map(([key, value]) => `${key}: ${value.replace(/\s+/g, ' ').trim()}`))
  return `${lines.join('\n')}\n`
}

function writableByOthers(root: string, path: string): string | undefined {
  const parts = path.split('/').slice(0, -1)
  for (let i = 0; i <= parts.length; i++) {
    const dir = parts.slice(0, i).join('/')
    let mode: number
    try {
      ({ mode } = lstatSync(join(root, dir)))
    } catch {
      return undefined
    }
    if ((mode & 0o002) !== 0) return dir || '.'
  }
  return undefined
}

function lineCount(path: string): [number, number] | undefined {
  try {
    const stat = lstatSync(path)
    if (!stat.isFile() || stat.size > SOURCE_MAX_BYTES) return
    const file = revisionFiles(dirname(path), [basename(path)])[0], change = file?.change
    if (!change || !('content' in change)) return
    const bytes = Buffer.from(change.content)
    if (bytes.includes(0)) return undefined
    const text = bytes.toString('utf8')
    return [text === '' ? 0 : text.split('\n').length - (text.endsWith('\n') ? 1 : 0), 0]
  } catch {
    return undefined
  }
}

function exists(path: string): boolean {
  try {
    lstatSync(path)
    return true
  } catch {
    return false
  }
}
