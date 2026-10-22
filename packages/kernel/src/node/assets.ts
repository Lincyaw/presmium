import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { LocalAsset } from '../ir.ts'

export function copyPublished(found: LocalAsset, dir: string): string {
  const target = join(dir, found.name)
  if (!existsSync(target)) {
    mkdirSync(dir, { recursive: true })
    cpSync(found.file, target, { recursive: true })
  }
  return target
}
