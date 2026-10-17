/**
 * The assistant's own change review (D12, docs/architecture.md 10.7), used
 * where no `CHANGE_REVIEW` service is registered: git, in this process. The
 * document directory is the agent's working directory (`root`), so changes
 * show at once (`immediate`). Opening writes the directory as a tree object
 * through a temporary index (the snapshot: committed, uncommitted and
 * untracked files, never `HEAD` or the real index); each step writes another
 * tree and compares it with the one before; the diff compares the directory
 * with the snapshot. Rejected paths come back from the snapshot, and those it
 * does not have (the task's new files) are deleted; going back to before a
 * step does the same with the tree of the checkpoint before it. Files
 * `.gitignore` ignores are not reviewed (9.4). Every git command runs with
 * the repository's hooks, fsmonitor, external diff drivers and text
 * conversions off, takes paths literally (a file named `notes[1].md` is not
 * a glob), and is given the git directories the review found when it opened
 * (`GIT_DIR`, `GIT_COMMON_DIR`, `GIT_WORK_TREE`: a `.git/commondir` or a
 * `.git` file written meanwhile does not move it). When the document
 * directory holds the git directory (a
 * single-deck repository), the git directory is put back as the task found
 * it before each of the review's steps (./git-guard.ts). One review per
 * document directory at a time; while it is open a record names its snapshot
 * (./review-record.ts), so a server that crashed is rolled back by the next
 * one (`recoverGitReview`).
 *
 * Where the workspace writes the document files (`DOCUMENT_FILES`, WP-91),
 * restoring goes through it: the review reads the snapshot's files from git
 * and the workspace writes them. The git directory is found from the
 * workspace root (a `.git` planted in the document directory is never used).
 * How git runs is the kernel's (`gitConfigArgs`, `gitEnvironment`, F-06).
 */
