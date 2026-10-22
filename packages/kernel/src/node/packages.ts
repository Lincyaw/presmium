import { findPackageJSON } from 'node:module'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

export const TYPESCRIPT_IMPORT: readonly string[] = ['--import', new URL('./strip-types.mjs', import.meta.url).href]

export function packageOf(file: string): string | undefined {
  const manifest = findPackageJSON(pathToFileURL(file))
  return manifest && dirname(manifest)
}
