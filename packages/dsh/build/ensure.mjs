import { existsSync, readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE = fileURLToPath(new URL('..', import.meta.url))
const BUNDLE = join(PACKAGE, 'build', 'dist', 'client.js')
const META = join(PACKAGE, 'build', 'dist', 'client.json')

function stale() {
  if (!existsSync(BUNDLE) || !existsSync(META)) return true
  const built = statSync(BUNDLE).mtimeMs
  const { inputs } = JSON.parse(readFileSync(META, 'utf8'))
  return inputs.some((input) => {
    const file = join(PACKAGE, input)
    return !existsSync(file) || statSync(file).mtimeMs > built
  })
}

export async function ensureClient() {
  if (PACKAGE.split(sep).includes('node_modules')) return
  try {
    createRequire(join(PACKAGE, 'package.json')).resolve('esbuild')
  } catch {
    return
  }
  if (!stale()) return
  const { buildClient } = await import('./client.mjs')
  await buildClient()
}
