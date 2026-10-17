/**
 * `@presmium/kernel/node`: what the Node sides of the renderers, the
 * compiler and the hosts share that needs Node's own modules; the browser
 * never loads it (scripts/check-layering.mjs).
 */
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import type { LocalAsset } from '../ir.ts'

/**
 * Copies a published file (`RenderContext.localAsset`) into `dir` under its
 * published name, a directory with its files; a copy already there is kept,
 * since the name holds the content hash. Returns the copy's path.
 */
export function copyPublished(found: LocalAsset, dir: string): string {
  const target = join(dir, found.name)
  if (!existsSync(target)) {
    mkdirSync(dir, { recursive: true })
    cpSync(found.file, target, { recursive: true })
  }
  return target
}
