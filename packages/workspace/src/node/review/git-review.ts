import { execFile } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { gitConfigArgs, gitEnvironment } from '@presmium/kernel'
import type { ChangeReview, DocumentFileChange, DocumentFiles, ReviewChange, ReviewChangeKind, ReviewStep } from '@presmium/kernel'
import { guardGitDir } from './git-guard.ts'
import type { GitGuard } from './git-guard.ts'
import { holderRuns, readRecord, removeRecord, SELF, writeRecord } from './review-record.ts'
import type { ReviewRecord, SessionRecord } from './review-record.ts'

export function within(path: string, dir: string): boolean {
  const rel = relative(resolve(dir), resolve(path))
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel))
}

export interface GitReview extends ChangeReview {
  readonly task: string
  checkpoints(): readonly string[]
  restoreFiles(paths: string[]): Promise<void>
  note(session: Omit<SessionRecord, 'checkpoints' | 'steps'>): void
  suspend(): void
}

export const GIT_ENGINE = 'git'

const MAX_STEPS = 100
const MAX_DIFF = 256 * 1024
const MAX_DIFFS = 200

const DIFF = ['diff', '--no-renames', '--no-ext-diff', '--no-textconv', '--no-color']

const opened = new Set<string>()

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

const text = async (cwd: string, args: string[], env?: Record<string, string>) => (await git(cwd, args, env)).toString('utf8')

export interface GitDirs {
  top: string
  gitDir: string
  commonDir: string
}

async function gitDirsOf(root: string): Promise<GitDirs> {
  const [top = '', gitDir = '', commonDir = ''] = (await text(root, ['rev-parse', '--show-toplevel', '--absolute-git-dir', '--git-common-dir'])).split('\n')
  return { top: realpathSync(top), gitDir: realpathSync(gitDir), commonDir: realpathSync(resolve(root, commonDir)) }
}

const READING = '^(core\\.(filemode|symlinks|ignorecase|precomposeunicode|autocrlf|eol|safecrlf|excludesfile)|extensions\\.objectformat)$'

const quoted = (value: string) => `"${value.replace(/[\\"]/g, c => `\\${c}`).replace(/\n/g, '\\n')}"`

