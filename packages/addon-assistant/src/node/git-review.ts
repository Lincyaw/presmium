/**
 * The assistant's own change review (D12, docs/architecture.md 10.7), used
 * where no `CHANGE_REVIEW` service is registered: git, in this process. The
 * document directory is the agent's working directory (`root`), so changes
 * show at once (`immediate`). Opening writes the directory as a tree object
 * through a temporary index (the snapshot: committed, uncommitted and
 * untracked files, never `HEAD` or the real index); each step writes another
 * tree and compares it with the one before; the diff compares the directory
 * with the snapshot. Rejected paths come back from the snapshot, and those it
 * does not have (the task's new files) are deleted. Files `.gitignore`
 * ignores are not reviewed (9.4). Every git command runs with the
 * repository's hooks, fsmonitor, external diff drivers and text conversions
 * off, and takes paths literally (a file named `notes[1].md` is not a glob).
 * When the document directory holds the git directory (a single-deck
 * repository), the files through which git runs code are put back as the
 * task found them before each of the review's steps (./git-guard.ts). One
 * review per document directory at a time.
 */
import { execFile } from 'node:child_process'
import { mkdtempSync, readdirSync, realpathSync, rmdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import type { ChangeReview, ReviewChange, ReviewChangeKind, ReviewStep } from '@presmium/kernel'
import { guardGitDir } from './git-guard.ts'

/** The engine's name, as the review event and the panel show it. */
export const GIT_ENGINE = 'git'

/** At most this many checkpoints; later ones merge into the last step (as deltabox). */
const MAX_STEPS = 100
/** A file's unified diff larger than this is left out of the review (the file is still listed). */
const MAX_DIFF = 256 * 1024
/** At most this many files get their diff text. */
const MAX_DIFFS = 200

const SAFE = ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false', '-c', 'core.quotepath=false']
const DIFF = ['diff', '--no-renames', '--no-ext-diff', '--no-textconv', '--no-color']

/** The document directories with a review open in this process. */
const opened = new Set<string>()

function git(cwd: string, args: string[], index?: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    execFile('git', [...SAFE, ...args], {
      cwd,
      encoding: 'buffer',
      maxBuffer: 256 << 20,
      env: { ...process.env, ...index ? { GIT_INDEX_FILE: index } : {}, GIT_OPTIONAL_LOCKS: '0', GIT_LITERAL_PATHSPECS: '1' },
    }, (error, stdout, stderr) => {
      if (error) reject(new Error(`git ${args[0]}: ${stderr.toString('utf8').trim() || error.message}`))
      else resolve(stdout)
    })
  })
}

const text = async (cwd: string, args: string[], index?: string) => (await git(cwd, args, index)).toString('utf8')

