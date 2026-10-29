import { createHash } from 'node:crypto'
import { closeSync, constants, fstatSync, lstatSync, openSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { isAbsolute, join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

export const SKILL_NAMES = ['presmium-author', 'presmium-animate', 'presmium-present', 'presmium-develop'] as const
export type SkillName = typeof SKILL_NAMES[number]
export type SkillErrorCode = 'skill-not-found' | 'skill-path-invalid' | 'skill-file-unavailable' | 'skill-page-invalid' | 'skill-project-invalid' | 'skill-install-unsafe' | 'skill-install-cancelled' | 'skill-unavailable'

/** Stable codes cross CLI/MCP boundaries without exposing filesystem diagnostics. */
export class SkillError extends Error {
  readonly code: SkillErrorCode
  constructor(code: SkillErrorCode) { super(code); this.name = 'SkillError'; this.code = code }
}

export interface SkillInfo {
  name: SkillName
  description: string
  files: string[]
  version: string
  hash: string
}

export const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url))
export const REPOSITORY_SKILLS = fileURLToPath(new URL('../../../.agents/skills/', import.meta.url))
export const VERSION = (JSON.parse(readFileSync(join(PACKAGE_DIR, 'package.json'), 'utf8')) as { version: string }).version
const EXCLUDED = new Set(['node_modules', 'dist', '.presmium'])
const TEXT_EXTENSIONS = /\.(?:md|txt|json|ts|tsx|js|mjs|cjs|py|yaml|yml|css|html|svg|toml|sh)$/i
const MAX_FILE_BYTES = 2 << 20
const inside = (root: string, file: string) => { const path = relative(root, file); return path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path) }

export function skillName(name: string): SkillName {
  if (!(SKILL_NAMES as readonly string[]).includes(name)) throw new SkillError('skill-not-found')
  return name as SkillName
}

export function resourcePath(path: string): string {
  if (!path || /[%\\:\u0000-\u001f]/.test(path) || isAbsolute(path)) throw new SkillError('skill-path-invalid')
  const parts = path.split('/')
  if (parts.some(part => !part || part === '.' || part === '..' || EXCLUDED.has(part))) throw new SkillError('skill-path-invalid')
  if (path !== 'SKILL.md' && (!['references', 'gallery'].includes(parts[0]!) || !TEXT_EXTENSIONS.test(path))) throw new SkillError('skill-file-unavailable')
  return path
}

export function skillDirectory(name: string): string {
  const selected = skillName(name)
  const packed = join(PACKAGE_DIR, 'skills', selected)
  const source = join(REPOSITORY_SKILLS, selected)
  try {
    const bundled = lstatSync(packed, { throwIfNoEntry: false }) !== undefined
    const dir = bundled ? packed : !PACKAGE_DIR.split(sep).includes('node_modules') ? source : packed
    if (lstatSync(bundled ? join(PACKAGE_DIR, 'skills') : REPOSITORY_SKILLS).isSymbolicLink()) throw new SkillError('skill-path-invalid')
    const stat = lstatSync(dir)
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new SkillError('skill-path-invalid')
    return realpathSync(dir)
  } catch (error) { if (error instanceof SkillError) throw error; throw new SkillError('skill-unavailable') }
}

/** Files are opened without following a final symlink; every parent must remain inside this skill. */
export function resourceBytes(root: string, path: string): Buffer {
  resourcePath(path)
  let fd: number | undefined
  try {
    let file = root
    for (const part of path.split('/')) {
      file = join(file, part)
      if (lstatSync(file).isSymbolicLink()) throw new SkillError('skill-path-invalid')
    }
    if (!inside(root, realpathSync(file))) throw new SkillError('skill-path-invalid')
    if (!lstatSync(file).isFile()) throw new SkillError('skill-file-unavailable')
    fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    const stat = fstatSync(fd)
    if (!stat.isFile() || stat.size > MAX_FILE_BYTES) throw new SkillError('skill-file-unavailable')
    const bytes = readFileSync(fd)
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    if (text.includes('\0')) throw new SkillError('skill-file-unavailable')
    return bytes
  } catch (error) { if (error instanceof SkillError) throw error; throw new SkillError('skill-file-unavailable') }
  finally { if (fd !== undefined) closeSync(fd) }
}

/** One copying and discovery rule excludes build products before descending into directories. */
export function resourceFiles(root: string): string[] {
  const files: string[] = []
  const walk = (dir: string, prefix = '') => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (EXCLUDED.has(entry.name) || entry.isSymbolicLink()) continue
      const path = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory() && (prefix || entry.name === 'references' || entry.name === 'gallery')) walk(join(dir, entry.name), path)
      else if (entry.isFile() && (path === 'SKILL.md' || prefix && TEXT_EXTENSIONS.test(path))) {
        resourceBytes(root, path)
        files.push(path)
      }
    }
  }
  try { walk(root); return files.sort() }
  catch (error) { if (error instanceof SkillError) throw error; throw new SkillError('skill-unavailable') }
}

export function infoOf(name: SkillName, root: string): SkillInfo {
  const files = resourceFiles(root)
  const content = resourceBytes(root, 'SKILL.md').toString('utf8')
  const description = /^description:\s*(.+)$/m.exec(content)?.[1]?.trim().replace(/^(["'])([\s\S]*)\1$/, '$2')
  if (!description || !files.includes('SKILL.md')) throw new SkillError('skill-unavailable')
  const hash = createHash('sha256')
  for (const path of files) hash.update(path).update('\0').update(resourceBytes(root, path)).update('\0')
  return { name, description, files, version: VERSION, hash: hash.digest('hex') }
}
