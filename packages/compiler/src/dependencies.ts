import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'
import type { AnchorResolverRegistry, SourceReader } from '@presmium/kernel'
import { COMMIT } from './workspace.ts'

export type CommittedFiles = Map<string, string>

const run = promisify(execFile)

export interface Revision {
  file: string
  rev: string
}

export class Dependencies {
  readonly #root: string
  readonly #committed: CommittedFiles
  readonly #files = new Set<string>()
  readonly #revisions = new Map<string, Revision>()

  constructor(root: string, committed: CommittedFiles = new Map()) {
    this.#root = root
    this.#committed = committed
  }

  get files(): string[] {
    return [...this.#files]
  }

  get revisions(): Revision[] {
    return [...this.#revisions.values()]
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
        this.#revisions.set(key, { file: path, rev: ref })
        const known = this.#committed.get(key)
        if (known !== undefined) return known
        const text = await src.read(file, ref)
        if (text !== undefined && COMMIT.test(ref)) this.#committed.set(key, text)
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

export async function revisionFiles(dir: string, revs: Iterable<string>): Promise<string[]> {
  let cwd = dir
  while (!existsSync(cwd) && dirname(cwd) !== cwd) cwd = dirname(cwd)
  const git = (args: string[]) => run('git', args, { cwd }).then(({ stdout }) => stdout.split('\n').filter(Boolean), () => [])
  const names = new Set(['HEAD', ...[...revs].filter(rev => !rev.startsWith('-') && !COMMIT.test(rev))])
  const refs = await Promise.all([...names].map(name => git(['rev-parse', '--symbolic-full-name', name])))
  const files = new Set(['HEAD', 'packed-refs', ...refs.flat()])
  return (await git(['rev-parse', ...[...files].flatMap(name => ['--git-path', name])])).map(path => resolve(cwd, path))
}
