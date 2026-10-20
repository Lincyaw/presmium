import { createReadStream, readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface PyodideRuntimePlugin {
  name: string
  configResolved(config: { base: string, build: { ssr?: unknown } }): void
  configureServer(server: { middlewares: { use(handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void): unknown } }): void
  generateBundle(this: { emitFile(file: { type: 'asset'; fileName: string; source: Uint8Array }): string }): void
}

const FILES: Record<string, string> = {
  'pyodide.mjs': 'text/javascript',
  'pyodide.asm.mjs': 'text/javascript',
  'pyodide.asm.wasm': 'application/wasm',
  'python_stdlib.zip': 'application/zip',
  'pyodide-lock.json': 'application/json',
}

export const PYODIDE_DIR = 'pyodide/'

const LICENSES = 'LICENSES'
const LICENSES_FILE = fileURLToPath(new URL('../../LICENSES', import.meta.url))

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

const PACKAGE = '@lincyaw/slidev-addon-exec'

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
