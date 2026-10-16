import { execFile } from 'node:child_process'
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

/** Reads workspace files from the working tree, or from git when a revision is given. */
export function createSourceReader(root: string): SourceReader {
  return {
    async read(file, ref) {
      const rel = relative(root, resolve(root, file))
      if (rel === '' || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return undefined
      if (ref === undefined) return readFile(join(root, rel), 'utf8').catch(() => undefined)
      if (ref.startsWith('-')) return undefined
      return run('git', ['show', `${ref}:${rel.split(sep).join('/')}`], { cwd: root, maxBuffer: 64 << 20 })
        .then(({ stdout }) => stdout, () => undefined)
    },
  }
}
