#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { dirname, join, relative, resolve, sep } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const REFERENCE = /(?:\bfrom\s+|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)['"]([^'"]+)['"]/g
const BUILTINS = new Set(builtinModules)
const GLOBAL_LAYERS = ['global-top.vue', 'global-bottom.vue', 'custom-nav-controls.vue', 'slide-top.vue', 'slide-bottom.vue']

const nodeBuiltin = spec => spec.startsWith('node:') || BUILTINS.has(spec) || BUILTINS.has(spec.split('/')[0])
const vue = spec => /^(vue(\/|$)|@vue\/)/.test(spec)
const target = (spec, file, pkgDir) => spec.startsWith('.') ? relative(pkgDir, resolve(dirname(file), spec)) : undefined
const outside = (path, dir) => path === '..' || path.startsWith(`..${sep}`) || (dir !== '.' && path !== dir && !path.startsWith(dir + sep))
const pkgName = pkgDir => pkgDir.split(sep).filter(Boolean).at(-1)
const inPackage = (file, pkgDir) => relative(pkgDir, file).split(sep).join('/')

const ADAPTERS = [
  { name: '@modelcontextprotocol/*', pattern: /^@modelcontextprotocol\//, allowed: pkg => pkg === 'mcp' },
  { name: '@jupyterlab/services', pattern: /^@jupyterlab\/services(\/|$)/, allowed: pkg => pkg === 'addon-exec-jupyter' },
  { name: '@xterm/*', pattern: /^@xterm\//, allowed: pkg => pkg === 'addon-exec-jupyter' },
  { name: 'mediabunny', pattern: /^mediabunny(\/|$)/, allowed: pkg => pkg === 'addon-lecture' },
  { name: 'simple-git', pattern: /^simple-git(\/|$)/, allowed: (_pkg, path) => path.startsWith('src/node/') },
]

const rules = [
  {
    name: 'domain is pure TS',
    dirs: ['src/domain'],
    forbid: (spec, file, pkgDir) => vue(spec) || /^(vitepress|@slidev\/|@lincyaw\/host)/.test(spec) || nodeBuiltin(spec)
      || (target(spec, file, pkgDir) !== undefined && outside(target(spec, file, pkgDir), join('src', 'domain'))),
  },
  {
    name: 'shared code runs in Node and in the browser',
    dirs: ['src/shared'],
    forbid: (spec, file, pkgDir) => vue(spec) || /^(vitepress|@slidev\/|@lincyaw\/host|@lincyaw\/kernel\/node)(\/|$)/.test(spec) || nodeBuiltin(spec)
      || (target(spec, file, pkgDir) !== undefined && outside(target(spec, file, pkgDir), join('src', 'shared')) && outside(target(spec, file, pkgDir), join('src', 'domain'))),
  },
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
  { name: 'components use @lincyaw/host, not vitepress', dirs: ['components', 'src/client'], except: ['web'], forbid: spec => /^vitepress/.test(spec) },
  { name: 'components use @lincyaw/host, not @slidev/client', dirs: ['components', 'src/client'], except: ['addon-core'], forbid: spec => /^@slidev\/client(\/|$)/.test(spec) },
  { name: 'components use no Slidev package but @slidev/client', dirs: ['components', 'src/client'], forbid: spec => /^@slidev\/(?!client$)/.test(spec) },
  { name: 'setup/ and global layers use only @slidev/client and @slidev/types of Slidev', dirs: ['setup'], files: GLOBAL_LAYERS, forbid: spec => /^@slidev\/(?!(client|types)$)/.test(spec) },
  { name: 'node adapters do not use vue', dirs: ['src/node'], forbid: spec => vue(spec) },
  { name: 'only web uses vitepress', dirs: ['.'], except: ['web'], forbid: spec => /^vitepress/.test(spec) },
  { name: 'no framework internals', dirs: ['.'], forbid: spec => /^@slidev\/client\/(?!index)|^vitepress\/dist|^@slidev\/cli\/dist/.test(spec) },
  { name: 'no package uses an addon', dirs: ['.'], skip: ['test'], forbid: spec => /^@lincyaw\/slidev-addon-/.test(spec) },
  { name: 'relative imports stay in their package', dirs: ['.'], forbid: (spec, file, pkgDir) => target(spec, file, pkgDir) !== undefined && outside(target(spec, file, pkgDir), '.') },
  { name: 'node packages are framework-free', pkgs: ['server', 'mcp'], dirs: ['src'], forbid: spec => vue(spec) || /^(vitepress|@slidev\/)/.test(spec) || /^@lincyaw\/(viewer|web|host)(\/|$)/.test(spec) },
  { name: 'only cli and workspace use the server', pkgs: pkg => !['cli', 'workspace', 'server'].includes(pkg), dirs: ['.'], skip: ['test'], forbid: spec => /^@lincyaw\/server(\/|$)/.test(spec) },
  { name: 'only the server and the dsh bundle use mcp', pkgs: pkg => !['server', 'mcp', 'dsh'].includes(pkg), dirs: ['.'], skip: ['test'], forbid: spec => /^@lincyaw\/mcp(\/|$)/.test(spec) },
  { name: 'plugins use contracts, not the hosts', pkgs: pkg => pkg.startsWith('addon-'), dirs: ['.'], skip: ['test'], forbid: spec => /^@lincyaw\/(server|mcp|workspace|web)(\/|$)/.test(spec) },
  {
    name: 'protocol clients stay in their adapter',
    dirs: ['.'],
    skip: ['test'],
    forbid: (spec, file, pkgDir) => ADAPTERS.some(adapter => adapter.pattern.test(spec) && !adapter.allowed(pkgName(pkgDir), inPackage(file, pkgDir))),
  },
  { name: 'DeepSeek Harness only in dsh and studio', dirs: ['.'], forbid: (spec, _file, pkgDir) => DSH.test(spec) && !DSH_PACKAGES.includes(pkgName(pkgDir)) },
  { name: 'the workbench\'s panels know no host', pkgs: ['workbench'], dirs: ['.'], skip: ['test'], forbid: spec => vue(spec) || DSH.test(spec) || /^@lincyaw\/host(\/|$)/.test(spec) },
  { name: 'the design system only uses framework-free icons', pkgs: ['design'], dirs: ['.'], skip: ['test'], forbid: spec => !spec.startsWith('.') && spec !== 'lucide' },
  { name: 'outputs do not use the workbench', pkgs: pkg => isProductPackage(pkg) || pkg.startsWith('addon-'), dirs: ['.'], skip: ['test'], forbid: spec => /^@lincyaw\/workbench(\/|$)/.test(spec) },
]

const DSH = /^@deepseek-ai\//
const DSH_PACKAGES = ['dsh', 'studio']
const isProductPackage = pkg => ['web', 'viewer', 'addon-core'].includes(pkg) || pkg.startsWith('render-')

const SOURCE = /\.(ts|tsx|vue|mts|mjs|js|jsx|cjs)$/

function files(dir, skip = []) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || skip.includes(entry.name)) return []
    const file = join(dir, entry.name)
    return entry.isDirectory() ? files(file, skip) : SOURCE.test(entry.name) ? [file] : []
  })
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

for (const pkg of readdirSync(join(root, 'packages'))) {
  const manifest = join(root, 'packages', pkg, 'package.json')
  if (!existsSync(manifest) || DSH_PACKAGES.includes(pkg)) continue
  const { dependencies = {}, devDependencies = {}, peerDependencies = {} } = JSON.parse(readFileSync(manifest, 'utf8'))
  for (const name of Object.keys({ ...dependencies, ...devDependencies, ...peerDependencies })) {
    if (DSH.test(name)) violations.push(`${relative(root, manifest)}: ${name}  (DeepSeek Harness only in dsh and studio)`)
  }
}

if (violations.length) {
  console.error(`layering violations:\n${[...new Set(violations)].join('\n')}`)
  process.exit(1)
}
console.log('layering ok')
