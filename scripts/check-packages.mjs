#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const REPOSITORY = 'git+https://github.com/Lincyaw/presmium.git'
const SHARED = new Set(['@lincyaw/kernel', '@lincyaw/host', '@lincyaw/viewer', '@lincyaw/compiler'])
const UNSCOPED = new Set(['create-presmium'])
const ZERO_X_PACKAGES = new Set(['@lincyaw/workbench', '@lincyaw/dsh', '@lincyaw/studio'])

const read = file => JSON.parse(readFileSync(join(root, file), 'utf8'))
const rootPackage = read('package.json')
const license = readFileSync(join(root, 'LICENSE'), 'utf8')
const table = readFileSync(join(root, '.changeset/README.md'), 'utf8')
const rows = new Map([...table.matchAll(/^\| `([^`]+)` \| ([^|]+) \|/gm)].map(([, name, published]) => [name, published.trim()]))

const problems = []
const versions = new Set()
const globs = []
for (const line of readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8').split('packages:\n')[1]?.split('\n') ?? []) {
  const listed = /^\s+-\s+['"]?([^'"\s]+)['"]?\s*$/.exec(line)
  if (!listed) break
  globs.push(listed[1])
}
const workspaces = globs.flatMap(glob => (glob.endsWith('/*') ? readdirSync(join(root, glob.slice(0, -2))).sort().map(name => `${glob.slice(0, -2)}/${name}`) : [glob]))
  .filter(dir => existsSync(join(root, dir, 'package.json')))

function targets(value) {
  if (typeof value === 'string') return [value.replace(/^\.\//, '').replace(/\/?\*.*$/, '')]
  return value && typeof value === 'object' ? Object.values(value).flatMap(targets) : []
}

for (const dir of workspaces) {
  const pkg = read(`${dir}/package.json`)
  const at = `${dir}/package.json (${pkg.name})`
  const row = rows.get(pkg.name)
  if (!row) problems.push(`${at}: not in the table of .changeset/README.md`)
  if (pkg.private) {
    if (row && row !== '否') problems.push(`${at}: private, but the table says it is published`)
    continue
  }
  if (row && row !== 'npm') problems.push(`${at}: published, but the table says "${row}"`)
  if (!pkg.name.startsWith('@lincyaw/') && !UNSCOPED.has(pkg.name)) problems.push(`${at}: a public package is named @lincyaw/*`)
  if (ZERO_X_PACKAGES.has(pkg.name)) {
    if (!/^0\./.test(pkg.version)) problems.push(`${at}: a package of the workbench is 0.x (docs/studio.md 3.3), not ${pkg.version}`)
  } else {
    versions.add(pkg.version)
  }
  const generated = pkg.presmium?.generated ?? []
  const made = target => generated.some(dir => target === dir || target.startsWith(`${dir}/`))
  if (pkg.license !== 'Apache-2.0') problems.push(`${at}: license is ${JSON.stringify(pkg.license)}, not "Apache-2.0"`)
  if (!existsSync(join(root, dir, 'LICENSE')) || readFileSync(join(root, dir, 'LICENSE'), 'utf8') !== license) problems.push(`${at}: its LICENSE is not the root's`)
  if (pkg.engines?.node !== rootPackage.engines.node) problems.push(`${at}: engines.node is ${JSON.stringify(pkg.engines?.node)}, the root's is "${rootPackage.engines.node}"`)
  for (const field of ['description', 'homepage', 'bugs']) if (!pkg[field]) problems.push(`${at}: no ${field}`)
  if (pkg.repository?.url !== REPOSITORY || pkg.repository?.directory !== dir) problems.push(`${at}: repository is not { url: "${REPOSITORY}", directory: "${dir}" }`)
  if (!pkg.keywords?.includes('presmium')) problems.push(`${at}: keywords do not include "presmium"`)
  if (pkg.publishConfig?.access !== 'public') problems.push(`${at}: publishConfig.access is not "public"`)
  if (!Array.isArray(pkg.files) || pkg.files.length === 0) {
    problems.push(`${at}: no files`)
  } else {
    for (const file of pkg.files) if (!made(file) && !existsSync(join(root, dir, file))) problems.push(`${at}: files names ${file}, which does not exist`)
    for (const target of [...targets(pkg.exports), ...targets(pkg.bin)]) {
      if (target === 'package.json') continue
      if (!made(target) && !existsSync(join(root, dir, target))) problems.push(`${at}: ${target} (exports or bin) does not exist`)
      if (!pkg.files.some(file => target === file || target.startsWith(`${file}/`))) problems.push(`${at}: ${target} (exports or bin) is not in files`)
    }
  }
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
    for (const [name, range] of Object.entries(pkg[field] ?? {})) {
      if (name.startsWith('@lincyaw/') && !range.startsWith('workspace:')) problems.push(`${at}: ${field}.${name} is not a workspace: range`)
    }
  }
  if (pkg.exports?.['./presmium']) {
    for (const name of Object.keys(pkg.dependencies ?? {})) if (SHARED.has(name)) problems.push(`${at}: a plugin has ${name} as a peer dependency (workspace:^), not a dependency`)
    for (const [name, range] of Object.entries(pkg.peerDependencies ?? {})) {
      if (SHARED.has(name) && range !== 'workspace:^') problems.push(`${at}: peerDependencies.${name} is "${range}", not "workspace:^"`)
      if (SHARED.has(name) && !pkg.devDependencies?.[name]) problems.push(`${at}: ${name} is a peer but not a dev dependency (the workspace links it for the package's tests)`)
    }
  }
}
if (versions.size > 1) problems.push(`the public packages have several versions (${[...versions].join(', ')}); they are released together (.changeset/config.json, fixed)`)
const names = new Set(workspaces.map(dir => read(`${dir}/package.json`).name))
for (const name of rows.keys()) if (!names.has(name)) problems.push(`.changeset/README.md: ${name} is no workspace package`)

// New projects install the same packages: their install scripts need the repository's decisions, or pnpm refuses to install.
const builds = text => /^allowBuilds:\n(?: .*\n)+/m.exec(text)?.[0]
const rootBuilds = builds(readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8'))
for (const template of ['templates/workspace/pnpm-workspace.yaml', 'templates/plugin/pnpm-workspace.yaml']) {
  if (builds(readFileSync(join(root, template), 'utf8')) !== rootBuilds) problems.push(`${template}: allowBuilds differs from pnpm-workspace.yaml`)
}

if (problems.length) {
  console.error(`package problems:\n${problems.join('\n')}`)
  process.exit(1)
}
console.log(`packages ok: ${workspaces.length} workspace packages as .changeset/README.md lists them; the public ones at ${[...versions].join('')}`)
