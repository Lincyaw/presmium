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

/** A git repository and its submodules: the repository that holds a file, and the files at a commit. */
export interface GitTree {
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

async function openRepository(treeRoot: string, prefix: string): Promise<Repository> {
  const root = join(treeRoot, prefix)
  const git = simpleGit(root)
  const gitPrefix = await git.revparse(['--show-prefix']).then(value => value.trimEnd(), () => '')
  const commit = (rev: string) => rev.startsWith('-')
    ? Promise.resolve(undefined)
    : git.revparse(['--verify', '--quiet', `${rev}^{commit}`]).then(hash => hash.trim() || undefined, () => undefined)
  const path = (file: string) => gitPrefix + (prefix ? file.slice(prefix.length + 1) : file)
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

const trees = new Map<string, GitTree>()

export function openGitTree(root: string): GitTree {
  let tree = trees.get(root)
  if (tree) return tree
  const own = openRepository(root, '')
  const git = simpleGit(root)
  const submodules = git.revparse(['--show-toplevel'])
    .then(repository => git.raw(['config', '--file', join(repository.trim(), '.gitmodules'), '--get-regexp', String.raw`^submodule\..*\.path$`])
      .then(out => out.split('\n').filter(Boolean).map(line => line.slice(line.indexOf(' ') + 1).replace(/\/+$/, ''))
        .map(path => relativeInside(root, join(repository.trim(), path))).filter((path): path is string => path !== undefined)))
    .catch(() => [])
    .then(paths => Promise.all(paths.map(path => openRepository(root, path))))
  const repository = async (file: string) => {
    const rel = relativeInside(root, file) ?? file
    return (await submodules).find(sub => rel.startsWith(`${sub.prefix}/`)) ?? own
  }
  tree = {
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
  trees.set(root, tree)
  return tree
}
