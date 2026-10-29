import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findPackageDir } from '@lincyaw/compiler'
import { findPackageBin } from '@lincyaw/kernel/node'

/** The document's installed command and the package that supplies its bundled plugins. */
export function documentCli(entry: string): { bin: string, bundled: string } {
  const project = dirname(entry)
  for (const [name, from] of [
    ['@lincyaw/presmium', project],
    ['@lincyaw/cli', project],
    ['@lincyaw/cli', dirname(fileURLToPath(import.meta.url))],
  ] as const) {
    const bundled = findPackageDir(name, from)
    const bin = findPackageBin(name, 'presmium', join(from, 'package.json'))
    if (bundled && bin) return { bin, bundled }
  }
  throw new Error('@lincyaw/cli is not installed')
}
