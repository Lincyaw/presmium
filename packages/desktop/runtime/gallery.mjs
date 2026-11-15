// Run by the bundled Node. Never merge a new snapshot into the user's editable copy.
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const [source, target, modules] = process.argv.slice(2).map(path => resolve(path))
if (!source || !target || !modules) throw new Error('Expected gallery source, workspace and runtime modules')
mkdirSync(dirname(target), { recursive: true })
if (!existsSync(target)) {
  const staging = mkdtempSync(join(dirname(target), '.gallery-'))
  try {
    cpSync(source, staging, { recursive: true })
    symlinkSync(modules, join(staging, 'node_modules'), 'junction')
    renameSync(staging, target)
  } finally {
    rmSync(staging, { recursive: true, force: true })
  }
} else {
  if (!existsSync(join(target, 'presmium.workspace.yaml'))) throw new Error('Existing example workspace has no workspace configuration')
  // Early installers carried the repository's relative base config. Repair only that broken reference,
  // retaining the author's own compiler options and other fields in the existing workspace.
  const configFile = join(target, 'tsconfig.json')
  if (existsSync(configFile)) {
    let config
    // The shipped file is JSON. Custom JSONC belongs to the author and must not block the launcher.
    try { config = JSON.parse(readFileSync(configFile, 'utf8')) } catch {}
    if (config?.extends === '../../tsconfig.base.json' && !existsSync(resolve(target, config.extends))) {
      const base = JSON.parse(readFileSync(join(source, 'tsconfig.json'), 'utf8'))
      delete config.extends
      writeFileSync(configFile, JSON.stringify({ ...config,
        compilerOptions: { ...base.compilerOptions, ...config.compilerOptions },
      }, null, 2) + '\n')
    }
  }
  // An app moved to another folder still provides dependencies; preserve a user's own installation.
  const link = join(target, 'node_modules')
  const stat = lstatSync(link, { throwIfNoEntry: false })
  if (!stat || (stat.isSymbolicLink() && resolve(readlinkSync(link)) !== modules)) {
    if (stat) rmSync(link)
    symlinkSync(modules, link, 'junction')
  }
}
