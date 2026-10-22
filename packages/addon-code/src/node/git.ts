import { readFile } from 'node:fs/promises'
import { join, relative, resolve, sep } from 'node:path'
import type { SourceReader } from '@lincyaw/kernel'
import { isInside } from '@lincyaw/kernel/node'
import { simpleGit } from 'simple-git'

export interface Repository {
  prefix: string
  path(file: string): string
  show(file: string, commit: string): Promise<string | undefined>
  commit(rev: string): Promise<string | undefined>
  remote(): Promise<string | undefined>
  refFiles(rev: string): Promise<string[]>
}

export interface Workspace {
  root: string
  src: SourceReader
  repository(file: string): Promise<Repository>
}

function relativeInside(root: string, file: string): string | undefined {
  const path = resolve(root, file)
  const rel = relative(root, path)
  if (rel === '' || !isInside(path, root)) return undefined
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
    const rel = relativeInside(root, file) ?? file
    return (await submodules).find(sub => rel.startsWith(`${sub.prefix}/`)) ?? own
  }
  workspace = {
    root,
    repository,
    src: {
      async read(file, ref) {
        const rel = relativeInside(root, file)
        if (rel === undefined) return undefined
        if (ref === undefined) return readFile(join(root, rel), 'utf8').catch(() => undefined)
        return (await repository(rel)).show(rel, ref)
      },
    },
  }
  workspaces.set(root, workspace)
  return workspace
}
