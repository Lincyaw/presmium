#!/usr/bin/env node
// Enforces the layering rules of docs/architecture.md section 3 across all packages.
// Every module reference counts: static and dynamic imports, re-exports and require().
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { dirname, join, relative, resolve, sep } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const REFERENCE = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)['"]([^'"]+)['"]/g
const BUILTINS = new Set(builtinModules)

/** `node:fs`, or a bare built-in such as `fs` or `fs/promises`. */
const nodeBuiltin = spec => spec.startsWith('node:') || BUILTINS.has(spec) || BUILTINS.has(spec.split('/')[0])
/** Where a relative reference points, relative to the package; undefined for package names. */
const target = (spec, file, pkgDir) => spec.startsWith('.') ? relative(pkgDir, resolve(dirname(file), spec)) : undefined
const outside = (path, dir) => path === '..' || path.startsWith(`..${sep}`) || (dir !== '.' && path !== dir && !path.startsWith(dir + sep))

const rules = [
  {
    name: 'domain is pure TS',
    dirs: ['src/domain'],
    forbid: (spec, file, pkgDir) => /^(vue|vitepress|@slidev\/|@presmium\/host)/.test(spec) || nodeBuiltin(spec)
      || (target(spec, file, pkgDir) !== undefined && outside(target(spec, file, pkgDir), join('src', 'domain'))),
  },
  { name: 'kernel is framework-free', pkgs: ['kernel'], dirs: ['src'], forbid: spec => /^(vue|vitepress|@slidev\/)/.test(spec) || nodeBuiltin(spec) },
  { name: 'host is form-neutral', pkgs: ['host'], dirs: ['src'], forbid: spec => /^(vitepress|@slidev\/)/.test(spec) },
  { name: 'components use @presmium/host, not a framework host', dirs: ['components', 'src/client'], except: ['addon-core', 'web'], forbid: spec => /^(vitepress|@slidev\/client)/.test(spec) },
  { name: 'components use no Slidev package but @slidev/client', dirs: ['components', 'src/client'], forbid: spec => /^@slidev\/(?!client$)/.test(spec) },
  { name: 'node adapters do not use vue', dirs: ['src/node'], forbid: spec => /^(vue(\/|$)|@vue\/)/.test(spec) },
  { name: 'only web uses vitepress', dirs: ['.'], except: ['web'], forbid: spec => /^vitepress/.test(spec) },
  { name: 'no framework internals', dirs: ['.'], forbid: spec => /^@slidev\/client\/(?!index)|^vitepress\/dist|^@slidev\/cli\/dist/.test(spec) },
  { name: 'addons do not import each other', pkgs: name => name.startsWith('addon-'), dirs: ['.'], forbid: spec => /^@presmium\/slidev-addon-/.test(spec) },
  { name: 'relative imports stay in their package', dirs: ['.'], forbid: (spec, file, pkgDir) => target(spec, file, pkgDir) !== undefined && outside(target(spec, file, pkgDir), '.') },
]

function files(dir) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter(f => /\.(ts|vue|mts|mjs|js|cjs)$/.test(f) && !f.split(sep).includes('node_modules'))
    .map(f => join(dir, f))
}

const applies = (rule, pkg) => (typeof rule.pkgs === 'function' ? rule.pkgs(pkg) : !rule.pkgs || rule.pkgs.includes(pkg)) && !rule.except?.includes(pkg)

const violations = []
for (const pkg of readdirSync(join(root, 'packages'))) {
  const pkgDir = join(root, 'packages', pkg)
  for (const rule of rules.filter(r => applies(r, pkg))) {
    for (const dir of rule.dirs) {
      for (const file of files(join(pkgDir, dir))) {
        for (const [, spec] of readFileSync(file, 'utf8').matchAll(REFERENCE)) {
          if (rule.forbid(spec, file, pkgDir)) violations.push(`${relative(root, file)}: ${spec}  (${rule.name})`)
        }
      }
    }
  }
}

if (violations.length) {
  console.error(`layering violations:\n${[...new Set(violations)].join('\n')}`)
  process.exit(1)
}
console.log('layering ok')
