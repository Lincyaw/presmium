import { createReadStream, readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

/** The part of Vite's plugin interface used here; Vite itself is a dependency of the host, not of this package. */
export interface PyodideRuntimePlugin {
  name: string
  configResolved(config: { base: string }): void
  configureServer(server: { middlewares: { use(handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void): unknown } }): void
  generateBundle(this: { emitFile(file: { type: 'asset'; fileName: string; source: Uint8Array }): string }): void
}

/** Runtime files Pyodide loads from its index URL. */
const FILES: Record<string, string> = {
  'pyodide.mjs': 'text/javascript',
  'pyodide.asm.mjs': 'text/javascript',
  'pyodide.asm.wasm': 'application/wasm',
  'python_stdlib.zip': 'application/zip',
  'pyodide-lock.json': 'application/json',
}

/** Directory under the deck's base URL where the runtime is served. */
export const PYODIDE_DIR = 'pyodide/'

/**
 * Serves the Pyodide runtime from the installed `pyodide` package at
 * `<base>pyodide/` in dev and copies it there in builds, so Python runs
 * without a CDN (and offline once cached). Used by the addon's vite.config.ts;
 * the document form adds it to its own Vite config.
 */
export function pyodideRuntime(): PyodideRuntimePlugin {
  const dir = dirname(createRequire(import.meta.url).resolve('pyodide/package.json'))
  let base = '/'
  return {
    name: 'presmium:pyodide-runtime',
    configResolved(config) {
      base = config.base
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0] ?? ''
        const file = path.startsWith(base + PYODIDE_DIR) ? path.slice(base.length + PYODIDE_DIR.length) : ''
        const type = Object.hasOwn(FILES, file) ? FILES[file] : undefined
        if (!type) return next()
        res.setHeader('Content-Type', type)
        createReadStream(join(dir, file)).pipe(res)
      })
    },
    generateBundle() {
      for (const file of Object.keys(FILES)) {
        this.emitFile({ type: 'asset', fileName: PYODIDE_DIR + file, source: readFileSync(join(dir, file)) })
      }
    },
  }
}
