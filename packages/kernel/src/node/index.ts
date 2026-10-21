import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { createRequire, findPackageJSON } from 'node:module'
import { dirname, join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { LocalAsset } from '../ir.ts'
export { backgroundPriority, NODE_RESOURCE_ARGS, resourceEnvironment } from './resources.ts'

export function copyPublished(found: LocalAsset, dir: string): string {
  const target = join(dir, found.name)
  if (!existsSync(target)) {
    mkdirSync(dir, { recursive: true })
    cpSync(found.file, target, { recursive: true })
  }
  return target
}

export const FONT_LICENSE = 'presmium/fonts/LICENSE'

const FONT_COPYRIGHTS: Record<string, string> = {
  '@fontsource/ibm-plex-mono': 'IBM Plex Mono: Copyright 2017 IBM Corp. All rights reserved.',
  '@fontsource/ibm-plex-sans': 'IBM Plex Sans: Copyright 2019 IBM Corp. All rights reserved.',
  '@fontsource/source-serif-4': 'Source Serif 4: Copyright 2014 - 2021 Adobe Systems Incorporated (http://www.adobe.com/), with Reserved Font Name \'Source\'.',
}

export function fontLicense(from: string | URL): string {
  const manifest = findPackageJSON('@lincyaw/host', from)
  if (!manifest) throw new Error('@lincyaw/host is not installed')
  const { dependencies = {} } = JSON.parse(readFileSync(manifest, 'utf8')) as { dependencies?: Record<string, string> }
  const require = createRequire(manifest)
  const files = Object.keys(dependencies).filter(name => name.startsWith('@fontsource/')).sort().map((name) => {
    const copyright = FONT_COPYRIGHTS[name] ? `${FONT_COPYRIGHTS[name]}\n\n` : ''
    return `${name}\n\n${copyright}${readFileSync(require.resolve(`${name}/LICENSE`), 'utf8').trim()}\n`
  })
  return [`The fonts of this site, from Fontsource, with their copyrights and licenses (SIL Open Font License 1.1).\n`, ...files].join(`\n${'='.repeat(78)}\n\n`)
}

export const TYPESCRIPT_IMPORT: readonly string[] = ['--import', new URL('./strip-types.mjs', import.meta.url).href]

const PROVIDED = /^(?:vue|@vue\/.*|vitepress|@slidev\/.*)$/
const PRESMIUM = /^@lincyaw\//
const IMPORT = /(?:^|\n)\s*(?:import|export)(?!\s+type\b)[^'"`;]*?\bfrom\s*['"]([^'"./][^'"]*)['"]|(?:^|\n)\s*import\s*['"]([^'"./][^'"]*)['"]|\bimport\(\s*['"]([^'"./][^'"]*)['"]\s*\)/g
const SOURCE = /\.(?:[cm]?[jt]s|vue)$/
const DECLARATION = /\.d\.[cm]?ts$/
const STYLE = /\.(?:css|scss|sass|less|styl)$/
const NOT_BROWSER = new Set(['node', 'bin', 'test', 'fixtures', 'node_modules'])

export function preBundle(root: string, packages: Iterable<string>): string[] {
  return optimizeDeps(root, packages).include
}

export function optimizeDeps(root: string, packages: Iterable<string>): { include: string[], exclude: string[] } {
  const include = new Set<string>()
  const exclude = new Set<string>()
  const seen = new Set<string>()
  const visit = (dir: string): void => {
    const real = realpathSync(dir)
    if (seen.has(real) || !real.split(sep).includes('node_modules')) return
    seen.add(real)
    const { name, imports, presmium } = browserDependencies(real)
    exclude.add(name)
    if (imports.length > 0) linkPackage(root, name, real)
    for (const specifier of imports) include.add(`${name} > ${specifier}`)
    for (const dependency of presmium) {
      const manifest = installedManifest(dependency, real)
      if (manifest) visit(dirname(manifest))
    }
  }
  for (const dir of packages) if (existsSync(join(dir, 'package.json'))) visit(dir)
  return { include: [...include].sort(), exclude: [...exclude].sort() }
}

function installedManifest(name: string, dir: string): string | undefined {
  try {
    return findPackageJSON(name, pathToFileURL(join(dir, 'package.json')))
  } catch {
    return undefined
  }
}

export function packageOf(file: string): string | undefined {
  const manifest = findPackageJSON(pathToFileURL(file))
  return manifest && dirname(manifest)
}

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
  imports: string[]
  presmium: string[]
}

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

function packageName(specifier: string): string {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!
}