import { execFile } from 'node:child_process'
import { mkdtempSync, readdirSync, realpathSync, rmdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { gitConfigArgs, gitEnvironment } from '@presmium/kernel'
import type { ChangeReview, DocumentFileChange, DocumentFiles, ReviewChange, ReviewChangeKind, ReviewStep } from '@presmium/kernel'
import { guardGitDir } from './git-guard.ts'
import type { GitGuard } from './git-guard.ts'
import { inside as within } from './paths.ts'
import { holderRuns, readRecord, removeRecord, SELF, writeRecord } from './review-record.ts'

/** The engine's name, as the review event and the panel show it. */
export const GIT_ENGINE = 'git'

/** At most this many checkpoints; later ones merge into the last step (as deltabox). */
const MAX_STEPS = 100
/** A file's unified diff larger than this is left out of the review (the file is still listed). */
const MAX_DIFF = 256 * 1024
/** At most this many files get their diff text. */
const MAX_DIFFS = 200

const DIFF = ['diff', '--no-renames', '--no-ext-diff', '--no-textconv', '--no-color']

/** The document directories with a review open in this process. */
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

/** The git directories of a work tree, as the review found them. */
export interface GitDirs {
  top: string
  gitDir: string
  commonDir: string
}

/**
 * The git directories of the workspace (real paths), found from its root, not
 * from the document directory: a `.git` the agent put in the
 * document directory is no repository of the review's.
 */
async function gitDirsOf(root: string): Promise<GitDirs> {
  const [top = '', gitDir = '', commonDir = ''] = (await text(root, ['rev-parse', '--show-toplevel', '--absolute-git-dir', '--git-common-dir'])).split('\n')
  return { top: realpathSync(top), gitDir: realpathSync(gitDir), commonDir: realpathSync(resolve(root, commonDir)) }
}

/** The git commands of a review of one document directory: trees, their differences, and restoring paths from one. */
class Trees {
  readonly #work = mkdtempSync(join(tmpdir(), 'presmium-review-'))
  #indexes = 0
  /** The document directory as git's pathspec, from the top of the work tree. */
  readonly #pathspec: string
  /** The git directories, fixed for every command. */
  readonly #env: Record<string, string>
  /** Where restored files are written (the workspace's `DOCUMENT_FILES`); without it, git writes them here. */
  readonly #files?: DocumentFiles
  readonly top: string
  readonly deck: string
  readonly root: string

  constructor(dirs: GitDirs, deck: string, root: string, options: { files?: DocumentFiles } = {}) {
    this.top = dirs.top
    this.deck = deck
    this.root = root
    this.#pathspec = relative(dirs.top, deck).split(sep).join('/') || '.'
    this.#env = { GIT_DIR: dirs.gitDir, GIT_COMMON_DIR: dirs.commonDir, GIT_WORK_TREE: dirs.top }
    this.#files = options.files
  }

  #git(args: string[], index?: string): Promise<Buffer> {
    return git(this.top, args, { ...this.#env, ...index ? { GIT_INDEX_FILE: index } : {} })
  }

  async #text(args: string[], index?: string): Promise<string> {
    return (await this.#git(args, index)).toString('utf8')
  }

  /** A path of git (from the top) as the contract has it (from the workspace root), and back. */
  fromGit = (path: string) => relative(this.root, join(this.top, path)).split(sep).join('/')
  toGit = (path: string) => relative(this.top, join(this.root, path)).split(sep).join('/')

  #index(): string {
    return join(this.#work, `index-${++this.#indexes}`)
  }

  /** The document directory now, as a tree object. */
  async tree(): Promise<string> {
    const index = this.#index()
    try {
      await this.#git(['add', '-A', '--', this.#pathspec], index)
      return (await this.#text(['write-tree'], index)).trim()
    } finally {
      rmSync(index, { force: true })
    }
  }

  /** The files that differ between two trees, with their counts and unified diffs. */
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

  /** Brings these paths (contract paths) back as `tree` has them; those it lacks are deleted, with directories they leave empty. */
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

  /** `restore` through the workspace's writer: the files as `tree` has them, read from git here, written there. */
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

  /** The document directory back to `tree`. */
  async reset(tree: string): Promise<void> {
    await this.restore(tree, (await this.compare(tree, await this.tree())).map(change => change.path))
  }

  dispose(): void {
    rmSync(this.#work, { recursive: true, force: true })
  }
}

export interface GitReviewOptions {
  workspaceRoot: string
  /** The document directory. */
  deckDir: string
  /** The task, for the record. */
  task: string
  /** Told the git directory's files the review put back (relative to the workspace root). */
  onRestore?: (paths: string[]) => void
  /** Told what the review could not do but goes on without (its record not written). */
  warn?: (message: string) => void
  /** The workspace's writer of document files (`DOCUMENT_FILES`): restores go through it. */
  files?: DocumentFiles
}

/** The recoveries under way, by document directory. */
const recovering = new Map<string, Promise<{ task: string, paths: string[] } | undefined>>()

/** The guard of the git directory when the document directory holds it, and how its restores are told. */
function guarding(gitDir: string, deck: string, root: string, onRestore: GitReviewOptions['onRestore'], guard?: GitGuard) {
  const found = guard ?? (within(gitDir, deck) ? guardGitDir(gitDir) : undefined)
  return {
    guard: found,
    /** The git directory's guarded files put back, before the review's own git commands. */
    restore() {
      const paths = found?.restore() ?? []
      if (paths.length > 0) onRestore?.(paths.map(path => relative(root, join(gitDir, path)).split(sep).join('/')))
    },
  }
}

/**
 * The review a server left when it crashed, rolled back: the git directory as
 * the task found it, then the document directory as its snapshot. Returns
 * the task whose changes were rolled back; undefined when there was none, or
 * its server still runs.
 */
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
  if (!record || opened.has(deck) || holderRuns(record)) return undefined
  const trees = new Trees(record.dirs, deck, root, options)
  try {
    if (record.guard) guarding(record.dirs.gitDir, deck, root, onRestore, guardGitDir(record.dirs.gitDir, record.guard)).restore()
    const paths = (await trees.compare(record.snapshot, await trees.tree())).map(change => change.path)
    await trees.restore(record.snapshot, paths)
    return { task: record.task, paths }
  } finally {
    // Tried once: a record that cannot be restored (its snapshot gone) does not hold the directory.
    removeRecord(deck)
    trees.dispose()
  }
}

export async function openGitReview(options: GitReviewOptions): Promise<ChangeReview> {
  const deck = realpathSync(options.deckDir)
  const root = realpathSync(options.workspaceRoot)
  if (opened.has(deck)) throw new Error(`a change of ${relative(root, deck) || '.'} is under way already`)
  const left = readRecord(deck)
  if (left && holderRuns(left)) throw new Error(`a change of ${relative(root, deck) || '.'} is under way in another process (${left.pid})`)
  if (left) await recoverGitReview(options)
  const dirs = await gitDirsOf(root)
  const { guard, restore: guarded } = guarding(dirs.gitDir, deck, root, options.onRestore)
  const trees = new Trees(dirs, deck, root, options)

  opened.add(deck)
  let snapshot: string
  try {
    snapshot = await trees.tree()
  } catch (error) {
    opened.delete(deck)
    trees.dispose()
    throw error
  }
  try {
    writeRecord({ deck, dirs, snapshot, task: options.task, ...SELF, ...guard ? { guard: guard.saved() } : {} })
  } catch (error) {
    options.warn?.(`the review's record was not written, so a crash would leave its changes: ${error instanceof Error ? error.message : String(error)}`)
  }
  const steps: ReviewStep[] = []
  /** The trees of the checkpoints, the snapshot first. */
  const checkpoints = [snapshot]
  let made = 0
  let settled = false

  const settle = () => {
    if (settled) return
    settled = true
    opened.delete(deck)
    removeRecord(deck)
    trees.dispose()
  }
  const live = () => {
    if (settled) throw new Error('this review has ended')
  }

  return {
    root: deck,
    visibility: 'immediate',
    async step(label, tool) {
      live()
      guarded()
      const now = await trees.tree()
      if (steps.length >= MAX_STEPS) {
        // The last step takes the later changes: compared with the checkpoint before it.
        checkpoints[checkpoints.length - 1] = now
        const last: ReviewStep = { ...steps.at(-1)!, label, ...tool ? { tool } : {}, at: new Date().toISOString(), changes: await trees.compare(checkpoints.at(-2)!, now) }
        steps[steps.length - 1] = last
        return last
      }
      const step: ReviewStep = { id: `step-${++made}`, label, ...tool ? { tool } : {}, at: new Date().toISOString(), changes: await trees.compare(checkpoints.at(-1)!, now) }
      checkpoints.push(now)
      steps.push(step)
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
  }
}
