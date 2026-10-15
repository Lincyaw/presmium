/**
 * Write-back (P-25). The edit is committed with git plumbing on a temporary
 * index, so the working tree, the real index and the current branch stay
 * untouched while the deck is being presented from the same repository.
 */
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative, resolve, sep } from 'node:path'
import { simpleGit } from 'simple-git'
import type { CommitRequest, CommitResult } from '../domain/index.ts'
import { defaultBranch } from '../domain/index.ts'
import { HttpError, requirePath } from './http.ts'
import { text } from './messages.ts'

/** The repository root of the workspace, or undefined when it is not in git or has no commit yet. */
export async function gitRoot(workspace: string): Promise<string | undefined> {
  try {
    const git = simpleGit(workspace)
    await git.revparse(['--verify', 'HEAD'])
    return (await git.revparse(['--show-toplevel'])).trim()
  }
  catch {
    return undefined
  }
}

export async function commitOnNewBranch(workspace: string, request: CommitRequest, now = new Date()): Promise<CommitResult> {
  const root = await gitRoot(workspace)
  if (!root) throw new HttpError(409, text().notInGit)
  // git reports the real path of the root; resolve the workspace the same way.
  const absolute = resolve(await realpath(workspace), requirePath(request.file))
  const file = relative(root, absolute).split(sep).join('/')
  const git = simpleGit(root)

  const branch = request.branch ?? defaultBranch(now)
  try {
    await git.raw(['check-ref-format', '--branch', branch])
  }
  catch {
    throw new HttpError(400, text().invalidBranch(branch))
  }
  if ((await git.raw(['branch', '--list', branch])).trim()) throw new HttpError(409, text().branchExists(branch))

  const content = request.content ?? await readFile(absolute, 'utf8').catch(() => {
    throw new HttpError(404, text().noSuchFile(request.file))
  })
  const base = (await git.revparse(['--verify', 'HEAD'])).trim()
  const baseBranch = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim()
  const mode = (await git.raw(['ls-tree', base, '--', file])).split(' ')[0] || '100644'

  const blob = (await simpleGit({ baseDir: root, input: () => content }).raw(['hash-object', '-w', '--stdin', `--path=${file}`])).trim()
  const indexDir = await mkdtemp(join(tmpdir(), 'presmium-index-'))
  try {
    const indexed = simpleGit({ baseDir: root, allowEnvironment: ['GIT_INDEX_FILE'] }).env(indexEnv(join(indexDir, 'index')))
    await indexed.raw(['read-tree', base])
    await indexed.raw(['update-index', '--add', '--cacheinfo', `${mode},${blob},${file}`])
    const tree = (await indexed.raw(['write-tree'])).trim()
    const commit = (await git.raw(['commit-tree', tree, '-p', base, '-m', request.message ?? text().commitMessage(file)])).trim()
    await git.raw(['branch', branch, commit])
    return { branch, commit, base, baseBranch, file }
  }
  finally {
    await rm(indexDir, { recursive: true, force: true })
  }
}

/**
 * The environment for git with a temporary index. simple-git rejects guarded
 * variables (`GIT_*`, `EDITOR`, ...) passed through `.env()`, so only what git
 * needs to find itself and the user's configuration is passed on.
 */
function indexEnv(indexFile: string): Record<string, string> {
  const keep = ['PATH', 'HOME', 'USERPROFILE', 'XDG_CONFIG_HOME', 'LANG', 'LC_ALL', 'SYSTEMROOT']
  const env = Object.fromEntries(keep.flatMap(key => process.env[key] === undefined ? [] : [[key, process.env[key]!]]))
  return { ...env, GIT_INDEX_FILE: indexFile }
}
