#!/usr/bin/env node
// Enforces the layering rules of docs/architecture.md section 3 across all packages.
// Every module reference counts: static and dynamic imports, re-exports and require(). The N wave's rules
// (docs/design-dsh.md 3.2) add what a file's text says of the workbench, and what a package.json depends on.
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
/** The package directory's name, e.g. `addon-exec`. */
const pkgName = pkgDir => pkgDir.split(sep).filter(Boolean).at(-1)
/** A file's path in its package, with `/` separators. */
const inPackage = (file, pkgDir) => relative(pkgDir, file).split(sep).join('/')

// Clients of external protocols and vendors, each in one adapter only (docs/architecture.md section 3, v0.8).
const ADAPTERS = [
  { name: '@modelcontextprotocol/*', pattern: /^@modelcontextprotocol\//, allowed: pkg => pkg === 'mcp' },
  { name: '@agentclientprotocol/sdk', pattern: /^@agentclientprotocol\/sdk(\/|$)/, allowed: (pkg, path) => pkg === 'addon-assistant' && path.startsWith('src/node/') },
  { name: '@jupyterlab/services', pattern: /^@jupyterlab\/services(\/|$)/, allowed: pkg => pkg === 'addon-exec-jupyter' },
  { name: '@xterm/*', pattern: /^@xterm\//, allowed: pkg => pkg === 'addon-exec-jupyter' },
  { name: 'mediabunny', pattern: /^mediabunny(\/|$)/, allowed: pkg => pkg === 'addon-lecture' },
  { name: 'deltabox-lite', pattern: /^deltabox-lite(\/|$)/, allowed: (pkg, path) => pkg === 'addon-deltabox' && path.startsWith('src/node/') },
  { name: 'simple-git', pattern: /^simple-git(\/|$)/, allowed: (_pkg, path) => path.startsWith('src/node/') },
]

// Each rule applies to the files under `dirs` of a package (and its `files`), in the packages
// `pkgs` names (all when absent) but those `except` names; `skip` leaves out subdirectories.
const rules = [
  {
    name: 'domain is pure TS',
    dirs: ['src/domain'],
    forbid: (spec, file, pkgDir) => vue(spec) || /^(vitepress|@slidev\/|@presmium\/host)/.test(spec) || nodeBuiltin(spec)
      || (target(spec, file, pkgDir) !== undefined && outside(target(spec, file, pkgDir), join('src', 'domain'))),
  },
  // The kernel runs in the browser too; its Node helpers (`@presmium/kernel/node`) are in src/node, which the rest never imports.
  {
    name: 'kernel is framework-free',
    pkgs: ['kernel'],
    dirs: ['src'],
    skip: ['node'],
    forbid: (spec, file, pkgDir) => vue(spec) || /^(vitepress|@slidev\/)/.test(spec) || nodeBuiltin(spec)
      || (target(spec, file, pkgDir) !== undefined && !outside(target(spec, file, pkgDir), join('src', 'node'))),
  },
  { name: 'kernel/node is framework-free', pkgs: ['kernel'], dirs: ['src/node'], forbid: spec => vue(spec) || /^(vitepress|@slidev\/)/.test(spec) },
  { name: 'IR runtime is form-neutral', pkgs: ['viewer'], dirs: ['src'], forbid: spec => /^(vitepress|@slidev\/)/.test(spec) },
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
  // v0.8 (WP-73a): the server packages, the hosts plugins do not use, and the protocol adapters.
  { name: 'node packages are framework-free', pkgs: ['server', 'mcp'], dirs: ['src'], forbid: spec => vue(spec) || /^(vitepress|@slidev\/)/.test(spec) || /^@presmium\/(viewer|web|host)(\/|$)/.test(spec) },
  { name: 'only cli and workspace use the server', pkgs: pkg => !['cli', 'workspace', 'server'].includes(pkg), dirs: ['.'], skip: ['test'], forbid: spec => /^@presmium\/server(\/|$)/.test(spec) },
  // N wave (WP-96b): the bundle of DeepSeek Harness is MCP's second user (its client side, `@presmium/mcp/client`).
  { name: 'only the server and the dsh bundle use mcp', pkgs: pkg => !['server', 'mcp', 'dsh'].includes(pkg), dirs: ['.'], skip: ['test'], forbid: spec => /^@presmium\/mcp(\/|$)/.test(spec) },
  { name: 'plugins use contracts, not the hosts', pkgs: pkg => pkg.startsWith('addon-'), dirs: ['.'], skip: ['test'], forbid: spec => /^@presmium\/(server|mcp|workspace|web)(\/|$)/.test(spec) },
  {
    name: 'protocol clients stay in their adapter',
    dirs: ['.'],
    skip: ['test'],
    forbid: (spec, file, pkgDir) => ADAPTERS.some(adapter => adapter.pattern.test(spec) && !adapter.allowed(pkgName(pkgDir), inPackage(file, pkgDir))),
  },
  // N wave (docs/design-dsh.md 3.2, WP-96b).
  { name: 'DeepSeek Harness only in dsh and studio (G-9)', dirs: ['.'], forbid: (spec, _file, pkgDir) => DSH.test(spec) && !DSH_PACKAGES.includes(pkgName(pkgDir)) },
  { name: 'the workbench\'s panels know no host', pkgs: ['workbench'], dirs: ['.'], skip: ['test'], forbid: spec => vue(spec) || DSH.test(spec) || /^@presmium\/host(\/|$)/.test(spec) },
  { name: 'the design system uses no package', pkgs: ['design'], dirs: ['.'], skip: ['test'], forbid: spec => !spec.startsWith('.') },
  { name: 'outputs do not use the workbench', pkgs: pkg => PRODUCTS(pkg) || pkg.startsWith('addon-'), dirs: ['.'], skip: ['test'], forbid: spec => /^@presmium\/workbench(\/|$)/.test(spec) },
]

// N wave (docs/design-dsh.md 3.2, decision G-9): DeepSeek Harness is referenced, and depended on, only by these
// packages; `addon-assistant` (the old workbench's ACP runtime) until WP-96g.
const DSH = /^@deepseek-ai\//
const DSH_PACKAGES = ['dsh', 'studio', 'addon-assistant']

/**
 * The outputs (G-1): the packages of the web page and the slides, and each plugin's `src/client` and
 * `components`. They know nothing of the workbench: no `EDIT_MODE` and none of the workbench's toolbar slots
 * (`home`, `create`, `files`, `tabs`, `source`, `dock`), read from the files' text.
 */
const PRODUCTS = pkg => ['web', 'viewer', 'addon-core'].includes(pkg) || pkg.startsWith('render-')
const WORKBENCH_SLOTS = '(?:home|create|files|tabs|source|dock)'
const WORKBENCH = [
  { what: 'EDIT_MODE', pattern: /\bEDIT_MODE\b/ },
  { what: 'a workbench slot', pattern: new RegExp(`\\bslot:\\s*['"]${WORKBENCH_SLOTS}['"]|\\bbySlot\\(\\s*['"]${WORKBENCH_SLOTS}['"]|\\bslots\\.value\\.has\\(\\s*['"]${WORKBENCH_SLOTS}['"]`) },
]
/**
 * The old workbench's references in the outputs today (docs/design-dsh.md 13.3, rows 4 to 7 and 12, 14),
 * allowed until WP-96g removes them and empties this list. Paths relative to the repository root.
 */
const OLD_WORKBENCH = new Set([
  'packages/web/src/client/theme.ts',
  'packages/web/src/client/home.ts',
  'packages/viewer/src/rich.ts',
  'packages/addon-assistant/src/client/EditPanel.vue',
  'packages/addon-assistant/src/client/dock.ts',
  'packages/addon-lecture/src/client/dock.ts',
  'packages/addon-lecture/src/client/WritebackDock.vue',
])

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

// The outputs' text: no EDIT_MODE, no workbench slot (but the old workbench's, listed above).
for (const pkg of readdirSync(join(root, 'packages'))) {
  const pkgDir = join(root, 'packages', pkg)
  const dirs = PRODUCTS(pkg) ? ['.'] : pkg.startsWith('addon-') ? ['src/client', 'components'] : []
  for (const file of dirs.flatMap(dir => files(join(pkgDir, dir), ['test']))) {
    const where = relative(root, file)
    if (OLD_WORKBENCH.has(where)) continue
    // The code, not what its comments say of the workbench.
    const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
    for (const { what, pattern } of WORKBENCH) if (pattern.test(text)) violations.push(`${where}: ${what}  (outputs do not know the workbench)`)
  }
}

// What the packages depend on: DeepSeek Harness only in dsh and studio (G-9).
for (const pkg of readdirSync(join(root, 'packages'))) {
  const manifest = join(root, 'packages', pkg, 'package.json')
  if (!existsSync(manifest) || DSH_PACKAGES.includes(pkg)) continue
  const { dependencies = {}, devDependencies = {}, peerDependencies = {} } = JSON.parse(readFileSync(manifest, 'utf8'))
  for (const name of Object.keys({ ...dependencies, ...devDependencies, ...peerDependencies })) {
    if (DSH.test(name)) violations.push(`${relative(root, manifest)}: ${name}  (DeepSeek Harness only in dsh and studio (G-9))`)
  }
}

if (violations.length) {
  console.error(`layering violations:\n${[...new Set(violations)].join('\n')}`)
  process.exit(1)
}
console.log('layering ok')
