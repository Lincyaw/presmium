import { existsSync, lstatSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { WorkspaceConfig } from './config.ts'

const BUILTIN_TEMPLATES = fileURLToPath(new URL('../../templates/document', import.meta.url))

export const DEFAULT_TEMPLATE = 'default'

function templatesDir(config: WorkspaceConfig): string {
  return config.templates ?? BUILTIN_TEMPLATES
}

export function listTemplates(config: WorkspaceConfig): string[] {
  const dir = templatesDir(config)
  try {
    return readdirSync(dir).filter(name => statSync(join(dir, name)).isDirectory()).sort()
  } catch {
    return []
  }
}

export function findTemplate(config: WorkspaceConfig, name: string): string | undefined {
  if (!name || name.includes('/') || name.includes('\\') || name.startsWith('.')) return undefined
  const dir = join(templatesDir(config), name)
  return existsSync(dir) && lstatSync(dir, { throwIfNoEntry: false })?.isDirectory() ? dir : undefined
}
