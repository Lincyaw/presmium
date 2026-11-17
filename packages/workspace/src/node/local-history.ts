import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, lstatSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { gitConfigArgs, gitEnvironment } from '@lincyaw/kernel'
import { Git } from './git.ts'
import { leavesRoot } from '../domain/paths.ts'

/** Editing history owns its index and refs; project commits remain an explicit author action. */
export async function openLocalHistory(root: string, env: NodeJS.ProcessEnv = process.env): Promise<Git> {
  const base = join(env.XDG_STATE_HOME || join(homedir(), '.local', 'state'), 'presmium', 'history')
  const directory = join(base, createHash('sha256').update(root).digest('hex'))
  if (existsSync(join(directory, 'HEAD'))) {
    const top = (await readFile(join(directory, 'presmium-worktree'), 'utf8')).trim()
    return new Git(root, { directory, top })
  }
  await mkdir(base, { recursive: true })
  const temporary = await mkdtemp(join(base, '.prepare-'))
  try {
    const project = Git.isRepository(root) ? new Git(root) : undefined
    const top = project?.top ?? root
    await promisify(execFile)('git', [...gitConfigArgs(), 'init', '--bare', '--quiet', '--initial-branch=main', temporary], { env: gitEnvironment(env) })
    const git = new Git(root, { directory: temporary, top })
    await git.output(['config', 'core.bare', 'false'])
    await git.output(['config', 'core.worktree', top])
    await writeFile(join(temporary, 'presmium-worktree'), `${top}\n`)
    let excluded = ''
    if (project) {
      const head = await project.run(['rev-parse', '--verify', '--quiet', 'HEAD'])
      if (head.code === 0) {
        const source = (await project.output(['rev-parse', '--absolute-git-dir'])).trim()
        await git.output(['fetch', '--quiet', '--no-tags', source, 'HEAD'])
        await git.output(['update-ref', 'refs/heads/main', (await git.output(['rev-parse', 'FETCH_HEAD'])).trim()])
        await git.output(['read-tree', 'HEAD'])
      }
      for (const key of ['user.name', 'user.email', 'core.autocrlf', 'core.eol', 'core.safecrlf', 'core.filemode', 'core.symlinks', 'core.excludesfile']) {
        const value = await project.tryOutput(['config', '--get', key])
        if (value.ok) await git.output(['config', key, value.output.trimEnd()])
      }
      const exclude = (await project.output(['rev-parse', '--git-path', 'info/exclude'])).trim()
      excluded = await readFile(resolve(root, exclude), 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error })
    }
    await writeFile(join(temporary, 'info', 'exclude'), `${excluded}\n.presmium/\nnode_modules/\ndist/\n.deltabox/\n.deltabox-lite-state/\n`)
    // Capture existing files, including unsaved project changes, as a real baseline before the first edit.
    await captureLocalBaseline(git, ['.'], true)
    await rename(temporary, directory)
    return new Git(root, { directory, top })
  } finally { await rm(temporary, { recursive: true, force: true }) }
}

/** Caller owns the history queue. External edits become an explicit undo boundary before a new save. */
export async function captureLocalBaseline(git: Git, paths: string[], initial = false): Promise<void> {
  if (paths.some(path => isAbsolute(path) || leavesRoot(relative(git.root, resolve(git.root, path)).split(sep).join('/')) || path.split(/[\\/]/).includes('.git'))) throw new Error('history-path-outside-workspace')
  const literal = { GIT_LITERAL_PATHSPECS: '1' }
  const tracked = new Set((await git.output(['ls-files', '-z', '--', ...paths], literal)).split('\0').filter(Boolean))
  const excluded = await git.run(['check-ignore', '-z', '--stdin'], {}, Buffer.from(paths.map(path => `${path}\0`).join('')))
  if (excluded.code !== 0 && excluded.code !== 1) throw new Error(excluded.stderr)
  const ignored = new Set(excluded.stdout.toString('utf8').split('\0'))
  const selected = paths.filter(path => !ignored.has(path) && (tracked.has(path) || lstatSync(join(git.root, path), { throwIfNoEntry: false })))
  if (selected.length) await git.output(['add', '-A', '--', ...selected], { GIT_LITERAL_PATHSPECS: '1' })
  const tree = (await git.output(['write-tree'])).trim()
  const parent = await git.tryOutput(['rev-parse', '--verify', '--quiet', 'HEAD'])
  if (!initial && parent.ok && tree === (await git.output(['rev-parse', 'HEAD^{tree}'])).trim()) return
  const message = 'Synchronize local editing baseline\n\nPresmium-Baseline: true\n'
  const commit = (await git.output(['-c', 'user.name=Presmium', '-c', 'user.email=history@presmium.invalid', 'commit-tree', tree, ...parent.ok ? ['-p', parent.output.trim()] : [], '-m', message])).trim()
  await git.output(['update-ref', 'refs/heads/main', commit, parent.ok ? parent.output.trim() : '0'.repeat(commit.length)])
}
