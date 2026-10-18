import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DshContext } from './dsh.ts'

export const name = 'presmium-skills'
export const inject = ['skills']

const PACKAGE = fileURLToPath(new URL('../..', import.meta.url))

export function bundledSkills(): string[] {
  const manifest = JSON.parse(readFileSync(join(PACKAGE, 'package.json'), 'utf8')) as { presmium?: { skills?: string[] } }
  return manifest.presmium?.skills ?? []
}

export function skillDir(skill: string): string | undefined {
  return [join(PACKAGE, '..', '..', '.agents', 'skills', skill), join(PACKAGE, 'skills', skill)].find(dir => existsSync(join(dir, 'SKILL.md')))
}

function field(frontmatter: string, key: string): string | undefined {
  const raw = new RegExp(`^${key}:\\s*(.*)$`, 'm').exec(frontmatter)?.[1]?.trim()
  if (!raw) return undefined
  if (raw.startsWith('"')) {
    try {
      return JSON.parse(raw) as string
    } catch {
      return raw.slice(1, -1)
    }
  }
  return raw.replace(/^'|'$/g, '')
}

export function apply(ctx: DshContext): void {
  for (const skill of bundledSkills()) {
    const dir = skillDir(skill)
    if (!dir) {
      ctx.logger?.('presmium').warn(`presmium-skills: the skill ${skill} is not in this package`)
      continue
    }
    const path = join(dir, 'SKILL.md')
    const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(readFileSync(path, 'utf8'))
    const description = match && field(match[1]!, 'description')
    if (!match || !description) continue
    ctx.skills.register({ name: field(match[1]!, 'name') ?? skill, description, content: match[2]!, path, source: 'bundled', resourceBase: { kind: 'directory', path: dir } })
  }
}
