import { execFile } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { gitConfigArgs, gitEnvironment } from '@lincyaw/kernel'
import type { ChangeReview, DocumentFileChange, DocumentFiles, ReviewChange, ReviewChangeKind, ReviewStep } from '@lincyaw/kernel'
import { isInside } from '@lincyaw/kernel/node'
import { snapshotGitDir } from './git-guard.ts'
import type { SavedGitDir } from './git-guard.ts'
import { isHolderAlive, readRecord, removeRecord, THIS_PROCESS, writeRecord } from './record.ts'
import type { AgentSessionRecord, ReviewRecord } from './record.ts'

export interface GitReview extends ChangeReview {
  readonly task: string
  restoreFiles(paths: string[]): Promise<void>
  noteSession(session: Omit<AgentSessionRecord, 'checkpoints' | 'steps'>): void
  suspend(): void
  prepareAccept(reject: string[]): Promise<string[]>
  finish(): void
}

export const GIT_ENGINE = 'git'

const MAX_STEPS = 100
const MAX_DIFF = 256 * 1024
const MAX_DIFFS = 200

const DIFF = ['diff', '--no-renames', '--no-ext-diff', '--no-textconv', '--no-color']

const openScopes = new Set<string>()

function git(cwd: string, args: string[], env: Record<string, string> = {}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile('git', [...gitConfigArgs(), ...args], {
      cwd,
      encoding: 'buffer',
      maxBuffer: 256 << 20,
      env: { ...gitEnvironment(process.env), ...env, GIT_OPTIONAL_LOCKS: '0', GIT_LITERAL_PATHSPECS: '1' },
    }, (error, stdout, stderr) => {
      if (error) reject(new Error(`git ${args[0]}: ${stderr.toString('utf8').trim() || error.message}`))
      else resolve(stdout)
    })
  })
}

const gitText = async (cwd: string, args: string[], env?: Record<string, string>) => (await git(cwd, args, env)).toString('utf8')

export interface GitDirs {
  top: string
  gitDir: string
  commonDir: string
}

async function gitDirsOf(root: string): Promise<GitDirs> {
  const [top = '', gitDir = '', commonDir = ''] = (await gitText(root, ['rev-parse', '--show-toplevel', '--absolute-git-dir', '--git-common-dir'])).split('\n')
  return { top: realpathSync(top), gitDir: realpathSync(gitDir), commonDir: realpathSync(resolve(root, commonDir)) }
}

const COPIED_CONFIG_KEYS = '^(core\\.(filemode|symlinks|ignorecase|precomposeunicode|autocrlf|eol|safecrlf|excludesfile)|extensions\\.objectformat)$'

const quoted = (value: string) => `"${value.replace(/[\\"]/g, c => `\\${c}`).replace(/\n/g, '\\n')}"`

/** The settings of the repository's git configuration that reading its files depends on, for a git directory of the review's own. */
async function isolatedGitConfig(dirs: GitDirs): Promise<{ config: string, exclude?: string }> {
  const listed = await gitText(dirs.top, ['config', '-z', '--get-regexp', COPIED_CONFIG_KEYS], { GIT_DIR: dirs.gitDir, GIT_COMMON_DIR: dirs.commonDir }).catch(() => '')
  const sections = new Map<string, string[]>()
  for (const entry of listed.split('\0').filter(Boolean)) {
    const at = entry.indexOf('\n')
    const [key, value] = at < 0 ? [entry, 'true'] : [entry.slice(0, at), entry.slice(at + 1)]
    const [section = '', name = ''] = key.split('.')
    sections.set(section, [...sections.get(section) ?? [], `\t${name} = ${quoted(value)}`])
  }
  const version = sections.has('extensions') ? 1 : 0
  const others = [...sections].filter(([section]) => section !== 'core').map(([section, lines]) => `[${section}]\n${lines.join('\n')}`)
  const config = [`[core]\n\trepositoryformatversion = ${version}\n\tbare = false`, ...sections.get('core') ?? [], ...others].join('\n')
  let exclude: string | undefined
  try {
    exclude = readFileSync(join(dirs.commonDir, 'info', 'exclude'), 'utf8')
  } catch {
  }
  return { config: `${config}\n`, ...exclude ? { exclude } : {} }
}

