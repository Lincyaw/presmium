import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { AnchorResolverRegistry, SourceReader } from '@lincyaw/kernel'
import { COMMIT_HASH } from './workspace.ts'

export type CommittedFiles = Map<string, string>

const run = promisify(execFile)

/** A file the compilation read at a git ref rather than from the working tree. */
export interface GitRead {
  file: string
  ref: string
}

/** The files and git refs a compilation read besides its sources, to watch for changes. */
export class CompileInputs {
  readonly #root: string
  readonly #committed: CommittedFiles
  readonly #files = new Set<string>()
  readonly #gitReads = new Map<string, GitRead>()

  constructor(root: string, committed: CommittedFiles = new Map()) {
    this.#root = root
    this.#committed = committed
  }

  get files(): string[] {
    return [...this.#files]
  }

  get gitReads(): GitRead[] {
    return [...this.#gitReads.values()]
  }

  watch(...files: string[]): void {
    for (const file of files) this.#files.add(resolve(this.#root, file))
  }

  reader(src: SourceReader): SourceReader {
    return {
      read: async (file, ref) => {
        const path = resolve(this.#root, file)
        if (ref === undefined) {
          this.#files.add(path)
          return src.read(file, ref)
        }
        const key = `${path}\0${ref}`
        this.#gitReads.set(key, { file: path, ref })
        const known = this.#committed.get(key)
        if (known !== undefined) return known
        const text = await src.read(file, ref)
        if (text !== undefined && COMMIT_HASH.test(ref)) this.#committed.set(key, text)
        return text
      },
    }
  }

  resolvers(registry: AnchorResolverRegistry): AnchorResolverRegistry {
    return {
      register: resolver => registry.register(resolver),
      schemes: () => registry.schemes(),
      resolve: (anchor, src, recorded, ref) => registry.resolve(anchor, this.reader(src), recorded, ref),
    }
  }
}

/** The files of git's own state that change when one of the refs that were read moves. */
export async function gitReadFiles(reads: readonly GitRead[]): Promise<string[]> {
  const refs = new Map<string, Set<string>>()
  for (const { file, ref } of reads) refs.set(dirname(file), (refs.get(dirname(file)) ?? new Set<string>()).add(ref))
  return (await Promise.all([...refs].map(([dir, names]) => gitRefFiles(dir, names)))).flat()
}

async function gitRefFiles(dir: string, refs: Iterable<string>): Promise<string[]> {
  let cwd = dir
  while (!existsSync(cwd) && dirname(cwd) !== cwd) cwd = dirname(cwd)
  const git = (args: string[]) => run('git', args, { cwd }).then(({ stdout }) => stdout.split('\n').filter(Boolean), () => [])
  const names = new Set(['HEAD', ...[...refs].filter(ref => !ref.startsWith('-') && !COMMIT_HASH.test(ref))])
  const full = await Promise.all([...names].map(name => git(['rev-parse', '--symbolic-full-name', name])))
  const files = new Set(['HEAD', 'packed-refs', ...full.flat()])
  return (await git(['rev-parse', ...[...files].flatMap(name => ['--git-path', name])])).map(path => resolve(cwd, path))
}
