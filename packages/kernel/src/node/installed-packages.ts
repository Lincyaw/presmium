import { existsSync, realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** The real directory of the package `name` installed in a `node_modules` at or above `from`, as Node resolves it. */
export function findInstalledPackage(name: string, from: string): string | undefined {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', name)
    if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate)
    if (dirname(dir) === dir) return undefined
  }
}
