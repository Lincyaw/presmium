#!/usr/bin/env node
// Every package's Node plugin (`./presmium`, docs/architecture.md 4.2) declares what the compiler
// checks before loading it (K-07, R-111): `kernel`, a range of kernel versions that the current
// kernel satisfies, and `version`, the package's own. The compiler skips the check for a plugin
// that declares nothing, so without this a kernel upgrade would load every plugin unchecked.
// The entries are loaded as the compiler loads them, with jiti.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const compilerRequire = createRequire(join(root, 'packages/compiler/package.json'))
const { createJiti } = compilerRequire('jiti')
const jiti = createJiti(join(root, 'packages/compiler/src/plugins.ts'))
const { KERNEL_VERSION, kernelIncompatibility } = await jiti.import(join(root, 'packages/kernel/src/index.ts'))

/** The `./presmium` export target of a package, as the compiler resolves it (packages/compiler/src/plugins.ts). */
function exportTarget(value) {
  if (typeof value === 'string') return value
  if (!value || typeof value !== 'object') return undefined
  return exportTarget(value.import) ?? exportTarget(value.node) ?? exportTarget(value.default)
}

const problems = []
let checked = 0
for (const dir of readdirSync(join(root, 'packages')).sort()) {
  const pkgFile = join(root, 'packages', dir, 'package.json')
  if (!existsSync(pkgFile)) continue
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'))
  const entry = exportTarget(pkg.exports?.['./presmium'])
  if (!entry) continue
  const where = `packages/${dir}/${entry.replace(/^\.\//, '')}`
  let plugin
  try {
    plugin = await jiti.import(join(root, 'packages', dir, entry), { default: true })
  } catch (error) {
    problems.push(`${where}: cannot be loaded: ${error.message}`)
    continue
  }
  checked++
  if (typeof plugin?.kernel !== 'string') problems.push(`${where}: declares no kernel range; add kernel: '^${KERNEL_VERSION}'`)
  else if (kernelIncompatibility(plugin.kernel)) problems.push(`${where}: ${kernelIncompatibility(plugin.kernel)}`)
  if (plugin?.version !== pkg.version) problems.push(`${where}: version is ${JSON.stringify(plugin?.version)}, the package's is "${pkg.version}"`)
}

if (problems.length) {
  console.error(`plugin declaration problems:\n${problems.join('\n')}`)
  process.exit(1)
}
console.log(`plugins ok: ${checked} Node plugins declare their version and a kernel range ${KERNEL_VERSION} satisfies`)