/** Whether `path` is `dir` or below it. */
function within(path: string, dir: string): boolean {
  const rel = relative(dir, path)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

export interface GitReviewOptions {
  workspaceRoot: string
  /** The document directory. */
  deckDir: string
  /** Told the git directory's files the review put back (relative to the workspace root). */
  onRestore?: (paths: string[]) => void
}

export async function openGitReview(options: GitReviewOptions): Promise<ChangeReview> {
  const deck = realpathSync(options.deckDir)
  const root = realpathSync(options.workspaceRoot)
  if (opened.has(deck)) throw new Error(`a change of ${relative(root, deck) || '.'} is under way already`)
  const top = realpathSync((await text(deck, ['rev-parse', '--show-toplevel'])).trim())
  const gitDir = realpathSync((await text(deck, ['rev-parse', '--absolute-git-dir'])).trim())
  const guard = within(gitDir, deck) ? guardGitDir(gitDir) : undefined
  /** The git directory's guarded files put back, before the review's own git commands. */
  const guarded = () => {
    const paths = guard?.restore() ?? []
    if (paths.length > 0) options.onRestore?.(paths.map(path => relative(root, join(gitDir, path)).split(sep).join('/')))
  }
  /** The document directory as git's pathspec, from the top of the work tree. */
  const pathspec = relative(top, deck).split(sep).join('/') || '.'
  const work = mkdtempSync(join(tmpdir(), 'presmium-review-'))
  let indexes = 0
  /** A path of git (from the top) as the contract has it (from the workspace root), and back. */
  const fromGit = (path: string) => relative(root, join(top, path)).split(sep).join('/')
  const toGit = (path: string) => relative(top, join(root, path)).split(sep).join('/')

  /** The document directory now, as a tree object. */
  const tree = async (): Promise<string> => {
    const index = join(work, `index-${++indexes}`)
    try {
      await git(top, ['add', '-A', '--', pathspec], index)
      return (await text(top, ['write-tree'], index)).trim()
    } finally {
      rmSync(index, { force: true })
    }
  }

  /** The files that differ between two trees, with their counts and unified diffs. */
  const compare = async (from: string, to: string): Promise<ReviewChange[]> => {
    if (from === to) return []
    const status = (await text(top, [...DIFF, '--name-status', '-z', from, to])).split('\0').filter(Boolean)
    const kinds = new Map<string, ReviewChangeKind>()
    for (let i = 0; i + 1 < status.length; i += 2) kinds.set(status[i + 1]!, status[i]!.startsWith('A') ? 'added' : status[i]!.startsWith('D') ? 'deleted' : 'modified')
    const counts = new Map<string, { added: number, removed: number, binary: boolean }>()
    for (const entry of (await text(top, [...DIFF, '--numstat', '-z', from, to])).split('\0').filter(Boolean)) {
      const [added = '0', removed = '0', ...path] = entry.split('\t')
      const binary = added === '-'
      counts.set(path.join('\t'), { added: binary ? 0 : Number(added), removed: binary ? 0 : Number(removed), binary })
    }
    const changes: ReviewChange[] = []
    for (const [path, kind] of kinds) {
      const count = counts.get(path) ?? { added: 0, removed: 0, binary: false }
      const change: ReviewChange = { path: fromGit(path), kind, ...count }
      if (!count.binary && changes.filter(c => c.diff).length < MAX_DIFFS) {
        const diff = await text(top, [...DIFF, from, to, '--', path])
        if (diff.length <= MAX_DIFF) change.diff = diff
      }
      changes.push(change)
    }
    return changes.sort((a, b) => a.path.localeCompare(b.path))
  }

  /** Brings these paths (contract paths) back as the snapshot has them; those it lacks are deleted, with directories they leave empty. */
  const restore = async (paths: string[]): Promise<void> => {
    const ours = paths.map(toGit).filter(path => within(join(top, path), deck))
    if (ours.length === 0) return
    const known = new Set((await text(top, ['ls-tree', '-r', '-z', '--name-only', snapshot, '--', ...ours])).split('\0').filter(Boolean))
    const back = ours.filter(path => known.has(path))
    if (back.length > 0) {
      const index = join(work, `index-${++indexes}`)
      try {
        await git(top, ['read-tree', snapshot], index)
        await git(top, ['checkout-index', '-f', '--', ...back], index)
      } finally {
        rmSync(index, { force: true })
      }
    }
    for (const path of ours.filter(path => !known.has(path))) {
      const file = join(top, path)
      rmSync(file, { force: true })
      for (let dir = dirname(file); within(dir, deck) && dir !== deck; dir = dirname(dir)) {
        try {
          if (readdirSync(dir).length > 0) break
          rmdirSync(dir)
        } catch {
          break
        }
      }
    }
  }

  opened.add(deck)
  let snapshot: string
  try {
    snapshot = await tree()
  } catch (error) {
    opened.delete(deck)
    rmSync(work, { recursive: true, force: true })
    throw error
  }
  const steps: ReviewStep[] = []
  /** The trees of the checkpoints, the snapshot first. */
  const trees = [snapshot]
  let settled = false

  const settle = () => {
    if (settled) return
    settled = true
    opened.delete(deck)
    rmSync(work, { recursive: true, force: true })
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
      const now = await tree()
      if (steps.length >= MAX_STEPS) {
        // The last step takes the later changes: compared with the checkpoint before it.
        trees[trees.length - 1] = now
        const last: ReviewStep = { ...steps.at(-1)!, label, ...tool ? { tool } : {}, at: new Date().toISOString(), changes: await compare(trees.at(-2)!, now) }
        steps[steps.length - 1] = last
        return last
      }
      const step: ReviewStep = { id: `step-${steps.length + 1}`, label, ...tool ? { tool } : {}, at: new Date().toISOString(), changes: await compare(trees.at(-1)!, now) }
      trees.push(now)
      steps.push(step)
      return step
    },
    steps: () => steps,
    async diff() {
      live()
      guarded()
      return compare(snapshot, await tree())
    },
    async accept(reject = []) {
      live()
      guarded()
      const changes = await compare(snapshot, await tree())
      const rejected = new Set(reject.filter(path => changes.some(change => change.path === path)))
      await restore([...rejected])
      settle()
      return changes.filter(change => !rejected.has(change.path)).map(change => change.path)
    },
    async rollback() {
      live()
      guarded()
      await restore((await compare(snapshot, await tree())).map(change => change.path))
      settle()
    },
    async close() {
      if (settled) return
      try {
        guarded()
        await restore((await compare(snapshot, await tree())).map(change => change.path))
      } finally {
        settle()
      }
    },
  }
}