/** Trees of the reviewed directory written with an index and a git directory of the review's own. */
class ReviewTrees {
  readonly #work = mkdtempSync(join(tmpdir(), 'presmium-review-'))
  #indexes = 0
  readonly #pathspec: string
  readonly #env: Record<string, string>
  readonly #files?: DocumentFiles
  readonly top: string
  readonly scopeDir: string
  readonly root: string

  constructor(dirs: GitDirs, scopeDir: string, root: string, gitConfig: { config: string, exclude?: string }, options: { files?: DocumentFiles } = {}) {
    this.top = dirs.top
    this.scopeDir = scopeDir
    this.root = root
    this.#pathspec = relative(dirs.top, scopeDir).split(sep).join('/') || '.'
    const own = join(this.#work, 'git')
    for (const dir of ['refs', 'objects', 'info']) mkdirSync(join(own, dir), { recursive: true })
    writeFileSync(join(own, 'HEAD'), 'ref: refs/heads/review\n')
    writeFileSync(join(own, 'config'), gitConfig.config)
    if (gitConfig.exclude !== undefined) writeFileSync(join(own, 'info', 'exclude'), gitConfig.exclude)
    this.#env = { GIT_DIR: own, GIT_OBJECT_DIRECTORY: join(dirs.commonDir, 'objects'), GIT_WORK_TREE: dirs.top }
    this.#files = options.files
  }

  #git(args: string[], index?: string): Promise<Buffer> {
    return git(this.top, args, { ...this.#env, ...index ? { GIT_INDEX_FILE: index } : {} })
  }

  async #text(args: string[], index?: string): Promise<string> {
    return (await this.#git(args, index)).toString('utf8')
  }

  fromGit = (path: string) => relative(this.root, join(this.top, path)).split(sep).join('/')
  toGit = (path: string) => relative(this.top, join(this.root, path)).split(sep).join('/')

  #index(): string {
    return join(this.#work, `index-${++this.#indexes}`)
  }

  async tree(): Promise<string> {
    const index = this.#index()
    try {
      await this.#git(['add', '-A', '--', this.#pathspec], index)
      return (await this.#text(['write-tree'], index)).trim()
    } finally {
      rmSync(index, { force: true })
    }
  }

  async changedPaths(from: string, to: string): Promise<string[]> {
    if (from === to) return []
    return (await this.#text([...DIFF, '--name-only', '-z', from, to])).split('\0').filter(Boolean)
      .map(this.fromGit).sort((a, b) => a.localeCompare(b))
  }

  async compare(from: string, to: string): Promise<ReviewChange[]> {
    if (from === to) return []
    const status = (await this.#text([...DIFF, '--name-status', '-z', from, to])).split('\0').filter(Boolean)
    const kinds = new Map<string, ReviewChangeKind>()
    for (let i = 0; i + 1 < status.length; i += 2) kinds.set(status[i + 1]!, status[i]!.startsWith('A') ? 'added' : status[i]!.startsWith('D') ? 'deleted' : 'modified')
    const counts = new Map<string, { added: number, removed: number, binary: boolean }>()
    for (const entry of (await this.#text([...DIFF, '--numstat', '-z', from, to])).split('\0').filter(Boolean)) {
      const [added = '0', removed = '0', ...path] = entry.split('\t')
      const binary = added === '-'
      counts.set(path.join('\t'), { added: binary ? 0 : Number(added), removed: binary ? 0 : Number(removed), binary })
    }
    const changes: ReviewChange[] = []
    for (const [path, kind] of kinds) {
      const count = counts.get(path) ?? { added: 0, removed: 0, binary: false }
      const change: ReviewChange = { path: this.fromGit(path), kind, ...count }
      if (!count.binary && changes.filter(c => c.diff).length < MAX_DIFFS) {
        const diff = await this.#text([...DIFF, from, to, '--', path])
        if (diff.length <= MAX_DIFF) change.diff = diff
      }
      changes.push(change)
    }
    return changes.sort((a, b) => a.path.localeCompare(b.path))
  }

  async restore(tree: string, paths: string[]): Promise<void> {
    const ours = paths.map(this.toGit).filter(path => isInside(join(this.top, path), this.scopeDir))
    if (ours.length === 0) return
    if (this.#files) return this.#write(tree, ours)
    const known = new Set((await this.#text(['ls-tree', '-r', '-z', '--name-only', tree, '--', ...ours])).split('\0').filter(Boolean))
    const back = ours.filter(path => known.has(path))
    if (back.length > 0) {
      const index = this.#index()
      try {
        await this.#git(['read-tree', tree], index)
        await this.#git(['checkout-index', '-f', '--', ...back], index)
      } finally {
        rmSync(index, { force: true })
      }
    }
    for (const path of ours.filter(path => !known.has(path))) {
      const file = join(this.top, path)
      rmSync(file, { force: true })
      for (let dir = dirname(file); isInside(dir, this.scopeDir) && dir !== this.scopeDir; dir = dirname(dir)) {
        try {
          if (readdirSync(dir).length > 0) break
          rmdirSync(dir)
        } catch {
          break
        }
      }
    }
  }

  async #write(tree: string, paths: string[]): Promise<void> {
    const entries = new Map<string, { mode: string, oid: string }>()
    for (const entry of (await this.#text(['ls-tree', '-r', '-z', tree, '--', ...paths])).split('\0').filter(Boolean)) {
      const [meta = '', path = ''] = entry.split('\t')
      const [mode = '', , oid = ''] = meta.split(' ')
      entries.set(path, { mode, oid })
    }
    const changes: DocumentFileChange[] = []
    for (const path of paths) {
      const entry = entries.get(path)
      if (!entry) {
        changes.push({ path: this.fromGit(path), remove: true })
        continue
      }
      if (entry.mode === '160000') continue
      const blob = await this.#git(['cat-file', 'blob', entry.oid])
      changes.push(entry.mode === '120000' ? { path: this.fromGit(path), link: blob.toString('utf8') } : { path: this.fromGit(path), content: blob, ...entry.mode === '100755' ? { executable: true } : {} })
    }
    await this.#files!.write(changes)
  }

  async reset(tree: string): Promise<void> {
    await this.restore(tree, await this.changedPaths(tree, await this.tree()))
  }

  dispose(): void {
    rmSync(this.#work, { recursive: true, force: true })
  }
}

export interface GitReviewOptions {
  workspaceRoot: string
  scopeDir: string
  task: string
  onRestore?: (paths: string[]) => void
  warn?: (message: string) => void
  files?: DocumentFiles
}

const recovering = new Map<string, Promise<{ task: string, paths: string[] } | undefined>>()

/** Puts a git directory inside the reviewed directory back as it was, from a saved snapshot or one taken now. */
function gitDirGuard(gitDir: string, scopeDir: string, root: string, onRestore: GitReviewOptions['onRestore'], saved?: SavedGitDir): { saved(): SavedGitDir | undefined, restore(): void } {
  const snapshot = saved ? snapshotGitDir(gitDir, saved) : isInside(gitDir, scopeDir) ? snapshotGitDir(gitDir) : undefined
  return {
    saved: () => snapshot?.saved(),
    restore() {
      const paths = snapshot?.restore() ?? []
      if (paths.length > 0) onRestore?.(paths.map(path => relative(root, join(gitDir, path)).split(sep).join('/')))
    },
  }
}

export function recoverGitReview(options: Omit<GitReviewOptions, 'task'>): Promise<{ task: string, paths: string[] } | undefined> {
  const scopeDir = realpathSync(options.scopeDir)
  let running = recovering.get(scopeDir)
  if (!running) {
    running = rollBackLeftReview(scopeDir, realpathSync(options.workspaceRoot), options).finally(() => recovering.delete(scopeDir))
    recovering.set(scopeDir, running)
  }
  return running
}

async function rollBackLeftReview(scopeDir: string, root: string, options: Omit<GitReviewOptions, 'task'>): Promise<{ task: string, paths: string[] } | undefined> {
  const record = readRecord(scopeDir)
  if (!record || record.session || openScopes.has(scopeDir) || isHolderAlive(record)) return undefined
  let trees: ReviewTrees | undefined
  try {
    if (record.guard) gitDirGuard(record.dirs.gitDir, scopeDir, root, options.onRestore, record.guard).restore()
    trees = new ReviewTrees(record.dirs, scopeDir, root, await isolatedGitConfig(record.dirs), options)
    const paths = await trees.changedPaths(record.snapshot, await trees.tree())
    await trees.restore(record.snapshot, paths)
    return { task: record.task, paths }
  } finally {
    removeRecord(scopeDir)
    trees?.dispose()
  }
}

/** The record of an agent session's review that a process which has ended left waiting for its author. */
export function pendingAgentSessionReview(scopeDir: string): ReviewRecord | undefined {
  const real = realpathSync(scopeDir)
  const record = readRecord(real)
  return record?.session && !openScopes.has(real) && !isHolderAlive(record) ? record : undefined
}

export async function openGitReview(options: GitReviewOptions & { session?: Omit<AgentSessionRecord, 'checkpoints' | 'steps'> }): Promise<GitReview> {
  const scopeDir = realpathSync(options.scopeDir)
  const root = realpathSync(options.workspaceRoot)
  if (openScopes.has(scopeDir)) throw new Error(`a change of ${relative(root, scopeDir) || '.'} is under way already`)
  const left = readRecord(scopeDir)
  if (left && isHolderAlive(left)) throw new Error(`a change of ${relative(root, scopeDir) || '.'} is under way in another process (${left.pid})`)
  if (left?.session) throw new Error(`a review of ${relative(root, scopeDir) || '.'} waits for its author (session ${left.session.session}): accept or reject it in the workbench first`)
  if (left) await recoverGitReview(options)
  const dirs = await gitDirsOf(root)
  const guard = gitDirGuard(dirs.gitDir, scopeDir, root, options.onRestore)
  const trees = new ReviewTrees(dirs, scopeDir, root, await isolatedGitConfig(dirs), options)

  openScopes.add(scopeDir)
  let snapshot: string
  try {
    snapshot = await trees.tree()
  } catch (error) {
    openScopes.delete(scopeDir)
    trees.dispose()
    throw error
  }
  const saved = guard.saved()
  const record: ReviewRecord = { scopeDir, dirs, snapshot, task: options.task, ...THIS_PROCESS, ...saved ? { guard: saved } : {}, ...options.session ? { session: { ...options.session, checkpoints: [], steps: [] } } : {} }
  return createGitReview({ scopeDir, trees, restoreGitDir: guard.restore, record, warn: options.warn })
}

export async function resumeGitReview(record: ReviewRecord, options: Omit<GitReviewOptions, 'task' | 'scopeDir'>): Promise<GitReview> {
  const scopeDir = realpathSync(record.scopeDir)
  const root = realpathSync(options.workspaceRoot)
  if (openScopes.has(scopeDir) || isHolderAlive(record)) throw new Error(`a change of ${relative(root, scopeDir) || '.'} is under way already`)
  const { restore: restoreGitDir } = gitDirGuard(record.dirs.gitDir, scopeDir, root, options.onRestore, record.guard)
  restoreGitDir()
  const trees = new ReviewTrees(record.dirs, scopeDir, root, await isolatedGitConfig(record.dirs), options)
  openScopes.add(scopeDir)
  return createGitReview({ scopeDir, trees, restoreGitDir, record: { ...record, ...THIS_PROCESS }, warn: options.warn })
}

function createGitReview(open: { scopeDir: string, trees: ReviewTrees, restoreGitDir: () => void, record: ReviewRecord, warn?: (message: string) => void }): GitReview {
  const { scopeDir, trees, restoreGitDir, record } = open
  const { snapshot } = record
  const steps: ReviewStep[] = [...record.session?.steps ?? []]
  const checkpoints = [snapshot, ...record.session?.checkpoints ?? []]
  let made = Math.max(0, ...steps.map(step => Number(/^step-(\d+)$/.exec(step.id)?.[1] ?? 0)))
  let settled = false
  let suspended = false

  const write = () => {
    try {
      writeRecord({ ...record, ...record.session ? { session: { ...record.session, checkpoints: checkpoints.slice(1), steps } } : {} })
    } catch (error) {
      open.warn?.(`the review's record was not written, so a crash would leave its changes: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  write()

  const settle = () => {
    if (settled) return
    settled = true
    openScopes.delete(scopeDir)
    if (!suspended) removeRecord(scopeDir)
    trees.dispose()
  }
  const live = () => {
    if (settled) throw new Error('this review has ended')
  }
  const prepareAccept = async (reject: string[]) => {
    live()
    restoreGitDir()
    const changes = await trees.changedPaths(snapshot, await trees.tree())
    const rejected = new Set(reject.filter(path => changes.includes(path)))
    await trees.restore(snapshot, [...rejected])
    return changes.filter(path => !rejected.has(path))
  }

  return {
    root: scopeDir,
    visibility: 'immediate',
    task: record.task,
    async step(label, tool) {
      live()
      restoreGitDir()
      const now = await trees.tree()
      if (steps.length >= MAX_STEPS) {
        checkpoints[checkpoints.length - 1] = now
        const last: ReviewStep = { ...steps.at(-1)!, label, ...tool ? { tool } : {}, at: new Date().toISOString(), changes: await trees.compare(checkpoints.at(-2)!, now) }
        steps[steps.length - 1] = last
        if (record.session) write()
        return last
      }
      const step: ReviewStep = { id: `step-${++made}`, label, ...tool ? { tool } : {}, at: new Date().toISOString(), changes: await trees.compare(checkpoints.at(-1)!, now) }
      checkpoints.push(now)
      steps.push(step)
      if (record.session) write()
      return step
    },
    steps: () => steps,
    async diff() {
      live()
      restoreGitDir()
      return trees.compare(snapshot, await trees.tree())
    },
    async restoreTo(stepId) {
      live()
      const at = steps.findIndex(step => step.id === stepId)
      if (at < 0) throw new Error(`no step ${stepId} in this review`)
      restoreGitDir()
      await trees.reset(checkpoints[at]!)
      steps.splice(at)
      checkpoints.splice(at + 1)
      if (record.session) write()
    },
    async restoreFiles(paths) {
      live()
      restoreGitDir()
      const changed = new Set(await trees.changedPaths(snapshot, await trees.tree()))
      await trees.restore(snapshot, paths.filter(path => changed.has(path)))
    },
    noteSession(session) {
      if (!record.session) return
      record.session = { ...record.session, ...session }
      write()
    },
    prepareAccept,
    finish: settle,
    async accept(reject = []) {
      const files = await prepareAccept(reject)
      settle()
      return files
    },
    async rollback() {
      live()
      restoreGitDir()
      await trees.reset(snapshot)
      settle()
    },
    async close() {
      if (settled) return
      try {
        restoreGitDir()
        await trees.reset(snapshot)
      } finally {
        settle()
      }
    },
    suspend() {
      suspended = true
      settle()
    },
  }
}
