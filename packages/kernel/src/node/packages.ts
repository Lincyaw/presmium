import { existsSync, readFileSync } from 'node:fs'
import { createRequire, findPackageJSON } from 'node:module'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

export const TYPESCRIPT_IMPORT: readonly string[] = ['--import', new URL('./strip-types.mjs', import.meta.url).href]

/**
 * The import specifier of `file` in a module generated in `dir`: relative where it can be (Vite's dependency scan does
 * not follow an import written as an absolute path), else absolute (another drive on Windows).
 */
export function importSpecifier(dir: string, file: string): string {
  const path = relative(dir, file)
  if (isAbsolute(path)) return file
  const posix = path.split(sep).join('/')
  return posix.startsWith('.') ? posix : `./${posix}`
}

/** `file` as a glob that matches only it: Vite's `optimizeDeps.entries` are globs. */
export function literalGlob(file: string): string {
  return file.split(sep).join('/').replace(/[\\*?[\]{}()!@+|]/g, '\\$&')
}

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

/**
 * Playwright's Chromium (`playwright-chromium`), as the deck installs it, else as `fallbackFrom` (a module's URL or a
 * `package.json`) finds it.
 */
export async function playwrightChromium<T = unknown>(deckDir: string, fallbackFrom?: string): Promise<T> {
  for (const from of [join(deckDir, 'package.json'), ...fallbackFrom ? [fallbackFrom] : []]) {
    let entry: string
    try {
      entry = createRequire(from).resolve('playwright-chromium')
    } catch {
      continue
    }
    return (await import(pathToFileURL(entry).href) as { chromium: T }).chromium
  }
  throw new Error('this needs playwright-chromium: install it in the deck (and its browser with pnpm exec playwright install chromium)')
}
