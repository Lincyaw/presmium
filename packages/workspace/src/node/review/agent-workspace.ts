import { execFile } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, readlinkSync, rmSync } from 'node:fs'
import { cp, lstat, mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { gitConfigArgs, gitEnvironment } from '@lincyaw/kernel'
import type { DocumentFileChange } from '@lincyaw/kernel'
import type { WorkspaceConfig } from '../config.ts'
import { RequestError } from '../errors.ts'
import { validateDocumentSource, versionOf } from '../source-editor.ts'
import { writeChanges } from '../writer.ts'

interface FileStamp { version: string, executable?: boolean, link?: true }
export interface AgentWorkspaceRecord { root: string, original: string, base: Record<string, FileStamp> }

function git(root: string, args: string[]): Promise<string> {
  return new Promise((done, fail) => execFile('git', [...gitConfigArgs(), ...args], { cwd: root, env: gitEnvironment(process.env), maxBuffer: 32 << 20 }, (error, out, stderr) => error ? fail(new Error(stderr || error.message)) : done(out)))
}

function stamp(file: string): FileStamp | undefined {
  const stat = lstatSync(file, { throwIfNoEntry: false })
  if (!stat) return
  if (stat.isSymbolicLink()) return { version: versionOf(readlinkSync(file)), link: true }
  if (!stat.isFile()) throw new RequestError(409, 'agent-source-type-changed')
  return { version: versionOf(readFileSync(file)), ...stat.mode & 0o111 ? { executable: true } : {} }
}
const same = (a: FileStamp | undefined, b: FileStamp | undefined) => JSON.stringify(a) === JSON.stringify(b)
async function sourceStamp(file: string): Promise<FileStamp | undefined> {
  let stat
  try { stat = await lstat(file) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error }
  if (stat.isSymbolicLink()) return { version: versionOf(await readlink(file)), link: true }
  if (!stat.isFile()) throw new RequestError(409, 'agent-source-type-changed')
  return { version: versionOf(await readFile(file)), ...stat.mode & 0o111 ? { executable: true } : {} }
}

/** An agent edits its own files; only a version-checked publication changes the author's workspace. */
export class AgentWorkspace {
  readonly record: AgentWorkspaceRecord
  readonly #config: WorkspaceConfig

  private constructor(config: WorkspaceConfig, record: AgentWorkspaceRecord) { this.#config = config; this.record = record }
  get root(): string { return this.record.root }

  static async create(config: WorkspaceConfig): Promise<AgentWorkspace> {
    const pool = join(config.root, '.presmium', 'agent-workspaces')
    await mkdir(pool, { recursive: true })
    await writeFile(join(pool, '.gitignore'), '*\n')
    const root = join(await mkdtemp(join(pool, 'session-')), 'workspace')
    await mkdir(root)
    const workspace = new AgentWorkspace(config, { root, original: config.root, base: {} })
    await git(root, ['init', '-q'])
    await workspace.refresh()
    return workspace
  }

  static resume(config: WorkspaceConfig, record: AgentWorkspaceRecord): AgentWorkspace {
    if (resolve(record.original) !== config.root || !resolve(record.root).startsWith(`${join(config.root, '.presmium', 'agent-workspaces')}/`) || !existsSync(join(record.root, '.git'))) throw new RequestError(409, 'agent-workspace-unavailable')
    return new AgentWorkspace(config, record)
  }

  async refresh(): Promise<void> {
    const paths = (await git(this.#config.root, ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', '.'])).split('\0').filter(path => path && !path.startsWith('.presmium/agent-workspaces/'))
    const next: Record<string, FileStamp> = {}
    for (const path of new Set(paths)) {
      const current = await sourceStamp(join(this.#config.root, path))
      if (!current) continue
      next[path] = current
      const target = join(this.root, path)
      if (same(await sourceStamp(target), current)) continue
      await mkdir(dirname(target), { recursive: true })
      await rm(target, { force: true, recursive: true })
      await cp(join(this.#config.root, path), target, { dereference: false, verbatimSymlinks: true })
      if (!same(await sourceStamp(join(this.#config.root, path)), current)) throw new RequestError(409, 'agent-source-changed', { paths: [path], next: 'The author changed a file while the candidate was refreshed. Read the current author files and retry.' })
    }
    for (const path of Object.keys(this.record.base)) if (!next[path]) await rm(join(this.root, path), { force: true, recursive: true })
    this.record.base = next
    const dependencyDirs = new Set(['', ...paths.filter(path => path.endsWith('package.json')).map(dirname)])
    for (const dir of dependencyDirs) {
      let source = join(this.#config.root, dir)
      while (!existsSync(join(source, 'node_modules')) && dirname(source) !== source) source = dirname(source)
      const target = join(this.root, dir, 'node_modules')
      if (existsSync(join(source, 'node_modules')) && !existsSync(target) && existsSync(dirname(target))) await symlink(join(source, 'node_modules'), target, 'dir')
    }
    await git(this.root, ['add', '-A'])
    await git(this.root, ['-c', 'user.name=Presmium', '-c', 'user.email=presmium@localhost', 'commit', '-q', '--allow-empty', '-m', 'Author workspace snapshot'])
  }

  /** Caller holds the original workspace's mutation lock and history transaction. */
  prepare(paths: string[], fixed?: DocumentFileChange[]): { changes: DocumentFileChange[], restore: DocumentFileChange[] } {
    if (fixed && (fixed.length !== paths.length || fixed.some((change, index) => change.path !== paths[index]))) throw new RequestError(409, 'workspace-review-changed')
    const conflicts = paths.filter(path => !same(stamp(join(this.#config.root, path)), this.record.base[path]))
    if (conflicts.length) throw new RequestError(409, 'agent-source-changed', { paths: conflicts, next: 'The author changed these files. Read the current author files again and retry your change. Nothing was published.' })
    const changes: DocumentFileChange[] = [], restore: DocumentFileChange[] = []
    for (const [index, path] of paths.entries()) {
      if (!path || path.split('/').some(part => !part || part === '.' || part === '..' || part === '.git') || path.startsWith('.presmium/agent-workspaces/')) throw new RequestError(403, 'agent-source-path-invalid')
      const before = stamp(join(this.#config.root, path)), after = fixed ? undefined : stamp(join(this.root, path))
      const read = (root: string, value: FileStamp | undefined): DocumentFileChange => !value ? { path, remove: true }
        : value.link ? { path, link: readlinkSync(join(root, path)) } : { path, content: readFileSync(join(root, path)), ...value.executable ? { executable: true } : {} }
      const change = fixed?.[index] ?? read(this.root, after)
      if ('content' in change) validateDocumentSource(path, Buffer.from(change.content).toString('utf8'), before && !before.link ? readFileSync(join(this.#config.root, path)) : undefined)
      changes.push(change); restore.push(read(this.#config.root, before))
    }
    return { changes, restore }
  }

  write(changes: DocumentFileChange[]): void { writeChanges(this.#config, changes, true) }
  dispose(): void { rmSync(dirname(this.root), { recursive: true, force: true }) }
}
