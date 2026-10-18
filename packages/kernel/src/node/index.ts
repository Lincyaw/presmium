/**
 * `@presmium/kernel/node`: what the Node sides of the renderers, the
 * compiler and the hosts share that needs Node's own modules; the browser
 * never loads it (scripts/check-layering.mjs).
 */
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { createRequire, findPackageJSON } from 'node:module'
import { dirname, join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
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
 * Each face's copyright, as NOTICE gives it, by Fontsource package: the
 * license file of @fontsource/source-serif-4 names "Google Inc." only.
 */
const FONT_COPYRIGHTS: Record<string, string> = {
  '@fontsource/ibm-plex-mono': 'IBM Plex Mono: Copyright 2017 IBM Corp. All rights reserved.',
  '@fontsource/ibm-plex-sans': 'IBM Plex Sans: Copyright 2019 IBM Corp. All rights reserved.',
  '@fontsource/source-serif-4': 'Source Serif 4: Copyright 2014 - 2021 Adobe Systems Incorporated (http://www.adobe.com/), with Reserved Font Name \'Source\'.',
}

/**
 * The license of the faces @presmium/host bundles into every site (SIL Open
 * Font License 1.1, NOTICE): for each Fontsource package it depends on, found
 * from `from` (a renderer's module), the face's copyright and the package's
 * license file, one after the other.
 */
export function fontLicense(from: string | URL): string {
  const manifest = findPackageJSON('@presmium/host', from)
  if (!manifest) throw new Error('@presmium/host is not installed')
  const { dependencies = {} } = JSON.parse(readFileSync(manifest, 'utf8')) as { dependencies?: Record<string, string> }
  const require = createRequire(manifest)
  const files = Object.keys(dependencies).filter(name => name.startsWith('@fontsource/')).sort().map((name) => {
    const copyright = FONT_COPYRIGHTS[name] ? `${FONT_COPYRIGHTS[name]}\n\n` : ''
    return `${name}\n\n${copyright}${readFileSync(require.resolve(`${name}/LICENSE`), 'utf8').trim()}\n`
  })
  return [`The fonts of this site, from Fontsource, with their copyrights and licenses (SIL Open Font License 1.1).\n`, ...files].join(`\n${'='.repeat(78)}\n\n`)
}

/**
 * The Node options of a process that runs a renderer's framework (VitePress,
 * Slidev) and so may import Presmium's packages natively: `--import` of
 * ./strip-types.mjs, which strips the types of TypeScript under node_modules,
 * as installed from npm (P-141), where Node does not.
 */
export const TYPESCRIPT_IMPORT: readonly string[] = ['--import', new URL('./strip-types.mjs', import.meta.url).href]

/** Packages a framework provides itself (one Vue for the page): never pre-bundled through a plugin. */
const PROVIDED = /^(?:vue|@vue\/.*|vitepress|@slidev\/.*)$/
/** Presmium's packages: followed into, never pre-bundled. */
const PRESMIUM = /^@presmium\//
/** A module's static and dynamic imports of packages, type-only imports aside. */
const IMPORT = /(?:^|\n)\s*(?:import|export)(?!\s+type\b)[^'"`;]*?\bfrom\s*['"]([^'"./][^'"]*)['"]|(?:^|\n)\s*import\s*['"]([^'"./][^'"]*)['"]|\bimport\(\s*['"]([^'"./][^'"]*)['"]\s*\)/g
const SOURCE = /\.(?:[cm]?[jt]s|vue)$/
const DECLARATION = /\.d\.[cm]?ts$/
const STYLE = /\.(?:css|scss|sass|less|styl)$/
/** Directories of a package that hold no browser code. */
const NOT_BROWSER = new Set(['node', 'bin', 'test', 'fixtures', 'node_modules'])

/**
 * Prepares a Vite dev server whose project lies in `root` for the packages
 * installed under node_modules, as from npm, whose browser code it loads
 * (P-141), and returns what it pre-bundles (`optimizeDeps.include`). Vite
 * does not look into the imports of a dependency, and such a package is
 * one: the CommonJS packages its browser code imports (semver; debug, under
 * micromark) would reach the browser unconverted. `packages` are the
 * directories of the packages the pages load (the renderer's own, the
 * deck's plugins); the Presmium packages their browser code imports come
 * with them. For each one under node_modules, the imports of its browser
 * files (all but `node/`, `bin/` and tests) that name one of its own
 * dependencies, in Vite's nested form `<package> > <import>`. Vite finds
 * `<package>` from `root`, which may lie outside the project (`presmium
 * serve` keeps its sites in its state directory, `presmium dev --out`
 * anywhere): each such package is linked into `root/node_modules`. A
 * package linked from Presmium's workspace is a source that Vite scans
 * itself, and so is a deck's own directory: nothing for them.
 */
export function preBundle(root: string, packages: Iterable<string>): string[] {
  const include = new Set<string>()
  const seen = new Set<string>()
  const visit = (dir: string): void => {
    const real = realpathSync(dir)
    if (seen.has(real) || !real.split(sep).includes('node_modules')) return
    seen.add(real)
    const { name, imports, presmium } = browserDependencies(real)
    if (imports.length > 0) linkPackage(root, name, real)
    for (const specifier of imports) include.add(`${name} > ${specifier}`)
    for (const dependency of presmium) {
      const manifest = findPackageJSON(dependency, pathToFileURL(join(real, 'package.json')))
      if (manifest) visit(dirname(manifest))
    }
  }
  for (const dir of packages) if (existsSync(join(dir, 'package.json'))) visit(dir)
  return [...include].sort()
}

/** The directory of the package that holds `file`, by its nearest `package.json`. */
export function packageOf(file: string): string | undefined {
  const manifest = findPackageJSON(pathToFileURL(file))
  return manifest && dirname(manifest)
}

/** Links the package in `dir` into `root/node_modules` under its name; a link there to another directory is replaced. */
function linkPackage(root: string, name: string, dir: string): void {
  const link = join(root, 'node_modules', name)
  const stat = lstatSync(link, { throwIfNoEntry: false })
  if (stat?.isSymbolicLink() && readlinkSync(link) === dir) return
  if (stat && !stat.isSymbolicLink()) return
  rmSync(link, { force: true })
  mkdirSync(dirname(link), { recursive: true })
  symlinkSync(dir, link, 'junction')
}

interface BrowserDependencies {
  name: string
  /** Imports that name one of its dependencies, Presmium's and the frameworks' aside: what Vite pre-bundles. */
  imports: string[]
  /** Presmium's packages it imports, among its dependencies and peers. */
  presmium: string[]
}

/** What the browser files of the installed package in `dir` import of its dependencies; a package does not change while a server runs. */
const dependencies = new Map<string, BrowserDependencies>()
function browserDependencies(dir: string): BrowserDependencies {
  let found = dependencies.get(dir)
  if (!found) {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name: string, dependencies?: Record<string, string>, peerDependencies?: Record<string, string> }
    const own = (specifier: string) => Object.hasOwn(pkg.dependencies ?? {}, packageName(specifier))
    const specifiers = [...browserImports(dir)]
    found = {
      name: pkg.name,
      imports: specifiers.filter(specifier => own(specifier) && !PROVIDED.test(packageName(specifier)) && !PRESMIUM.test(specifier) && !STYLE.test(specifier)),
      presmium: [...new Set(specifiers.filter(specifier => PRESMIUM.test(specifier)).map(packageName))]
        .filter(name => Object.hasOwn({ ...pkg.dependencies, ...pkg.peerDependencies }, name)),
    }
    dependencies.set(dir, found)
  }
  return found
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
