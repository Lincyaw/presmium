import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { RuntimeAssets } from '@lincyaw/kernel'

const PYODIDE_DIR = 'pyodide/'
const LICENSES = 'LICENSES'
const LICENSES_FILE = fileURLToPath(new URL('../../LICENSES', import.meta.url))
const TYPES: Record<string, string> = {
  'pyodide.mjs': 'text/javascript',
  'pyodide.asm.mjs': 'text/javascript',
  'pyodide.asm.wasm': 'application/wasm',
  'python_stdlib.zip': 'application/zip',
  'pyodide-lock.json': 'application/json',
  [LICENSES]: 'text/plain; charset=utf-8',
}

/** Pyodide's runtime, at `<base>pyodide/`. */
export function pyodideAssets(): RuntimeAssets {
  const dir = dirname(createRequire(import.meta.url).resolve('pyodide/package.json'))
  return { name: 'presmium:pyodide-runtime', prefix: PYODIDE_DIR, types: TYPES, source: file => (file === LICENSES ? LICENSES_FILE : join(dir, file)) }
}
