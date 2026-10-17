import { execFile } from 'node:child_process'
import { closeSync, constants, fstatSync, openSync, readFileSync, readlinkSync, realpathSync, statSync } from 'node:fs'
import type { Stats } from 'node:fs'
import { open, readFile } from 'node:fs/promises'
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

/** How a file is opened to be read: without waiting on a FIFO (`O_NONBLOCK`, where there is one). */
const OPEN_FLAGS = constants.O_RDONLY | (constants.O_NONBLOCK ?? 0)

/**
 * The files a compilation may read in SHARED `presmium serve` (docs/architecture.md
 * 10.2): those whose real path lies in the workspace root, outside `.git/`.
 * A symbolic link in a document directory that points elsewhere (e.g. to
 * `/proc/self/environ`) is not read; the compiler reports `presmium.files`.
 * `read` and `readSync` check the very file they opened, by its descriptor,
 * so a link swapped between a check and the read leads nowhere (WP-91b);
 * `allows` checks a path ahead, to report it where it is named.
 */
export class ReadScope {
  readonly root: string
  /** Files refused so far, to report each once. */
  readonly refused = new Set<string>()

  constructor(root: string) {
    this.root = realpathSync(root)
  }

  /** Whether a real path lies in the scope. */
  #inside(path: string): boolean {
    const rel = relative(this.root, path)
    return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel) && rel.split(sep)[0] !== '.git')
  }

  /** Whether `file` may be read; a file that does not exist may (reading it fails as usual). */
  allows(file: string): boolean {
    let path: string
    try {
      path = realpathSync(file)
    } catch {
      return true
    }
    const ok = this.#inside(path)
    if (!ok) this.refused.add(file)
    return ok
  }

  /**
   * Whether the regular file opened as `fd` (asked for as `file`) is in the scope: by the real path of
   * the descriptor (`/proc/self/fd`, Linux); elsewhere by `file`'s real path when it is the very file
   * opened (the same device and inode).
   */
  #opened(fd: number, file: string, stat: Stats): boolean {
    if (!stat.isFile()) return false
    let path: string | undefined
    try {
      path = readlinkSync(`/proc/self/fd/${fd}`).replace(/ \(deleted\)$/, '')
    } catch {
      try {
        const real = realpathSync(file)
        const now = statSync(real)
        if (now.dev === stat.dev && now.ino === stat.ino) path = real
      } catch {
        // Gone meanwhile: not read.
      }
    }
    return path !== undefined && isAbsolute(path) && this.#inside(path)
  }

  /** The text of `file` when the file opened is in the scope; undefined when it cannot be read, or is refused (then reported). */
  async read(file: string): Promise<string | undefined> {
    const handle = await open(file, OPEN_FLAGS).catch(() => undefined)
    if (!handle) return undefined
    try {
      const stat = await handle.stat()
      if (!this.#opened(handle.fd, file, stat)) {
        if (stat.isFile()) this.refused.add(file)
        return undefined
      }
      return await handle.readFile('utf8')
    } catch {
      return undefined
    } finally {
      await handle.close()
    }
  }

  /** As `read`, at once. */
  readSync(file: string): string | undefined {
    let fd: number
    try {
      fd = openSync(file, OPEN_FLAGS)
    } catch {
      return undefined
    }
    try {
      const stat = fstatSync(fd)
      if (!this.#opened(fd, file, stat)) {
        if (stat.isFile()) this.refused.add(file)
        return undefined
      }
      return readFileSync(fd, 'utf8')
    } catch {
      return undefined
    } finally {
      closeSync(fd)
    }
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
      if (ref === undefined) return scope ? scope.read(join(root, rel)) : readFile(join(root, rel), 'utf8').catch(() => undefined)
      if (ref.startsWith('-')) return undefined
      return run('git', ['show', `${ref}:${rel.split(sep).join('/')}`], { cwd: root, maxBuffer: 64 << 20 })
        .then(({ stdout }) => stdout, () => undefined)
    },
  }
}
