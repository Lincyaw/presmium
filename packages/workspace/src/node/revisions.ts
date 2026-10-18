/**
 * The revision history (`REVISIONS`, P-115, docs/architecture.md 4.8): each
 * change of the source is one commit whose trailers say where it came from
 * (`Presmium-Origin`, `Presmium-Task`, `Co-authored-by`; a DeepSeek Harness
 * session's review adds `Presmium-Session` and `Presmium-Turn`,
 * ./review/reviews.ts); the history is the commits with those trailers.
 *
 * A revert is git's three-way merge of the commit undone, computed without
 * the index or the work tree (`git merge-tree --merge-base`, WP-91): when it
 * conflicts with later commits, or with changes in the work tree that are not
 * committed, nothing changes and the files are reported; otherwise its files
 * are written through the document writer (a document directory the revert
 * brings back is made first) and committed. A revert that would
 * change files outside the documents (the workspace configuration) is an
 * owner's only. A revert names the document operation it undoes in its
 * origin, so the history labels it (F-55); the history says which reverts
 * redo: those of an undo.
 *
 * The source editor (P-124) lists the files with changes not committed,
 * which are committed with the author's message (`editor`) or discarded:
 * written back as the last commit has them, through the document writer.
 */
import { lstatSync, mkdtempSync, readdirSync, readFileSync, rmdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import type { DocumentFileChange, Member, RevertResult, Revision, RevisionService } from '@presmium/kernel'
import type { HistoryRevision, UncommittedFile } from '../domain/api.ts'
import { leavesRoot } from '../domain/paths.ts'
import { commitMessage, memberAddress, originOf } from '../domain/revisions.ts'
import type { CommitOrigin } from '../domain/revisions.ts'
import type { WorkspaceConfig } from './config.ts'
import { makeDocumentDir, RequestError } from './documents.ts'
import { documentDirOf, generatedPath, writeChanges } from './files.ts'
import type { DocumentWriter } from './files.ts'
import type { Git } from './git.ts'

const FIELD = '\x00'
const RECORD = '\x1e'
// The separators are written by the formatter: an argument cannot hold a NUL byte.
const FORMAT = '--format=%x1e%H%x00%an <%ae>%x00%aI%x00%B%x00'

interface LogEntry {
  id: string
  author: string
  date: string
  message: string
  files: string[]
}

function parseLog(output: string): LogEntry[] {
  return output.split(RECORD).filter(Boolean).map((record) => {
    const [id = '', author = '', date = '', message = '', rest = ''] = record.split(FIELD)
    return { id, author, date, message: message.trim(), files: rest.split('\n').map(line => line.trim()).filter(Boolean) }
  })
}

/** The commit a commit message reverts: Presmium's trailer, or the line of `git revert`. */
function revertedOf(message: string): string | undefined {
  return originOf(message)?.revert ?? /This reverts commit ([0-9a-f]{7,64})/.exec(message)?.[1]
}

/**
 * Whether a commit of the log redoes (F-55): it reverts an undo, a revert
 * that does not redo itself. A commit the log does not hold counts as a
 * change, so a revert of it undoes.
 */
function redoes(entries: LogEntry[]): (entry: LogEntry) => boolean {
  const find = (id: string) => entries.find(entry => entry.id === id || (id.length >= 7 && entry.id.startsWith(id)))
  const known = new Map<string, boolean>()
  const redo = (entry: LogEntry): boolean => {
    let found = known.get(entry.id)
    if (found !== undefined) return found
    // Undecided while it is being decided: a cycle (which git's history cannot hold) ends here.
    known.set(entry.id, false)
    const reverted = revertedOf(entry.message)
    const target = reverted === undefined ? undefined : find(reverted)
    found = target !== undefined && revertedOf(target.message) !== undefined && !redo(target)
    known.set(entry.id, found)
    return found
  }
  return redo
}

/** A commit with Presmium's trailers as the history lists it: the files it changed (both sides of a rename), what its labels need. */
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
  }
}

