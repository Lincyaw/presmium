import { existsSync, readFileSync } from 'node:fs'
import { createRequire, findPackageJSON } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

export const TYPESCRIPT_IMPORT: readonly string[] = ['--import', new URL('./strip-types.mjs', import.meta.url).href]

export function packageOf(file: string): string | undefined {
  const manifest = findPackageJSON(pathToFileURL(file))
  return manifest && dirname(manifest)
}

function manifestOf(name: string, from: string): string | undefined {
  const require = createRequire(from)
  try {
    return require.resolve(`${name}/package.json`)
  } catch {}
  let dir: string
  try {
    dir = dirname(require.resolve(name))
  } catch {
    return undefined
  }
  for (; dirname(dir) !== dir; dir = dirname(dir)) {
    const file = join(dir, 'package.json')
    if (existsSync(file) && (JSON.parse(readFileSync(file, 'utf8')) as { name?: string }).name === name) return file
  }
  return undefined
}

/** The file of the package's command `command` (its `bin`), the package as Node resolves it from `from`; undefined when either is missing. */
export function findPackageBin(name: string, command: string, from: string): string | undefined {
  const manifest = manifestOf(name, from)
  if (!manifest) return undefined
  const { bin } = JSON.parse(readFileSync(manifest, 'utf8')) as { bin?: string | Record<string, string> }
  const file = typeof bin === 'string' ? bin : bin?.[command]
  return file === undefined ? undefined : join(dirname(manifest), file)
}
