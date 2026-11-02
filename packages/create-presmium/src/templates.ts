import { existsSync, readdirSync } from 'node:fs'
import { basename, dirname, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const TEMPLATE_SOURCES: Record<string, string> = {
  'document': 'packages/workspace/templates/document',
  'workspace': 'templates/workspace',
  'site': 'templates/site',
  'plugin': 'templates/plugin',
  'skills/presmium-animate': '.agents/skills/presmium-animate',
  'skills/presmium-author': '.agents/skills/presmium-author',
  'skills/presmium-develop': '.agents/skills/presmium-develop',
}

export const TEMPLATES = fileURLToPath(new URL('../templates', import.meta.url))

const REPOSITORY = fileURLToPath(new URL('../../..', import.meta.url))
// Run from the repository, templates come from their sources: the packed copies are made by prepack and may be older.
const IN_REPOSITORY = !fileURLToPath(import.meta.url).split(sep).includes('node_modules')

export function templateDir(template: string): string {
  const packed = join(TEMPLATES, template)
  const name = Object.keys(TEMPLATE_SOURCES).find(key => template === key || template.startsWith(`${key}/`))
  const source = name ? join(REPOSITORY, TEMPLATE_SOURCES[name]!, template.slice(name.length)) : undefined
  if (source && IN_REPOSITORY && existsSync(source)) return source
  return existsSync(packed) || !source ? packed : source
}

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
