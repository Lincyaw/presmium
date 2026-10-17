/**
 * The Vite plugins of the execution plugin (`vitePlugins` of ./presmium.ts),
 * which both forms' dev servers and builds add: the Pyodide runtime with its
 * licenses, and the pre-bundled run panel's `diff`.
 */
import { createReadStream, readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** The part of Vite's plugin interface used here; Vite itself is a dependency of the host, not of this package. */
export interface PyodideRuntimePlugin {
  name: string
  configResolved(config: { base: string, build: { ssr?: unknown } }): void
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

/** The licenses of the runtime (Pyodide, CPython and what they include), published next to it as `<base>pyodide/LICENSES`. */
const LICENSES = 'LICENSES'
const LICENSES_FILE = fileURLToPath(new URL('../../LICENSES', import.meta.url))

/**
 * Serves the Pyodide runtime from the installed `pyodide` package at
 * `<base>pyodide/` in dev and copies it there in builds, so Python runs
 * without a CDN (and offline once cached), with its licenses
 * (`<base>pyodide/LICENSES`, 5.4), as the WASI runtimes have theirs. The
 * server render of the web form copies nothing.
 */
export function pyodideRuntime(): PyodideRuntimePlugin {
  const dir = dirname(createRequire(import.meta.url).resolve('pyodide/package.json'))
  const source = (file: string) => (file === LICENSES ? LICENSES_FILE : join(dir, file))
  let base = '/'
  let ssr = false
  return {
    name: 'presmium:pyodide-runtime',
    configResolved(config) {
      base = config.base
      ssr = Boolean(config.build.ssr)
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0] ?? ''
        const file = path.startsWith(base + PYODIDE_DIR) ? path.slice(base.length + PYODIDE_DIR.length) : ''
        const type = file === LICENSES ? 'text/plain; charset=utf-8' : Object.hasOwn(FILES, file) ? FILES[file] : undefined
        if (!type) return next()
        res.setHeader('Content-Type', type)
        createReadStream(source(file)).pipe(res)
      })
    },
    generateBundle() {
      if (ssr) return
      for (const file of [...Object.keys(FILES), LICENSES]) {
        this.emitFile({ type: 'asset', fileName: PYODIDE_DIR + file, source: readFileSync(source(file)) })
      }
    },
  }
}

/** This package, as a deck depends on it. */
const PACKAGE = '@presmium/slidev-addon-exec'

/**
 * Has the dev server pre-bundle `diff` (the run panel's comparison) when it
 * starts: plugin components load lazily, and a dependency the dev server
 * only meets then makes Vite optimize again and reload the page. Named
 * through this package (Vite's `<package> > <dependency>`), the deck's
 * dependency; where it is not found from the root, nothing changes.
 */
export function prebundled(): { name: string, config(config: { root?: string }): { optimizeDeps: { include: string[] } } | undefined } {
  return {
    name: 'presmium:exec-prebundle',
    config(config) {
      try {
        createRequire(join(resolve(config.root ?? process.cwd()), 'package.json')).resolve(`${PACKAGE}/package.json`)
      } catch {
        return undefined
      }
      return { optimizeDeps: { include: [`${PACKAGE} > diff`] } }
    },
  }
}
