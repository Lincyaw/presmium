import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { Compiler, DECK_ENTRY } from '@lincyaw/compiler'
import type { Compilation } from '@lincyaw/compiler'

export function isDeck(dir: string): boolean {
  return existsSync(join(dir, DECK_ENTRY))
}

/** Whether the deck renders to form `id`: to every form when it names no renderer. */
export function hasForm(compilation: Compilation, id: string): boolean {
  const { renderers } = compilation.doc.config
  return Object.keys(renderers).length === 0 || id in renderers
}

/**
 * The installation of Presmium the deck's project has (`@lincyaw/presmium`), whose dependencies hold the renderers and
 * plugins the project does not install itself: the slides renderer the exports print with, as `presmium` finds it.
 */
function presmiumInstallation(deckDir: string): string | undefined {
  try {
    return dirname(createRequire(join(resolve(deckDir), DECK_ENTRY)).resolve('@lincyaw/presmium/package.json'))
  } catch {
    return undefined
  }
}

/** Compiles the deck as `presmium` does, with the renderers of its project's Presmium installation. */
export function deckCompiler(deckDir: string): Compiler {
  const bundled = presmiumInstallation(deckDir)
  return new Compiler(deckDir, bundled ? { bundled } : {})
}
