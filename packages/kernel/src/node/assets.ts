import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { LocalAsset } from '../ir.ts'

/** Production assets are local to one document; hidden, remote and shared paths are not admitted. */
export function productionAssetFile(deckDir: string, location: string): string | undefined {
  if (!location || /^(?:[a-z][a-z\d+.-]*:|\/)/i.test(location) || /[\\\0?#]/.test(location)) return undefined
  let decoded: string
  try { decoded = decodeURIComponent(location) } catch { return undefined }
  if (/[\\\0?#]/.test(decoded)) return undefined
  const parts = decoded.split('/')
  if (parts.some(part => !part || part.startsWith('.') || part === 'node_modules' || part === 'dist' || part.includes(':'))) return undefined
  return resolve(deckDir, ...parts)
}

export function copyPublished(found: LocalAsset, dir: string): string {
  const target = join(dir, found.name)
  if (!existsSync(target)) {
    mkdirSync(dir, { recursive: true })
    cpSync(found.file, target, { recursive: true })
  }
  return target
}
