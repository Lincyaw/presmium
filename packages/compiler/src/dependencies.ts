/**
 * What a compilation depends on besides its source files, so that `presmium
 * dev` recompiles when it changes (K-09): the files that directives and passes
 * read through the compiler (`src`, `resolvers`) or declare (`watch`), and the
 * git revisions they read files at.
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { AnchorResolverRegistry, SourceReader } from '@presmium/kernel'

const run = promisify(execFile)

export interface Revision {
  /** Absolute path of a file read at the revision; its repository is the one that holds it. */
  file: string
  rev: string
}

export class Dependencies {
  readonly #root: string
  readonly #files = new Set<string>()
  readonly #revisions = new Map<string, Revision>()

  /** `root` is the workspace root, against which relative paths resolve. */
  constructor(root: string) {
    this.#root = root
  }

  /** Absolute paths of the files read in the working tree or declared. */
  get files(): string[] {
    return [...this.#files]
  }

  get revisions(): Revision[] {
    return [...this.#revisions.values()]
  }

  watch(...files: string[]): void {
    for (const file of files) this.#files.add(resolve(this.#root, file))
  }

  /** A reader that records what is read through `src`. */
  reader(src: SourceReader): SourceReader {
    return {
      read: (file, ref) => {
        const path = resolve(this.#root, file)
        if (ref === undefined) this.#files.add(path)
        else this.#revisions.set(`${path}\0${ref}`, { file: path, rev: ref })
        return src.read(file, ref)
      },
    }
  }

  /** The registry as passes see it: whatever reader a resolver is given, its reads are recorded. */
  resolvers(registry: AnchorResolverRegistry): AnchorResolverRegistry {
    return {
      register: resolver => registry.register(resolver),
      schemes: () => registry.schemes(),
      resolve: (anchor, src, recorded, ref) => registry.resolve(anchor, this.reader(src), recorded, ref),
    }
  }
}

/** A full commit hash (SHA-1 or SHA-256): it names no ref, so no git file can move it. */
const COMMIT = /^(?:[\da-f]{40}|[\da-f]{64})$/i

/**
 * The git files whose change can make one of `revs` name another commit, in
 * the repository that holds `dir`: HEAD (checkouts), packed-refs, the branch
 * HEAD is on (commits) and the refs that the branch and tag names among
 * `revs` stand for. Commit hashes add nothing, so files read at any number of
 * commits cost the same git calls. Empty when git cannot answer, e.g. outside
 * a repository.
 */
export async function revisionFiles(dir: string, revs: Iterable<string>): Promise<string[]> {
  let cwd = dir
  while (!existsSync(cwd) && dirname(cwd) !== cwd) cwd = dirname(cwd)
  const git = (args: string[]) => run('git', args, { cwd }).then(({ stdout }) => stdout.split('\n').filter(Boolean), () => [])
  const names = new Set(['HEAD', ...[...revs].filter(rev => !rev.startsWith('-') && !COMMIT.test(rev))])
  const refs = await Promise.all([...names].map(name => git(['rev-parse', '--symbolic-full-name', name])))
  const files = new Set(['HEAD', 'packed-refs', ...refs.flat()])
  return (await git(['rev-parse', ...[...files].flatMap(name => ['--git-path', name])])).map(path => resolve(cwd, path))
}
