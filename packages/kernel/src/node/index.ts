/**
 * `@presmium/kernel/node`: what the Node sides of the renderers, the
 * compiler and the hosts share that needs Node's own modules; the browser
 * never loads it (scripts/check-layering.mjs).
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { createRequire, findPackageJSON } from 'node:module'
import { dirname, join, resolve, sep } from 'node:path'
import type { LocalAsset } from '../ir.ts'

/**
 * Copies a published file (`RenderContext.localAsset`) into `dir` under its
 * published name, a directory with its files; a copy already there is kept,
 * since the name holds the content hash. Returns the copy's path.
 */
export function copyPublished(found: LocalAsset, dir: string): string {
  const target = join(dir, found.name)
  if (!existsSync(target)) {
    mkdirSync(dir, { recursive: true })
    cpSync(found.file, target, { recursive: true })
  }
  return target
}

/** Where a site publishes the license of the fonts the design system bundles into it: `<base>presmium/fonts/LICENSE`. */
export const FONT_LICENSE = 'presmium/fonts/LICENSE'

/**
 * The license of the faces @presmium/host bundles into every site (SIL Open
 * Font License 1.1, with each face's copyright, NOTICE): the license files of
 * the Fontsource packages it depends on, found from `from` (a renderer's
 * module), one after the other.
 */
export function fontLicense(from: string | URL): string {
  const manifest = findPackageJSON('@presmium/host', from)
  if (!manifest) throw new Error('@presmium/host is not installed')
  const { dependencies = {} } = JSON.parse(readFileSync(manifest, 'utf8')) as { dependencies?: Record<string, string> }
  const require = createRequire(manifest)
  const files = Object.keys(dependencies).filter(name => name.startsWith('@fontsource/')).sort()
    .map(name => `${name}\n\n${readFileSync(require.resolve(`${name}/LICENSE`), 'utf8').trim()}\n`)
  return [`The fonts of this site, from Fontsource, with their licenses (SIL Open Font License 1.1).\n`, ...files].join(`\n${'='.repeat(78)}\n\n`)
}

/**
 * The Node options of a process that runs a renderer's framework (VitePress,
 * Slidev) and so may import Presmium's packages natively: `--import` of
 * ./strip-types.mjs, which strips the types of TypeScript under node_modules,
 * as installed from npm (P-141), where Node does not.
 */
export const TYPESCRIPT_IMPORT: readonly string[] = ['--import', new URL('./strip-types.mjs', import.meta.url).href]

/** Packages a framework provides itself (one Vue for the page) or that are Presmium's own: never pre-bundled through a plugin. */
const PROVIDED = /^(?:vue|@vue\/.*|vitepress|@slidev\/.*|@presmium\/.*)$/
/** A module's static and dynamic imports of packages, type-only imports aside. */
const IMPORT = /(?:^|\n)\s*(?:import|export)(?!\s+type\b)[^'"`;]*?\bfrom\s*['"]([^'"./][^'"]*)['"]|(?:^|\n)\s*import\s*['"]([^'"./][^'"]*)['"]|\bimport\(\s*['"]([^'"./][^'"]*)['"]\s*\)/g
const SOURCE = /\.(?:[cm]?[jt]s|vue)$/
const DECLARATION = /\.d\.[cm]?ts$/
const STYLE = /\.(?:css|scss|sass|less|styl)$/
/** Directories of a package that hold no browser code. */
const NOT_BROWSER = new Set(['node', 'bin', 'test', 'fixtures', 'node_modules'])

/**
 * What a Vite dev server pre-bundles for Presmium's packages and plugins that
 * are installed under node_modules, as from npm (`optimizeDeps.include`,
 * P-141). Vite does not look into the imports of a dependency, and such a
 * package is one: the CommonJS packages its browser code imports (semver;
 * debug, under micromark) would reach the browser unconverted. For each
 * package of `names` found from `root` in a node_modules directory, the
 * imports of its browser files (all but `node/`, `bin/` and tests) that name
 * one of its own `dependencies`, in Vite's nested form `<package> > <import>`.
 * A package linked from Presmium's workspace is a source that Vite scans
 * itself, and a plugin named by its path is not found: none for them.
 */
export function installedDependencies(names: Iterable<string>, root: string): string[] {
  const include = new Set<string>()
  for (const name of names) {
    const dir = name.startsWith('.') || name.startsWith('/') ? undefined : installedDir(name, root)
    if (dir) for (const specifier of dependencyImports(dir)) include.add(`${name} > ${specifier}`)
  }
  return [...include].sort()
}

/** The browser imports of the installed package in `dir` that name its own dependencies; a package does not change while a server runs. */
const imports = new Map<string, string[]>()
function dependencyImports(dir: string): string[] {
  let found = imports.get(dir)
  if (!found) {
    const { dependencies = {} } = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { dependencies?: Record<string, string> }
    found = [...browserImports(dir)].filter(specifier => Object.hasOwn(dependencies, packageName(specifier)) && !PROVIDED.test(packageName(specifier)) && !STYLE.test(specifier))
    imports.set(dir, found)
  }
  return found
}

/** The real directory of the package `name` found from `from` up, when it lies under node_modules. */
function installedDir(name: string, from: string): string | undefined {
  for (let d = resolve(from); ; d = dirname(d)) {
    const dir = join(d, 'node_modules', name)
    if (existsSync(join(dir, 'package.json'))) {
      const real = realpathSync(dir)
      return real.split(sep).includes('node_modules') ? real : undefined
    }
    if (dirname(d) === d) return undefined
  }
}

/** The packages and package paths the browser files under `dir` import. */
function browserImports(dir: string, found = new Set<string>(), top = true): Set<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!NOT_BROWSER.has(entry.name)) browserImports(path, found, false)
    } else if (SOURCE.test(entry.name) && !DECLARATION.test(entry.name) && !(top && entry.name === 'vite.config.ts')) {
      for (const match of readFileSync(path, 'utf8').matchAll(IMPORT)) found.add((match[1] ?? match[2] ?? match[3])!)
    }
  }
  return found
}

/** The package an import names: `semver/functions/satisfies.js` is `semver`, `@scope/pkg/sub` is `@scope/pkg`. */
function packageName(specifier: string): string {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!
}
