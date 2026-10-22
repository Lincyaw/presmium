import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { DECK_ENTRY } from '@lincyaw/compiler'
import type { Compilation } from '@lincyaw/compiler'

export function isDeck(dir: string): boolean {
  return existsSync(join(dir, DECK_ENTRY))
}

/** Whether the deck renders to form `id`: to every form when it names no renderer. */
export function hasForm(compilation: Compilation, id: string): boolean {
  const { renderers } = compilation.doc.config
  return Object.keys(renderers).length === 0 || id in renderers
}
