import { execFile } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import type { SourceReader } from '@presmium/kernel'

const run = promisify(execFile)

/** A full commit hash (SHA-1 or SHA-256): what it names never changes. */
export const COMMIT = /^(?:[\da-f]{40}|[\da-f]{64})$/i

/** The enclosing git work tree root, or `dir` itself when it is not inside one. */
export async function findWorkspaceRoot(dir: string): Promise<string> {
  return run('git', ['rev-parse', '--show-toplevel'], { cwd: dir })
    .then(({ stdout }) => resolve(stdout.trim()), () => resolve(dir))
}

/**
 * The files a compilation may read in SHARED `presmium serve` (docs/architecture.md
 * 10.2): those whose real path lies in the workspace root, outside `.git/`.
 * A symbolic link in a document directory that points elsewhere (e.g. to
 * `/proc/self/environ`) is not read; the compiler reports `presmium.files`.
 */
export class ReadScope {
  readonly root: string
  /** Files refused so far, to report each once. */
  readonly refused = new Set<string>()

  constructor(root: string) {
    this.root = realpathSync(root)
  }

  /** Whether `file` may be read; a file that does not exist may (reading it fails as usual). */
  allows(file: string): boolean {
    let path: string
    try {
      path = realpathSync(file)
    } catch {
      return true
    }
    const rel = relative(this.root, path)
    const ok = rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel) && rel.split(sep)[0] !== '.git')
    if (!ok) this.refused.add(file)
    return ok
  }
}

/** The error of a file the read scope refuses. */
export function refusedFile(file: string): string {
  return `${file} is not read: its real path is outside the workspace or in .git/ (presmium serve reads only the workspace's files)`
}

/** Reads workspace files from the working tree, or from git when a revision is given; `scope` limits the working tree's (SHARED serve). */
export function createSourceReader(root: string, scope?: ReadScope): SourceReader {
  return {
    async read(file, ref) {
      const rel = relative(root, resolve(root, file))
      if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return undefined
      if (ref === undefined && scope && !scope.allows(join(root, rel))) return undefined
      if (ref === undefined) return readFile(join(root, rel), 'utf8').catch(() => undefined)
      if (ref.startsWith('-')) return undefined
      return run('git', ['show', `${ref}:${rel.split(sep).join('/')}`], { cwd: root, maxBuffer: 64 << 20 })
        .then(({ stdout }) => stdout, () => undefined)
    },
  }
}
