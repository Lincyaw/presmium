import { readFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { SourceReader } from '@presmium/kernel'
import { simpleGit } from 'simple-git'

/** The enclosing git work tree root, or `dir` itself outside git. */
export async function findWorkspaceRoot(dir: string): Promise<string> {
  return simpleGit(dir).revparse(['--show-toplevel']).then(root => resolve(root.trim()), () => resolve(dir))
}

/**
 * A git repository holding referenced code (P-13): the workspace's own, or a
 * submodule inside it for code from another repository (P-12). Every lookup
 * yields undefined when git cannot answer.
 */
export interface Repository {
  /** Workspace-relative path of the repository root; empty for the workspace's own repository. */
  prefix: string
  /** Path of a workspace-relative file inside this repository. */
  path(file: string): string
  /** Content of a workspace-relative file at a commit. */
  show(file: string, commit: string): Promise<string | undefined>
  /** Full hash of the commit a revision names. */
  commit(rev: string): Promise<string | undefined>
  /** URL of the `origin` remote. */
  remote(): Promise<string | undefined>
  /** Absolute paths of the git files whose change can make `rev` name another commit; none for a commit hash. */
  refFiles(rev: string): Promise<string[]>
}

export interface Workspace {
  root: string
  /** Reads the working tree, or a commit of the file's repository when `ref` is given. */
  src: SourceReader
  /** The repository that holds a workspace-relative file. */
  repository(file: string): Promise<Repository>
}

/** `file` relative to `root` with `/` separators, or undefined when it is outside. */
function inside(root: string, file: string): string | undefined {
  const rel = relative(root, resolve(root, file))
  if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return undefined
  return rel.split(sep).join('/')
}

function openRepository(workspaceRoot: string, prefix: string): Repository {
  const root = join(workspaceRoot, prefix)
  const git = simpleGit(root)
  const commit = (rev: string) => rev.startsWith('-')
    ? Promise.resolve(undefined)
    : git.revparse(['--verify', '--quiet', `${rev}^{commit}`]).then(hash => hash.trim() || undefined, () => undefined)
  const path = (file: string) => (prefix ? file.slice(prefix.length + 1) : file)
  return {
    prefix,
    path,
    commit,
    show: (file, ref) => (ref.startsWith('-') ? Promise.resolve(undefined) : git.show([`${ref}:${path(file)}`]).catch(() => undefined)),
    remote: () => git.remote(['get-url', 'origin']).then(url => url?.trim() || undefined, () => undefined),
    async refFiles(rev) {
      if (rev.startsWith('-') || (await commit(rev))?.startsWith(rev.toLowerCase())) return []
      // Branch and tag names move with commits and fetches, HEAD also with checkouts.
      const refs = await Promise.all([rev, 'HEAD'].map(name => git.revparse(['--symbolic-full-name', name]).then(out => out.trim(), () => '')))
      const names = ['HEAD', 'packed-refs', ...new Set(refs.filter(Boolean))]
      return git.revparse(names.flatMap(name => ['--git-path', name]))
        .then(out => out.split('\n').filter(Boolean).map(file => resolve(root, file)), () => [])
    },
  }
}

const workspaces = new Map<string, Workspace>()

export function openWorkspace(root: string): Workspace {
  let workspace = workspaces.get(root)
  if (workspace) return workspace
  const own = openRepository(root, '')
  const submodules = simpleGit(root)
    .raw(['config', '--file', '.gitmodules', '--get-regexp', String.raw`^submodule\..*\.path$`])
    .then(out => out.split('\n').filter(Boolean).map(line => line.slice(line.indexOf(' ') + 1).replace(/\/+$/, '')), () => [])
    .then(paths => paths.map(path => openRepository(root, path)))
  const repository = async (file: string) => {
    const rel = inside(root, file) ?? file
    return (await submodules).find(sub => rel.startsWith(`${sub.prefix}/`)) ?? own
  }
  workspace = {
    root,
    repository,
    src: {
      async read(file, ref) {
        const rel = inside(root, file)
        if (rel === undefined) return undefined
        if (ref === undefined) return readFile(join(root, rel), 'utf8').catch(() => undefined)
        return (await repository(rel)).show(rel, ref)
      },
    },
  }
  workspaces.set(root, workspace)
  return workspace
}
