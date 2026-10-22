import { lstatSync, mkdtempSync, readdirSync, readFileSync, rmdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, sep } from 'node:path'
import type { DocumentFileChange, HistoryRevision, Member, RevertResult, Revision, RevisionService, UncommittedFile } from '@lincyaw/kernel'
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

function revertedOf(message: string): string | undefined {
  return originOf(message)?.revert ?? /This reverts commit ([0-9a-f]{7,64})/.exec(message)?.[1]
}

function redoes(entries: LogEntry[]): (entry: LogEntry) => boolean {
  const find = (id: string) => entries.find(entry => entry.id === id || (id.length >= 7 && entry.id.startsWith(id)))
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

interface TreeFile {
  path: string
  mode: string
  oid: string
}

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

  commit(change: { files: string[], message: string, origin: CommitOrigin, trailers?: [string, string][] }): Promise<Revision | undefined> {
    const [summary = '', ...body] = change.message.trim().split('\n')
    return this.#git.exclusive(() => this.commitNow(change.files, summary, body.join('\n'), change.origin, undefined, change.trailers))
  }

  async commitNow(paths: string[], summary: string, body: string, origin: CommitOrigin, revert?: string, more: [string, string][] = []): Promise<Revision | undefined> {
    const unique = [...new Set(paths.map(path => path.replace(/^\.?\/+|\/+$/g, '')).filter(path => path && !leavesRoot(path)))]
    if (unique.length === 0) return undefined
    for (const path of unique) await this.#git.raw(['add', '-A', '--', path], { GIT_LITERAL_PATHSPECS: '1' })
    const staged = (await this.#git.raw(['diff', '--cached', '--name-only', '--', ...unique], { GIT_LITERAL_PATHSPECS: '1' })).trim()
    if (!staged) return undefined
    const message = withTrailers(commitMessage(summary, body, origin, revert), more)
    await this.#git.raw([...await this.#identity(), 'commit', '-q', '--no-verify', '-m', message, ...this.#author(origin.member), '--', ...unique], { GIT_LITERAL_PATHSPECS: '1' })
    return this.#revision('HEAD')
  }

  async status(paths: string[] = ['']): Promise<{ branch?: string, uncommitted: number }> {
    const branch = await this.#git.attempt(['symbolic-ref', '--quiet', '--short', 'HEAD'])
    return { ...branch.ok ? { branch: branch.output.trim() } : {}, uncommitted: (await this.#statusOf(paths)).length }
  }

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
      const merged = await this.#git.run(['merge-tree', '--write-tree', '--no-messages', '--name-only', `--merge-base=${target.id}`, 'HEAD', parent.output.trim()])
      const lines = merged.stdout.toString('utf8').split('\n').map(line => line.trim()).filter(Boolean)
      if (merged.code === 1) return { ok: false, conflicts: [...new Set(lines.slice(1).map(this.#fromTop))] }
      if (merged.code !== 0 || !lines[0]) throw new Error(`git merge-tree failed: ${merged.stderr.trim()}`)
      const changes = await this.#changes('HEAD', lines[0])
      if (changes.length === 0) throw new Error(`commit ${target.id} is undone already`)
      const outside = changes.filter(change => documentDirOf(this.#files.config, change.path) === undefined).map(change => change.path)
      if (outside.length > 0 && !member.roles.includes('owner')) throw new RequestError(403, `only an owner reverts a change of ${outside.join(', ')}, outside the documents`)
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

  async messageOf(id: string): Promise<string | undefined> {
    const shown = await this.#git.attempt(['show', '-s', '--format=%B', `${id}^{commit}`])
    return shown.ok ? shown.output : undefined
  }

  async filesOf(id: string): Promise<string[]> {
    const shown = await this.#git.attempt(['show', '--no-renames', '--name-only', '-z', '--format=', `${id}^{commit}`])
    return shown.ok ? shown.output.split('\0').filter(Boolean).map(this.#fromTop) : []
  }

  async documentsOf(id: string): Promise<string[]> {
    const verified = await this.#git.attempt(['rev-parse', '--verify', '--quiet', `${id}^{commit}`])
    if (!verified.ok) return []
    const files = (await this.#git.raw(['show', '--no-renames', '--name-only', '-z', '--format=', verified.output.trim()])).split('\0').filter(Boolean).map(this.#fromTop)
    return [...new Set(files.flatMap(file => documentDirOf(this.#files.config, file) ?? []))]
  }

  async #statusOf(paths: string[]): Promise<{ code: string, path: string }[]> {
    const status = await this.#git.attempt(['status', '--porcelain=v1', '-z', '--no-renames', '--untracked-files=all', '--', ...paths.map(path => path || '.')], { GIT_LITERAL_PATHSPECS: '1' })
    if (!status.ok) return []
    return status.output.split('\0').filter(Boolean)
      .map(entry => ({ code: entry.slice(0, 2), path: this.#fromTop(entry.slice(3)) }))
      .filter(({ path }) => !generatedPath(path))
  }

  #fromTop = (path: string): string => relative(this.#files.config.root, join(this.#git.top, path)).split(sep).join('/')

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
    for (const dir of new Set(inDocuments.map(({ dir }) => dir!))) {
      if (!dir) continue
      try {
        if (readdirSync(join(config.root, dir)).length === 0) rmdirSync(join(config.root, dir))
      } catch {
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

  #author(member: Member | undefined): string[] {
    return member ? [`--author=${memberAddress(member)}`] : []
  }

  async #identity(): Promise<string[]> {
    const email = await this.#git.attempt(['config', 'user.email'])
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
