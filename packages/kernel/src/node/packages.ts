import { existsSync, readFileSync } from 'node:fs'
import { createRequire, findPackageJSON } from 'node:module'
import { dirname, isAbsolute, join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { exports as resolveExports } from 'resolve.exports'
import { JobFailure } from '../job-failures.ts'

/** Resolve a public package export with Node or browser conditions, retaining package-relative target validation. */
export function packageExport(pkg: { name?: unknown, exports?: unknown }, dir: string, subpath: string, options: { browser?: boolean } = {}): string | undefined {
  let targets: string[] | void
  try {
    targets = resolveExports(pkg as Parameters<typeof resolveExports>[0], subpath, options)
  } catch {
    return undefined
  }
  if (!targets?.length) return undefined
  const base = pathToFileURL(`${dir}/`)
  for (const target of targets) {
    const path = target.split(/[?#]/, 1)[0]!
    if (!path.startsWith('./') || /%2f|%5c/i.test(path)) continue
    try {
      const segments = path.slice(2).split(/[\\/]/).map(decodeURIComponent)
      if (segments.some(segment => /^(?:\.{1,2}|node_modules)$/i.test(segment))) continue
      if (new URL(target, base).href.startsWith(base.href)) return target
    } catch {
      // An export array may contain another valid package-relative target.
    }
  }
  throw new Error(`${subpath} has no valid package-relative target`)
}

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
 * `package.json`) finds it. When it is missing, or its browser cannot start (`launch`), the failure is a `JobFailure`
 * `job-browser-missing` with Playwright's words as the details.
 */
export async function playwrightChromium<T = unknown>(deckDir: string, fallbackFrom?: string): Promise<T> {
  for (const from of [join(deckDir, 'package.json'), ...fallbackFrom ? [fallbackFrom] : []]) {
    let entry: string
    try {
      entry = createRequire(from).resolve('playwright-chromium')
    } catch {
      continue
    }
    const loaded = await import(pathToFileURL(entry).href) as { chromium?: T, default?: { chromium?: T } }
    const chromium = loaded.chromium ?? loaded.default?.chromium
    if (chromium) return launchFailures(chromium)
    throw new JobFailure('job-browser-missing', 'playwright-chromium does not export its Chromium browser')
  }
  throw new JobFailure('job-browser-missing', 'this needs playwright-chromium: install it in the deck (and its browser with pnpm exec playwright install chromium)')
}

/** The browser type, whose `launch` failing (no browser downloaded, or one that cannot run here) is `job-browser-missing`. */
function launchFailures<T>(chromium: T): T {
  const type = chromium as { launch?: (...args: unknown[]) => Promise<unknown> }
  if (typeof type.launch !== 'function') return chromium
  const launch = async (...args: unknown[]) => {
    try { return await type.launch!(...args) }
    catch (error) { throw new JobFailure('job-browser-missing', error instanceof Error ? error.message : String(error), { cause: error }) }
  }
  // Every other member is the browser type's own, called on it.
  return new Proxy(chromium as object, {
    get(target, key) {
      if (key === 'launch') return launch
      const value: unknown = Reflect.get(target, key, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  }) as T
}
