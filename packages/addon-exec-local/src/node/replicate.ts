import { readFileSync } from 'node:fs'
import { relative, sep } from 'node:path'
import { languageId } from '@lincyaw/kernel'
import { strToU8, zipSync } from 'fflate'
import { archiveName, workspacePath } from '../domain/index.ts'
import type { ReplicateRequest } from '../domain/index.ts'
import { definitionCommands, definitionFiles } from './devcontainer.ts'
import { text } from './messages.ts'

export class PathError extends Error {}

export function requirePath(file: string): string {
  try {
    return workspacePath(file)
  } catch {
    throw new PathError(text().outsideWorkspace(file))
  }
}

export function replicateArchive(workspace: string, configFile: string, request: ReplicateRequest): { name: string, zip: Uint8Array } {
  const file = requirePath(request.file)
  const entries: Record<string, Uint8Array> = {}
  for (const path of definitionFiles(configFile)) {
    entries[requirePath(relative(workspace, path).split(sep).join('/'))] = readFileSync(path)
  }
  entries[file] = strToU8(request.content)
  const command = request.lang ? definitionCommands(configFile)[languageId(request.lang)] : undefined
  entries[file === 'README.md' ? 'PRESMIUM.md' : 'README.md'] = strToU8(text().readme(file, command && `${command[0]} ${file}`))
  return { name: archiveName(file), zip: zipSync(entries, { mtime: '2000-01-01T00:00:00Z' }) }
}
