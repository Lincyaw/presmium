/**
 * The revision history (`REVISIONS`, P-115, docs/architecture.md 4.8): each
 * change of the source is one commit whose trailers say where it came from
 * (`Presmium-Origin`, `Presmium-Task`, `Co-authored-by`); the history is the
 * commits with those trailers.
 *
 * A revert is git's three-way merge of the commit undone, computed without
 * the index or the work tree (`git merge-tree --merge-base`, WP-91): when it
 * conflicts with later commits, or with changes in the work tree that are not
 * committed, nothing changes and the files are reported; otherwise its files
 * are written through the document writer (in SHARED mode agent-host, as the
 * sandbox: serve writes nothing in the document directories; a document
 * directory the revert brings back is made by serve, which owns the
 * directories around the documents) and committed. A revert that would
 * change files outside the documents (the workspace configuration) is an
 * owner's only.
 */
import { lstatSync, mkdtempSync, readdirSync, rmdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import type { DocumentFileChange, Member, RevertResult, Revision, RevisionOrigin, RevisionService } from '@presmium/kernel'
import { commitMessage, memberAddress, originOf } from '../domain/revisions.ts'
import type { WorkspaceConfig } from './config.ts'
import { makeDocumentDir, RequestError } from './documents.ts'
import { documentDirOf, writeChanges } from './files.ts'
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

/** The files a commit changed, both sides of a rename. */
function revision(entry: LogEntry, revertedBy?: string): Revision | undefined {
  const origin = originOf(entry.message)
  if (!origin) return undefined
  const { revert: _revert, coAuthor: _coAuthor, ...plain } = origin
  return {
    id: entry.id,
    message: entry.message,
    author: entry.author,
    date: entry.date,
    origin: plain as RevisionOrigin,
    files: entry.files,
    ...revertedBy ? { revertedBy } : {},
  }
}

/** A file a tree comparison names: its path relative to the workspace root, and its mode and object on the side compared to. */
interface TreeFile {
  path: string
  mode: string
  oid: string
}

/** Where the files of a revert are written: the configuration (which directories are documents), the writer, the documents' group. */
export interface RevisionFiles {
  config: WorkspaceConfig
  writer: DocumentWriter
  group?: number
}

export class Revisions implements RevisionService {
  readonly #git: Git
  readonly #files: RevisionFiles

  constructor(git: Git, files: RevisionFiles) {
    this.#git = git
    this.#files = files
  }

  commit(change: { files: string[], message: string, origin: RevisionOrigin }): Promise<Revision | undefined> {
    const [summary = '', ...body] = change.message.trim().split('\n')
    return this.#git.exclusive(() => this.commitNow(change.files, summary, body.join('\n'), change.origin))
  }

  /**
   * Commits the changes of these paths (files or directories, relative to
   * the root) as one commit; for callers already holding the git queue.
   */
  async commitNow(paths: string[], summary: string, body: string, origin: RevisionOrigin, revert?: string): Promise<Revision | undefined> {
    const unique = [...new Set(paths.map(path => path.replace(/^\.?\/+|\/+$/g, '')).filter(path => path && !path.startsWith('..')))]
    if (unique.length === 0) return undefined
    // A path that neither exists nor is tracked any more does not match; the others are staged.
    for (const path of unique) await this.#git.attempt(['add', '-A', '--', path], { GIT_LITERAL_PATHSPECS: '1' })
    const staged = (await this.#git.raw(['diff', '--cached', '--name-only', '--', ...unique], { GIT_LITERAL_PATHSPECS: '1' })).trim()
    if (!staged) return undefined
    const message = commitMessage(summary, body, origin, revert)
    await this.#git.raw([...await this.#identity(), 'commit', '-q', '--no-verify', '-m', message, ...this.#author(origin.member), '--', ...unique], { GIT_LITERAL_PATHSPECS: '1' })
    return this.#revision('HEAD')
  }

  async history(filter: { document?: string, task?: string, limit?: number } = {}): Promise<Revision[]> {
    const log = await this.#git.attempt(['log', FORMAT, '--name-only', '--no-renames', ...filter.document ? ['--', filter.document] : []], { GIT_LITERAL_PATHSPECS: '1' })
    if (!log.ok) return []
    const entries = parseLog(log.output)
    const revertedBy = new Map<string, string>()
    for (const entry of entries) {
      const reverted = originOf(entry.message)?.revert ?? /This reverts commit ([0-9a-f]{7,64})/.exec(entry.message)?.[1]
      if (reverted && !revertedBy.has(reverted)) revertedBy.set(reverted, entry.id)
    }
    const revisions = entries.flatMap((entry) => {
      const found = revision(entry, revertedBy.get(entry.id))
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
      const kind = originOf(target.message)?.kind ?? 'editor'
      const done = await this.commitNow(changes.map(change => change.path), `Revert "${subject}"`, `This reverts commit ${target.id}.`, { kind, member }, target.id)
      if (!done) throw new Error(`the revert of ${target.id} committed nothing`)
      return { ok: true, revision: done }
    })
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
      if (path.startsWith('..')) throw new Error(`the revert changes ${fields[i + 1]}, outside the workspace`)
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

  /** Writes the files as the tree has them: those in documents through the writer, the others (serve's own) here. */
  async #write(files: TreeFile[]): Promise<void> {
    const { config, writer, group } = this.#files
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
    // A document directory the revert brings back: made here, in the directories serve owns.
    for (const dir of new Set(inDocuments.filter(({ change }) => !('remove' in change)).map(({ dir }) => dir!))) {
      if (!exists(join(config.root, dir))) makeDocumentDir(config.root, dir, group)
    }
    if (inDocuments.length > 0) await writer.write(inDocuments.map(({ change }) => change))
    const outside = changes.filter(({ dir }) => dir === undefined).map(({ change }) => change)
    for (const { path } of outside) {
      const open = writableByOthers(config.root, path, group)
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

/**
 * The first directory on the way to `path` (relative to the root) that
 * others than its owner may write: anyone, or the documents' group (SHARED);
 * undefined when there is none.
 */
function writableByOthers(root: string, path: string, group: number | undefined): string | undefined {
  const parts = path.split('/').slice(0, -1)
  for (let i = 0; i <= parts.length; i++) {
    const dir = parts.slice(0, i).join('/')
    let mode: number
    let gid: number
    try {
      ({ mode, gid } = lstatSync(join(root, dir)))
    } catch {
      return undefined
    }
    if ((mode & 0o002) !== 0 || (group !== undefined && gid === group && (mode & 0o020) !== 0)) return dir || '.'
  }
  return undefined
}

function exists(path: string): boolean {
  try {
    lstatSync(path)
    return true
  } catch {
    return false
  }
}
