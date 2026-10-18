import { readdirSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

export const TEMPLATE_SOURCES: Record<string, string> = {
  'document': 'packages/workspace/templates/document',
  'workspace': 'templates/workspace',
  'plugin': 'templates/plugin',
  'skills/presmium-author': '.agents/skills/presmium-author',
  'skills/presmium-develop': '.agents/skills/presmium-develop',
  'skills/presmium-present': '.agents/skills/presmium-present',
}

export const TEMPLATES = fileURLToPath(new URL('../templates', import.meta.url))

const LEFT_OUT = new Set(['node_modules', 'dist', '.presmium'])

export function templateFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => relative(dir, join(entry.parentPath, entry.name)))
    .filter(path => !path.split(/[\\/]/).some(part => LEFT_OUT.has(part)))
    .sort()
}

export function storedPath(path: string): string {
  return basename(path) === '.gitignore' ? join(dirname(path), 'gitignore') : path
}

export function projectPath(path: string): string {
  return basename(path) === 'gitignore' ? join(dirname(path), '.gitignore') : path
}
