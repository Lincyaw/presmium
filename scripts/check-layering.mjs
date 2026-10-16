#!/usr/bin/env node
// Enforces the layering rules of docs/architecture.md section 3 across all packages.
// Every module reference counts: static and dynamic imports, re-exports and require().
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { dirname, join, relative, resolve, sep } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const REFERENCE = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)['"]([^'"]+)['"]/g
const BUILTINS = new Set(builtinModules)
/** Slidev's global layers at the root of an addon: loaded in the slides form only, like setup/. */
const GLOBAL_LAYERS = ['global-top.vue', 'global-bottom.vue', 'custom-nav-controls.vue', 'slide-top.vue', 'slide-bottom.vue']

/** `node:fs`, or a bare built-in such as `fs` or `fs/promises`. */
const nodeBuiltin = spec => spec.startsWith('node:') || BUILTINS.has(spec) || BUILTINS.has(spec.split('/')[0])
/** `vue` itself or one of its own packages (`@vue/reactivity`, `@vue/runtime-core`, ...). */
const vue = spec => /^(vue(\/|$)|@vue\/)/.test(spec)
/** Where a relative reference points, relative to the package; undefined for package names. */
const target = (spec, file, pkgDir) => spec.startsWith('.') ? relative(pkgDir, resolve(dirname(file), spec)) : undefined
const outside = (path, dir) => path === '..' || path.startsWith(`..${sep}`) || (dir !== '.' && path !== dir && !path.startsWith(dir + sep))

// Each rule applies to the files under `dirs` of a package (and its `files`), in the packages
// `pkgs` names (all when absent) but those `except` names; `skip` leaves out subdirectories.
const rules = [
  {
    name: 'domain is pure TS',
    dirs: ['src/domain'],
    forbid: (spec, file, pkgDir) => vue(spec) || /^(vitepress|@slidev\/|@presmium\/host)/.test(spec) || nodeBuiltin(spec)
      || (target(spec, file, pkgDir) !== undefined && outside(target(spec, file, pkgDir), join('src', 'domain'))),
  },
  { name: 'kernel is framework-free', pkgs: ['kernel'], dirs: ['src'], forbid: spec => vue(spec) || /^(vitepress|@slidev\/)/.test(spec) || nodeBuiltin(spec) },
  { name: 'host is form-neutral', pkgs: ['host'], dirs: ['src'], forbid: spec => /^(vitepress|@slidev\/)/.test(spec) },
  { name: 'components use @presmium/host, not vitepress', dirs: ['components', 'src/client'], except: ['web'], forbid: spec => /^vitepress/.test(spec) },
  { name: 'components use @presmium/host, not @slidev/client', dirs: ['components', 'src/client'], except: ['addon-core'], forbid: spec => /^@slidev\/client(\/|$)/.test(spec) },
  { name: 'components use no Slidev package but @slidev/client', dirs: ['components', 'src/client'], forbid: spec => /^@slidev\/(?!client$)/.test(spec) },
  { name: 'setup/ and global layers use only @slidev/client and @slidev/types of Slidev', dirs: ['setup'], files: GLOBAL_LAYERS, forbid: spec => /^@slidev\/(?!(client|types)$)/.test(spec) },
  { name: 'node adapters do not use vue', dirs: ['src/node'], forbid: spec => vue(spec) },
  { name: 'only web uses vitepress', dirs: ['.'], except: ['web'], forbid: spec => /^vitepress/.test(spec) },
  { name: 'no framework internals', dirs: ['.'], forbid: spec => /^@slidev\/client\/(?!index)|^vitepress\/dist|^@slidev\/cli\/dist/.test(spec) },
  { name: 'no package uses an addon', dirs: ['.'], skip: ['test'], forbid: spec => /^@presmium\/slidev-addon-/.test(spec) },
  { name: 'relative imports stay in their package', dirs: ['.'], forbid: (spec, file, pkgDir) => target(spec, file, pkgDir) !== undefined && outside(target(spec, file, pkgDir), '.') },
]

const SOURCE = /\.(ts|tsx|vue|mts|mjs|js|jsx|cjs)$/

function files(dir, skip = []) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter(f => SOURCE.test(f) && !f.split(sep).some(part => part === 'node_modules' || skip.includes(part)))
    .map(f => join(dir, f))
}

const applies = (rule, pkg) => (typeof rule.pkgs === 'function' ? rule.pkgs(pkg) : !rule.pkgs || rule.pkgs.includes(pkg)) && !rule.except?.includes(pkg)

const violations = []
for (const pkg of readdirSync(join(root, 'packages'))) {
  const pkgDir = join(root, 'packages', pkg)
  for (const rule of rules.filter(r => applies(r, pkg))) {
    const checked = [
      ...rule.dirs.flatMap(dir => files(join(pkgDir, dir), rule.skip)),
      ...(rule.files ?? []).map(file => join(pkgDir, file)).filter(existsSync),
    ]
    for (const file of checked) {
      for (const [, spec] of readFileSync(file, 'utf8').matchAll(REFERENCE)) {
        if (rule.forbid(spec, file, pkgDir)) violations.push(`${relative(root, file)}: ${spec}  (${rule.name})`)
      }
    }
  }
}

if (violations.length) {
  console.error(`layering violations:\n${[...new Set(violations)].join('\n')}`)
  process.exit(1)
}
console.log('layering ok')
