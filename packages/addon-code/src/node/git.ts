import { readFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { SourceReader } from '@presmium/kernel'
import { simpleGit } from 'simple-git'
import type { SimpleGit } from 'simple-git'

/** The enclosing git work tree root, or `dir` itself outside git. */
export async function findWorkspaceRoot(dir: string): Promise<string> {
  return simpleGit(dir).revparse(['--show-toplevel']).then(root => resolve(root.trim()), () => resolve(dir))
}

/** Git access to one workspace (P-13); every lookup yields undefined when git cannot answer. */
export interface Workspace {
  root: string
  /** Reads the working tree, or a commit when `ref` is given. */
  src: SourceReader
  /** Full hash of the commit a revision names. */
  commit(rev: string): Promise<string | undefined>
  /** URL of the `origin` remote. */
  remote(): Promise<string | undefined>
}

const workspaces = new Map<string, Workspace>()

export function openWorkspace(root: string): Workspace {
  let workspace = workspaces.get(root)
  if (!workspace) {
    const git = simpleGit(root)
    workspace = {
      root,
      src: createReader(root, git),
      commit: rev => rev.startsWith('-')
        ? Promise.resolve(undefined)
        : git.revparse(['--verify', '--quiet', `${rev}^{commit}`]).then(hash => hash.trim() || undefined, () => undefined),
      remote: () => git.remote(['get-url', 'origin']).then(url => url?.trim() || undefined, () => undefined),
    }
    workspaces.set(root, workspace)
  }
  return workspace
}

function createReader(root: string, git: SimpleGit): SourceReader {
  return {
    async read(file, ref) {
      const rel = relative(root, resolve(root, file))
      if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return undefined
      if (ref === undefined) return readFile(join(root, rel), 'utf8').catch(() => undefined)
      if (ref.startsWith('-')) return undefined
      return git.show([`${ref}:${rel.split(sep).join('/')}`]).catch(() => undefined)
    },
  }
}