/** A file a tree comparison names: its path relative to the workspace root, and its mode and object on the side compared to. */
interface TreeFile {
  path: string
  mode: string
  oid: string
}

/** Where the files of a revert are written: the configuration (which directories are documents) and the writer. */
export interface RevisionFiles {
  config: WorkspaceConfig
  writer: DocumentWriter
}

export class Revisions implements RevisionService {
  readonly #git: Git
  readonly #files: RevisionFiles

  constructor(git: Git, files: RevisionFiles) {
    this.#git = git
    this.#files = files
  }

  /** `trailers`: more trailers, before `Co-authored-by` (a session's review: `Presmium-Session`, `Presmium-Turn`). */
  commit(change: { files: string[], message: string, origin: CommitOrigin, trailers?: [string, string][] }): Promise<Revision | undefined> {
    const [summary = '', ...body] = change.message.trim().split('\n')
    return this.#git.exclusive(() => this.commitNow(change.files, summary, body.join('\n'), change.origin, undefined, change.trailers))
  }

  /**
   * Commits the changes of these paths (files or directories, relative to
   * the root) as one commit; for callers already holding the git queue.
   */
  async commitNow(paths: string[], summary: string, body: string, origin: CommitOrigin, revert?: string, more: [string, string][] = []): Promise<Revision | undefined> {
    const unique = [...new Set(paths.map(path => path.replace(/^\.?\/+|\/+$/g, '')).filter(path => path && !leavesRoot(path)))]
    if (unique.length === 0) return undefined
    // A path that neither exists nor is tracked any more does not match; the others are staged.
    for (const path of unique) await this.#git.attempt(['add', '-A', '--', path], { GIT_LITERAL_PATHSPECS: '1' })
    const staged = (await this.#git.raw(['diff', '--cached', '--name-only', '--', ...unique], { GIT_LITERAL_PATHSPECS: '1' })).trim()
    if (!staged) return undefined
    const message = withTrailers(commitMessage(summary, body, origin, revert), more)
    await this.#git.raw([...await this.#identity(), 'commit', '-q', '--no-verify', '-m', message, ...this.#author(origin.member), '--', ...unique], { GIT_LITERAL_PATHSPECS: '1' })
    return this.#revision('HEAD')
  }

  /** The branch checked out (none when HEAD is detached) and the number of files under these paths (relative to the root; '' for the root) with changes not committed, as `uncommittedFiles` lists them. */
  async status(paths: string[] = ['']): Promise<{ branch?: string, uncommitted: number }> {
    const branch = await this.#git.attempt(['symbolic-ref', '--quiet', '--short', 'HEAD'])
    return { ...branch.ok ? { branch: branch.output.trim() } : {}, uncommitted: (await this.#statusOf(paths)).length }
  }

  /**
   * The files under these paths (relative to the root; '' for the root) whose work tree differs from the last
   * commit, with their lines added and removed; not those generated in a `.presmium/` directory, which no
   * commit of the editor takes even where the repository has no `.gitignore` for them.
   */
  async uncommittedFiles(paths: string[]): Promise<UncommittedFile[]> {
    const specs = paths.map(path => path || '.')
    const status = await this.#statusOf(paths)
    const counts = new Map<string, [number, number]>()
    const numstat = await this.#git.attempt(['diff', '--numstat', '-z', '--no-renames', 'HEAD', '--', ...specs], { GIT_LITERAL_PATHSPECS: '1' })
    if (numstat.ok) {
      for (const entry of numstat.output.split('\0').filter(Boolean)) {
        const [added = '-', removed = '-', path = ''] = entry.split('\t')
        if (added !== '-') counts.set(this.#fromTop(path), [Number(added), Number(removed)])
      }
    }
    return status.map(({ code, path }): UncommittedFile => {
      const kind = code.includes('D') ? 'deleted' : code === '??' || code[0] === 'A' ? 'added' : 'modified'
      const counted = counts.get(path) ?? (kind === 'added' ? lineCount(join(this.#files.config.root, path)) : undefined)
      return { path, kind, ...counted ? { added: counted[0], removed: counted[1] } : {} }
    }).sort((a, b) => a.path.localeCompare(b.path))
  }

  /** Writes these files (relative to the root) back as the last commit has them; those it does not have go. */
  discard(paths: string[]): Promise<void> {
    return this.#git.exclusive(async () => {
      const files: TreeFile[] = []
      for (const path of paths) {
        const listed = await this.#git.attempt(['ls-tree', '-z', 'HEAD', '--', path], { GIT_LITERAL_PATHSPECS: '1' })
        const [meta = '', named] = (listed.ok ? listed.output.split('\0')[0] ?? '' : '').split('\t')
        const [mode = '', , oid = ''] = meta.split(' ')
        files.push(named && mode ? { path, mode, oid } : { path, mode: '000000', oid: '' })
      }
      await this.#write(files)
    })
  }

  async history(filter: { document?: string, task?: string, limit?: number } = {}): Promise<HistoryRevision[]> {
    const log = await this.#git.attempt(['log', FORMAT, '--name-only', '--no-renames', ...filter.document ? ['--', filter.document] : []], { GIT_LITERAL_PATHSPECS: '1' })
    if (!log.ok) return []
    const entries = parseLog(log.output)
    const revertedBy = new Map<string, string>()
    for (const entry of entries) {
      const reverted = revertedOf(entry.message)
      if (reverted && !revertedBy.has(reverted)) revertedBy.set(reverted, entry.id)
    }
    const redo = redoes(entries)
    const revisions = entries.flatMap((entry) => {
      const found = revision(entry, revertedBy.get(entry.id), redo(entry))
      return found && (!filter.task || found.origin.task === filter.task) ? [found] : []
    })
    return filter.limit ? revisions.slice(0, filter.limit) : revisions
  }

  revert(id: string, member: Member): Promise<RevertResult> {
    return this.#git.exclusive(async () => {
      const verified = await this.#git.attempt(['rev-parse', '--verify', '--quiet', `${id}^{commit}`])
      if (!verified.ok) throw new Error(`no commit ${id}`)
      const target = (await this.#log(verified.output.trim()))!
      const parent = await this.#git.attempt(['rev-parse', '--verify', '--quiet', `${target.id}^1`])
      if (!parent.ok) throw new Error(`commit ${target.id} has no parent to go back to`)
      // HEAD with the commit undone, as a tree: git's merge, without the index or the work tree.
      const merged = await this.#git.run(['merge-tree', '--write-tree', '--no-messages', '--name-only', `--merge-base=${target.id}`, 'HEAD', parent.output.trim()])
      const lines = merged.stdout.toString('utf8').split('\n').map(line => line.trim()).filter(Boolean)
      if (merged.code === 1) return { ok: false, conflicts: [...new Set(lines.slice(1).map(this.#fromTop))] }
      if (merged.code !== 0 || !lines[0]) throw new Error(`git merge-tree failed: ${merged.stderr.trim()}`)
      const changes = await this.#changes('HEAD', lines[0])
      if (changes.length === 0) throw new Error(`commit ${target.id} is undone already`)
      // The files around the documents (the workspace configuration among them) are the owners': an editor's revert stays in the documents.
      const outside = changes.filter(change => documentDirOf(this.#files.config, change.path) === undefined).map(change => change.path)
      if (outside.length > 0 && !member.roles.includes('owner')) throw new RequestError(403, `only an owner reverts a change of ${outside.join(', ')}, outside the documents`)
      // Changes not committed in the work tree are not overwritten: reported as conflicts, as git revert does.
      const blocked = await this.#uncommitted(changes.map(change => change.path))
      if (blocked.length > 0) return { ok: false, conflicts: blocked }
      await this.#write(changes)
      const subject = target.message.split('\n')[0] ?? target.id
      const undone = originOf(target.message)
      const origin: CommitOrigin = { kind: undone?.kind ?? 'editor', member, ...undone?.operation ? { operation: undone.operation } : {} }
      const done = await this.commitNow(changes.map(change => change.path), `Revert "${subject}"`, `This reverts commit ${target.id}.`, origin, target.id)
      if (!done) throw new Error(`the revert of ${target.id} committed nothing`)
      return { ok: true, revision: done }
    })
  }

  /** A commit's full message; undefined for no commit. */
  async messageOf(id: string): Promise<string | undefined> {
    const shown = await this.#git.attempt(['show', '-s', '--format=%B', `${id}^{commit}`])
    return shown.ok ? shown.output : undefined
  }

  /** The files a commit changed (relative to the root); none for no commit. */
  async filesOf(id: string): Promise<string[]> {
    const shown = await this.#git.attempt(['show', '--no-renames', '--name-only', '-z', '--format=', `${id}^{commit}`])
    return shown.ok ? shown.output.split('\0').filter(Boolean).map(this.#fromTop) : []
  }

  /** The document directories a commit changed (both sides of a rename), as the configuration names them now; none for no commit. */
  async documentsOf(id: string): Promise<string[]> {
    const verified = await this.#git.attempt(['rev-parse', '--verify', '--quiet', `${id}^{commit}`])
    if (!verified.ok) return []
    const files = (await this.#git.raw(['show', '--no-renames', '--name-only', '-z', '--format=', verified.output.trim()])).split('\0').filter(Boolean).map(this.#fromTop)
    return [...new Set(files.flatMap(file => documentDirOf(this.#files.config, file) ?? []))]
  }

  /** `git status` of these paths (relative to the root): each file's code and its path relative to the root, those generated in `.presmium/` left out. */
  async #statusOf(paths: string[]): Promise<{ code: string, path: string }[]> {
    const status = await this.#git.attempt(['status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=all', '--', ...paths.map(path => path || '.')], { GIT_LITERAL_PATHSPECS: '1' })
    if (!status.ok) return []
    return status.output.split('\0').filter(Boolean)
      .map(entry => ({ code: entry.slice(0, 2), path: this.#fromTop(entry.slice(3)) }))
      .filter(({ path }) => !generatedPath(path))
  }

  /** A path of git (from the top of the work tree) relative to the workspace root. */
  #fromTop = (path: string): string => relative(this.#files.config.root, join(this.#git.top, path)).split(sep).join('/')

  /** The files that differ between two trees, as the second has them. */
  async #changes(from: string, to: string): Promise<TreeFile[]> {
    const fields = (await this.#git.raw(['diff-tree', '-r', '-z', '--no-renames', from, to])).split('\0').filter(Boolean)
    const out: TreeFile[] = []
    for (let i = 0; i + 1 < fields.length; i += 2) {
      const [, mode = '', , oid = ''] = fields[i]!.slice(1).split(' ')
      const path = this.#fromTop(fields[i + 1]!)
      if (leavesRoot(path)) throw new Error(`the revert changes ${fields[i + 1]}, outside the workspace`)
      out.push({ path, mode, oid })
    }
    return out
  }

  /** Of these paths, those whose work tree differs from HEAD (or cannot be read as git would). */
  async #uncommitted(paths: string[]): Promise<string[]> {
    const work = mkdtempSync(join(tmpdir(), 'presmium-revert-'))
    const env = { GIT_INDEX_FILE: join(work, 'index'), GIT_LITERAL_PATHSPECS: '1' }
    try {
      await this.#git.raw(['read-tree', 'HEAD'], env)
      const blocked = new Set<string>()
      for (const path of paths) {
        const tracked = (await this.#git.attempt(['ls-files', '--', path], env)).output.trim() !== ''
        let present = true
        try {
          lstatSync(join(this.#files.config.root, path))
        } catch {
          present = false
        }
        if (!tracked && !present) continue
        if (!(await this.#git.attempt(['add', '-A', '--', path], env)).ok) blocked.add(path)
      }
      const differ = (await this.#git.raw(['diff-index', '--cached', '--name-only', '-z', 'HEAD', '--', ...paths], env)).split('\0').filter(Boolean).map(this.#fromTop)
      for (const path of differ) blocked.add(path)
      return [...blocked].sort()
    } finally {
      rmSync(work, { recursive: true, force: true })
    }
  }

  /** Writes the files as the tree has them: those in documents through the writer, the others here. */
  async #write(files: TreeFile[]): Promise<void> {
    const { config, writer } = this.#files
    const changes: { change: DocumentFileChange, dir?: string }[] = []
    for (const file of files) {
      if (file.mode === '160000') throw new Error(`${file.path} is a submodule: not reverted`)
      const dir = documentDirOf(config, file.path)
      if (/^0+$/.test(file.mode)) {
        changes.push({ change: { path: file.path, remove: true }, dir })
        continue
      }
      const blob = (await this.#git.run(['cat-file', 'blob', file.oid])).stdout
      const change: DocumentFileChange = file.mode === '120000' ? { path: file.path, link: blob.toString('utf8') } : { path: file.path, content: blob, ...file.mode === '100755' ? { executable: true } : {} }
      changes.push({ change, dir })
    }
    const inDocuments = changes.filter(({ dir }) => dir !== undefined)
    // A document directory the revert brings back: made here.
    for (const dir of new Set(inDocuments.filter(({ change }) => !('remove' in change)).map(({ dir }) => dir!))) {
      if (!exists(join(config.root, dir))) makeDocumentDir(config.root, dir)
    }
    if (inDocuments.length > 0) await writer.write(inDocuments.map(({ change }) => change))
    const outside = changes.filter(({ dir }) => dir === undefined).map(({ change }) => change)
    for (const { path } of outside) {
      const open = writableByOthers(config.root, path)
      if (open) throw new Error(`the revert would write ${path}, in ${open}, which more than serve may write`)
    }
    if (outside.length > 0) writeChanges(config, outside, true)
    // A document directory the revert emptied goes (a new one is no document until its files are there).
    for (const dir of new Set(inDocuments.map(({ dir }) => dir!))) {
      if (!dir) continue
      try {
        if (readdirSync(join(config.root, dir)).length === 0) rmdirSync(join(config.root, dir))
      } catch {
        // Not there, or not empty: it stays.
      }
    }
  }

  async #log(id: string): Promise<LogEntry | undefined> {
    return parseLog(await this.#git.raw(['show', '--no-renames', '--name-only', FORMAT, id]))[0]
  }

  async #revision(id: string): Promise<Revision | undefined> {
    const entry = await this.#log(id)
    return entry && revision(entry)
  }

  /** The member as the author; the committer is git's configured identity. */
  #author(member: Member | undefined): string[] {
    return member ? [`--author=${memberAddress(member)}`] : []
  }

  /** A committer identity for a repository (and machine) that configures none. */
  async #identity(): Promise<string[]> {
    const email = await this.#git.attempt(['config', 'user.email'])
    return email.ok && email.output.trim() ? [] : ['-c', 'user.name=Presmium', '-c', 'user.email=presmium@presmium.invalid']
  }
}

/** A commit message with more trailers in its trailers' paragraph, before its `Co-authored-by`. */
function withTrailers(message: string, more: [string, string][]): string {
  if (more.length === 0) return message
  const lines = message.trimEnd().split('\n')
  const at = lines.at(-1)?.startsWith('Co-authored-by: ') ? lines.length - 1 : lines.length
  lines.splice(at, 0, ...more.map(([key, value]) => `${key}: ${value.replace(/\s+/g, ' ').trim()}`))
  return `${lines.join('\n')}\n`
}

/**
 * The first directory on the way to `path` (relative to the root) that
 * anyone may write; undefined when there is none.
 */
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

/** The lines of a new text file, as `git diff --numstat` counts them; undefined for one that is not text. */
function lineCount(path: string): [number, number] | undefined {
  try {
    const bytes = readFileSync(path)
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
