import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prebundleDependencies, servedAssets } from '@lincyaw/kernel/node'
import type { ServedAssetsPlugin } from '@lincyaw/kernel/node'

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

/** Serves Pyodide's runtime at `<base>pyodide/` and copies it into the build. */
export function pyodideAssets(): ServedAssetsPlugin {
  const dir = dirname(createRequire(import.meta.url).resolve('pyodide/package.json'))
  return servedAssets({ name: 'presmium:pyodide-runtime', prefix: PYODIDE_DIR, types: TYPES, source: file => (file === LICENSES ? LICENSES_FILE : join(dir, file)) })
}

export function execPrebundle(): ReturnType<typeof prebundleDependencies> {
  return prebundleDependencies('presmium:exec-prebundle', '@lincyaw/addon-exec', ['diff', 'sucrase'])
}
