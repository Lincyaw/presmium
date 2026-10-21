import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { findPackageJSON } from 'node:module'
import { dirname, join, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import resolve from 'enhanced-resolve'
import { parse } from 'es-module-lexer/js'

const PROVIDED = /^(?:vue|@vue\/.*|vitepress|@slidev\/.*)$/
const PRESMIUM = /^@lincyaw\//
const IMPORT = /(?:^|\n)\s*(?:import|export)(?!\s+type\b)[^'"`;]*?\bfrom\s*['"]([^'"./][^'"]*)['"]|(?:^|\n)\s*import\s*['"]([^'"./][^'"]*)['"]|\bimport\(\s*['"]([^'"./][^'"]*)['"]\s*\)/g
const SOURCE = /\.(?:[cm]?[jt]s|vue)$/
const DECLARATION = /\.d\.[cm]?ts$/
const STYLE = /\.(?:css|scss|sass|less|styl)$/
const NOT_BROWSER = new Set(['node', 'bin', 'test', 'fixtures', 'node_modules'])

const resolveBrowserImport = resolve.create.sync({
  conditionNames: ['browser', 'module', 'import', 'default', process.env.NODE_ENV === 'production' ? 'production' : 'development'],
  mainFields: ['browser', 'module', 'jsnext:main', 'jsnext', 'main'],
  aliasFields: ['browser'],
  extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json'],
})

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
    const { name, imports, presmium, optimization } = browserDependencies(real)
    if (imports.length > 0) linkPackage(root, name, real)
    for (const specifier of optimization.include) include.add(specifier)
    for (const specifier of optimization.exclude) exclude.add(specifier)
    for (const dependency of presmium) {
      const manifest = installedManifest(dependency, real)
      if (manifest) visit(dirname(manifest))
    }
  }
  for (const dir of packages) if (existsSync(join(dir, 'package.json'))) visit(dir)
  return { include: [...include].sort(), exclude: [...exclude].sort() }
}

function optimizeImports(dir: string, name: string, specifiers: string[]): { include: string[], exclude: string[] } {
  const include = new Set<string>()
  const exclude = new Set<string>([name])
  const modules = new Map<string, ReturnType<typeof parse>>()
  const imported = (dir: string, specifier: string, chain: string): void => {
    const file = resolveBrowserImport(dir, specifier)
    if (file === false) return
    const bare = !specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.startsWith('#')
    if (!/\.[cm]?js$/.test(file)) {
      if (bare) exclude.add(specifier)
      return
    }
    const known = modules.get(file)
    const parsed = known ?? parse(readFileSync(file, 'utf8'), file)
    modules.set(file, parsed)
    const [imports, , , hasModuleSyntax] = parsed
    if (!hasModuleSyntax) {
      include.add(bare ? chain : file)
      return
    }
    if (bare) exclude.add(specifier)
    if (known) return
    for (const { n: dependency } of imports) {
      if (!dependency || /^(?:[a-z][a-z\d+.-]*:|\/)/i.test(dependency) || PROVIDED.test(packageName(dependency)) || PRESMIUM.test(dependency) || STYLE.test(dependency)) continue
      const nested = dependency.startsWith('.') || dependency.startsWith('#') ? chain : `${chain} > ${dependency}`
      imported(dirname(file), dependency, nested)
    }
  }
  for (const specifier of specifiers) imported(dir, specifier, `${name} > ${specifier}`)
  return { include: [...include].sort(), exclude: [...exclude].sort() }
}

function installedManifest(name: string, dir: string): string | undefined {
  try {
    return findPackageJSON(name, pathToFileURL(join(dir, 'package.json')))
  } catch {
    return undefined
  }
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
  optimization: { include: string[], exclude: string[] }
}

const dependencies = new Map<string, BrowserDependencies>()
function browserDependencies(dir: string): BrowserDependencies {
  let found = dependencies.get(dir)
  if (!found) {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name: string, dependencies?: Record<string, string>, peerDependencies?: Record<string, string> }
    const own = (specifier: string) => Object.hasOwn(pkg.dependencies ?? {}, packageName(specifier))
    const specifiers = [...browserImports(dir)]
    const imports = specifiers.filter(specifier => own(specifier) && !PROVIDED.test(packageName(specifier)) && !PRESMIUM.test(specifier) && !STYLE.test(specifier))
    found = {
      name: pkg.name,
      imports,
      optimization: optimizeImports(dir, pkg.name, imports),
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
