#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const compilerRequire = createRequire(join(root, 'packages/compiler/package.json'))
const { createJiti } = compilerRequire('jiti')
const jiti = createJiti(join(root, 'packages/compiler/src/plugins.ts'))
const { KERNEL_VERSION, kernelIncompatibility } = await jiti.import(join(root, 'packages/kernel/src/index.ts'))

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

// A browser plugin's manifest names it in both interface languages: the startup report shows the name, never the id.
let named = 0
for (const dir of readdirSync(join(root, 'packages')).sort()) {
  const file = join(root, 'packages', dir, 'src/client/plugin.ts')
  if (!existsSync(file)) continue
  named++
  if (!/manifest:\s*\{[^]*?\bname:\s*\{\s*'zh-CN':\s*'[^']+',\s*en:\s*'[^']+'\s*\}/.test(readFileSync(file, 'utf8'))) problems.push(`packages/${dir}/src/client/plugin.ts: the manifest has no name: { 'zh-CN': '…', en: '…' } for the startup report`)
}

if (problems.length) {
  console.error(`plugin declaration problems:\n${problems.join('\n')}`)
  process.exit(1)
}
console.log(`plugins ok: ${checked} Node plugins declare their version and a kernel range ${KERNEL_VERSION} satisfies; ${named} browser plugins name themselves in zh-CN and en`)
