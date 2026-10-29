import { createHash } from 'node:crypto'
import { infoOf, resourceBytes, resourcePath, skillDirectory, SKILL_NAMES, VERSION, SkillError } from './resources.ts'
export { skillDirectory, SkillError } from './resources.ts'
export type { SkillInfo, SkillName, SkillErrorCode } from './resources.ts'
export { installBundledSkills } from './install.ts'
export type { InstallSkillsOptions, InstallSkillsResult } from './install.ts'
export { main } from './cli.ts'

/** Includes relative text-resource names, so callers can load references only when needed. */
export function listBundledSkills() {
  return SKILL_NAMES.map(name => infoOf(name, skillDirectory(name)))
}

export interface ReadBundledSkillOptions {
  name: string
  path?: string
  /** Unicode character offset; pages never split a surrogate pair. */
  offset?: number
  /** At most 12,000 Unicode characters. */
  limit?: number
}

export interface BundledSkillPage {
  name: string
  path: string
  content: string
  total: number
  nextOffset?: number
  version: string
  hash: string
}

export function readBundledSkill({ name, path = 'SKILL.md', offset = 0, limit = 12_000 }: ReadBundledSkillOptions): BundledSkillPage {
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 12_000) throw new SkillError('skill-page-invalid')
  resourcePath(path)
  const root = skillDirectory(name)
  const bytes = resourceBytes(root, path)
  const characters = Array.from(bytes.toString('utf8'))
  if (offset > characters.length) throw new SkillError('skill-page-invalid')
  const end = Math.min(characters.length, offset + limit)
  return { name, path, content: characters.slice(offset, end).join(''), total: characters.length,
    ...end < characters.length ? { nextOffset: end } : {}, version: VERSION, hash: createHash('sha256').update(bytes).digest('hex') }
}
