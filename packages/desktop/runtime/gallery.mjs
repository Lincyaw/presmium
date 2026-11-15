// Run by the bundled Node. Never merge a new snapshot into the user's editable copy.
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readlinkSync, renameSync, rmSync, symlinkSync } from 'node:fs'
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
  // An app moved to another folder still provides dependencies; preserve a user's own installation.
  const link = join(target, 'node_modules')
  const stat = lstatSync(link, { throwIfNoEntry: false })
  if (!stat || (stat.isSymbolicLink() && resolve(readlinkSync(link)) !== modules)) {
    if (stat) rmSync(link)
    symlinkSync(modules, link, 'junction')
  }
}
