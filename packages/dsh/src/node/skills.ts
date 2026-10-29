import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { listBundledSkills, skillDirectory } from '@lincyaw/skills'
import type { DshContext } from './dsh-types.ts'

export const name = 'presmium-skills'
export const inject = ['skills']

export function bundledSkills(): string[] {
  return listBundledSkills().map(skill => skill.name)
}

export function skillDir(skill: string): string | undefined {
  try { return skillDirectory(skill) } catch { return undefined }
}

export function apply(ctx: DshContext): void {
  for (const skill of listBundledSkills()) {
    const dir = skillDirectory(skill.name)
    const path = join(dir, 'SKILL.md')
    const content = readFileSync(path, 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
    ctx.skills.register({ name: skill.name, description: skill.description, content, path, source: 'bundled', resourceBase: { kind: 'directory', path: dir } })
  }
}