async function readingOf(dirs: GitDirs): Promise<{ config: string, exclude?: string }> {
  const listed = await text(dirs.top, ['config', '-z', '--get-regexp', READING], { GIT_DIR: dirs.gitDir, GIT_COMMON_DIR: dirs.commonDir }).catch(() => '')
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

class Trees {
  readonly #work = mkdtempSync(join(tmpdir(), 'presmium-review-'))
  #indexes = 0
  readonly #pathspec: string
  readonly #env: Record<string, string>
  readonly #files?: DocumentFiles
  readonly top: string
  readonly deck: string
  readonly root: string

  constructor(dirs: GitDirs, deck: string, root: string, reading: { config: string, exclude?: string }, options: { files?: DocumentFiles } = {}) {
    this.top = dirs.top
    this.deck = deck
    this.root = root
    this.#pathspec = relative(dirs.top, deck).split(sep).join('/') || '.'
    const own = join(this.#work, 'git')
    for (const dir of ['refs', 'objects', 'info']) mkdirSync(join(own, dir), { recursive: true })
    writeFileSync(join(own, 'HEAD'), 'ref: refs/heads/review\n')
    writeFileSync(join(own, 'config'), reading.config)
    if (reading.exclude !== undefined) writeFileSync(join(own, 'info', 'exclude'), reading.exclude)
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
    const ours = paths.map(this.toGit).filter(path => within(join(this.top, path), this.deck))
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
      for (let dir = dirname(file); within(dir, this.deck) && dir !== this.deck; dir = dirname(dir)) {
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
    await this.restore(tree, (await this.compare(tree, await this.tree())).map(change => change.path))
  }

  dispose(): void {
    rmSync(this.#work, { recursive: true, force: true })
  }
}

export interface GitReviewOptions {
  workspaceRoot: string
  deckDir: string
  task: string
  onRestore?: (paths: string[]) => void
  warn?: (message: string) => void
  files?: DocumentFiles
}

const recovering = new Map<string, Promise<{ task: string, paths: string[] } | undefined>>()

function guarding(gitDir: string, deck: string, root: string, onRestore: GitReviewOptions['onRestore'], guard?: GitGuard) {
  const found = guard ?? (within(gitDir, deck) ? guardGitDir(gitDir) : undefined)
  return {
    guard: found,
    restore() {
      const paths = found?.restore() ?? []
      if (paths.length > 0) onRestore?.(paths.map(path => relative(root, join(gitDir, path)).split(sep).join('/')))
    },
  }
}

export function recoverGitReview(options: Omit<GitReviewOptions, 'task'>): Promise<{ task: string, paths: string[] } | undefined> {
  const deck = realpathSync(options.deckDir)
  let running = recovering.get(deck)
  if (!running) {
    running = recover(deck, realpathSync(options.workspaceRoot), options).finally(() => recovering.delete(deck))
    recovering.set(deck, running)
  }
  return running
}

async function recover(deck: string, root: string, options: Omit<GitReviewOptions, 'task'>): Promise<{ task: string, paths: string[] } | undefined> {
  const { onRestore } = options
  const record = readRecord(deck)
  if (!record || record.session || opened.has(deck) || holderRuns(record)) return undefined
  let trees: Trees | undefined
  try {
    if (record.guard) guarding(record.dirs.gitDir, deck, root, onRestore, guardGitDir(record.dirs.gitDir, record.guard)).restore()
    trees = new Trees(record.dirs, deck, root, await readingOf(record.dirs), options)
    const paths = (await trees.compare(record.snapshot, await trees.tree())).map(change => change.path)
    await trees.restore(record.snapshot, paths)
    return { task: record.task, paths }
  } finally {
    removeRecord(deck)
    trees?.dispose()
  }
}

export function leftSessionReview(deckDir: string): ReviewRecord | undefined {
  const deck = realpathSync(deckDir)
  const record = readRecord(deck)
  return record?.session && !opened.has(deck) && !holderRuns(record) ? record : undefined
}

export async function openGitReview(options: GitReviewOptions & { session?: Omit<SessionRecord, 'checkpoints' | 'steps'> }): Promise<GitReview> {
  const deck = realpathSync(options.deckDir)
  const root = realpathSync(options.workspaceRoot)
  if (opened.has(deck)) throw new Error(`a change of ${relative(root, deck) || '.'} is under way already`)
  const left = readRecord(deck)
  if (left && holderRuns(left)) throw new Error(`a change of ${relative(root, deck) || '.'} is under way in another process (${left.pid})`)
  if (left?.session) throw new Error(`a review of ${relative(root, deck) || '.'} waits for its author (session ${left.session.session}): accept or reject it in the workbench first`)
  if (left) await recoverGitReview(options)
  const dirs = await gitDirsOf(root)
  const { guard, restore: guarded } = guarding(dirs.gitDir, deck, root, options.onRestore)
  const trees = new Trees(dirs, deck, root, await readingOf(dirs), options)

  opened.add(deck)
  let snapshot: string
  try {
    snapshot = await trees.tree()
  } catch (error) {
    opened.delete(deck)
    trees.dispose()
    throw error
  }
  const record: ReviewRecord = { deck, dirs, snapshot, task: options.task, ...SELF, ...guard ? { guard: guard.saved() } : {}, ...options.session ? { session: { ...options.session, checkpoints: [], steps: [] } } : {} }
  return reviewOf({ deck, trees, guarded, record, warn: options.warn })
}

export async function resumeGitReview(record: ReviewRecord, options: Omit<GitReviewOptions, 'task' | 'deckDir'>): Promise<GitReview> {
  const deck = realpathSync(record.deck)
  const root = realpathSync(options.workspaceRoot)
  if (opened.has(deck) || holderRuns(record)) throw new Error(`a change of ${relative(root, deck) || '.'} is under way already`)
  const { restore: guarded } = guarding(record.dirs.gitDir, deck, root, options.onRestore, record.guard ? guardGitDir(record.dirs.gitDir, record.guard) : undefined)
  guarded()
  const trees = new Trees(record.dirs, deck, root, await readingOf(record.dirs), options)
  opened.add(deck)
  return reviewOf({ deck, trees, guarded, record: { ...record, ...SELF }, warn: options.warn })
}

function reviewOf(open: { deck: string, trees: Trees, guarded: () => void, record: ReviewRecord, warn?: (message: string) => void }): GitReview {
  const { deck, trees, guarded, record } = open
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
    opened.delete(deck)
    if (!suspended) removeRecord(deck)
    trees.dispose()
  }
  const live = () => {
    if (settled) throw new Error('this review has ended')
  }

  return {
    root: deck,
    visibility: 'immediate',
    task: record.task,
    checkpoints: () => checkpoints.slice(1),
    async step(label, tool) {
      live()
      guarded()
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
      guarded()
      return trees.compare(snapshot, await trees.tree())
    },
    async restoreTo(stepId) {
      live()
      const at = steps.findIndex(step => step.id === stepId)
      if (at < 0) throw new Error(`no step ${stepId} in this review`)
      guarded()
      await trees.reset(checkpoints[at]!)
      steps.splice(at)
      checkpoints.splice(at + 1)
      if (record.session) write()
    },
    async restoreFiles(paths) {
      live()
      guarded()
      const changed = new Set((await trees.compare(snapshot, await trees.tree())).map(change => change.path))
      await trees.restore(snapshot, paths.filter(path => changed.has(path)))
    },
    note(session) {
      if (!record.session) return
      record.session = { ...record.session, ...session }
      write()
    },
    async accept(reject = []) {
      live()
      guarded()
      const changes = await trees.compare(snapshot, await trees.tree())
      const rejected = new Set(reject.filter(path => changes.some(change => change.path === path)))
      await trees.restore(snapshot, [...rejected])
      settle()
      return changes.filter(change => !rejected.has(change.path)).map(change => change.path)
    },
    async rollback() {
      live()
      guarded()
      await trees.reset(snapshot)
      settle()
    },
    async close() {
      if (settled) return
      try {
        guarded()
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
