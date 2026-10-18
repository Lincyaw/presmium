#!/usr/bin/env node
// What each workspace package (pnpm-workspace.yaml) publishes (P-140, P-141): the table of .changeset/README.md lists every
// package, public or private. A public package has the Apache-2.0 license (its `license` field and its
// own LICENSE, the root's), Presmium's one version, the root's `engines.node`, complete metadata
// (description, repository, homepage, bugs, keywords, publishConfig), `files` that exist and hold every
// file its `exports` and `bin` name, internal dependencies through `workspace:`; a plugin (a package
// with a `./presmium` entry) has the Presmium packages it shares with the application as peers. A
// private package is in the table's private rows. `pnpm -r publish --dry-run` packs what this allows.
// The workbench's packages of the N wave (docs/design-dsh.md 3.3) are 0.x, experimental, with versions of
// their own; what a package's `prepack` generates (`presmium.generated` in its package.json: the skills
// copied into @presmium/dsh, its precompiled client) is in its `files` without being in the repository.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const REPOSITORY = 'git+https://github.com/Lincyaw/presmium.git'
/** Presmium's packages a plugin uses from the application, one copy for all: peers, never dependencies. */
const SHARED = new Set(['@presmium/kernel', '@presmium/host', '@presmium/viewer', '@presmium/compiler'])
/** The one public package outside the scope: `npm create presmium` runs the package `create-presmium` (P-142). */
const UNSCOPED = new Set(['create-presmium'])
/** The 0.x packages, outside Presmium's one version until DeepSeek Harness is stable (docs/design-dsh.md 12). */
const ZERO = new Set(['@presmium/workbench', '@presmium/dsh', '@presmium/studio'])

const read = file => JSON.parse(readFileSync(join(root, file), 'utf8'))
const rootPackage = read('package.json')
const license = readFileSync(join(root, 'LICENSE'), 'utf8')
const table = readFileSync(join(root, '.changeset/README.md'), 'utf8')
/** The names in the table's rows: `| \`name\` | published? | ... |`. */
const rows = new Map([...table.matchAll(/^\| `([^`]+)` \| ([^|]+) \|/gm)].map(([, name, published]) => [name, published.trim()]))

const problems = []
const versions = new Set()
/** The globs of pnpm-workspace.yaml's `packages` (`dir` or `dir/*`), one per line under the key. */
const globs = []
for (const line of readFileSync(join(root, 'pnpm-workspace.yaml'), 'utf8').split('packages:\n')[1]?.split('\n') ?? []) {
  const listed = /^\s+-\s+['"]?([^'"\s]+)['"]?\s*$/.exec(line)
  if (!listed) break
  globs.push(listed[1])
}
const workspaces = globs.flatMap(glob => (glob.endsWith('/*') ? readdirSync(join(root, glob.slice(0, -2))).sort().map(name => `${glob.slice(0, -2)}/${name}`) : [glob]))
  .filter(dir => existsSync(join(root, dir, 'package.json')))

/** The files an `exports` or `bin` entry names; a pattern names its directory. */
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
  if (!pkg.name.startsWith('@presmium/') && !UNSCOPED.has(pkg.name)) problems.push(`${at}: a public package is named @presmium/*`)
  if (ZERO.has(pkg.name)) {
    if (!/^0\./.test(pkg.version)) problems.push(`${at}: a package of the workbench is 0.x (docs/design-dsh.md 12), not ${pkg.version}`)
  } else {
    versions.add(pkg.version)
  }
  /** What `prepack` generates: in `files`, not in the repository. */
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
      if (name.startsWith('@presmium/') && !range.startsWith('workspace:')) problems.push(`${at}: ${field}.${name} is not a workspace: range`)
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

if (problems.length) {
  console.error(`package problems:\n${problems.join('\n')}`)
  process.exit(1)
}
console.log(`packages ok: ${workspaces.length} workspace packages as .changeset/README.md lists them; the public ones at ${[...versions].join('')}`)
