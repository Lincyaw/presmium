import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, sep } from 'node:path'
import { languageId } from '@presmium/kernel'
import { strToU8, zipSync } from 'fflate'
import { archiveName, workspacePath } from '../domain/index.ts'
import type { ReplicateRequest } from '../domain/index.ts'
import { definitionRunners } from './container.ts'
import { text } from './messages.ts'

export class PathError extends Error {}

export function requirePath(file: string): string {
  try {
    return workspacePath(file)
  } catch {
    throw new PathError(text().outsideWorkspace(file))
  }
}

function definitionFiles(workspace: string, configFile: string): string[] {
  const dir = dirname(configFile)
  if (dir === workspace) return [configFile]
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .map(name => join(dir, name))
    .filter(path => statSync(path).isFile())
}

export function replicateArchive(workspace: string, configFile: string, request: ReplicateRequest): { name: string, zip: Uint8Array } {
  const file = requirePath(request.file)
  const entries: Record<string, Uint8Array> = {}
  for (const path of definitionFiles(workspace, configFile)) {
    entries[relative(workspace, path).split(sep).join('/')] = readFileSync(path)
  }
  entries[file] = strToU8(request.content)
  const runner = request.lang ? definitionRunners(configFile)[languageId(request.lang)] : undefined
  entries[file === 'README.md' ? 'PRESMIUM.md' : 'README.md'] = strToU8(text().readme(file, runner && `${runner[0]} ${file}`))
  return { name: archiveName(file), zip: zipSync(entries, { mtime: '2000-01-01T00:00:00Z' }) }
}
