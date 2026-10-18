import { createReadStream, readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RUNTIME_DIR } from '../domain/index.ts'
import { RUNTIMES } from '../runner.mjs'
import type { Runtime } from '../runner.mjs'
import { runtimeDir } from './runtime.ts'

export interface WasiRuntimePlugin {
  name: string
  configResolved(config: { base: string, build: { ssr?: unknown } }): void
  configureServer(server: { middlewares: { use(handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void): unknown } }): void
  generateBundle(this: { emitFile(file: { type: 'asset', fileName: string, source: Uint8Array }): string }): void
}

const TYPES: Record<string, string> = { '.wasm': 'application/wasm', '.gz': 'application/gzip' }
const ALL = Object.values(RUNTIMES).flat()

const LICENSES = 'LICENSES'
const LICENSES_FILE = fileURLToPath(new URL('../../LICENSES', import.meta.url))

export function wasiRuntime(runtimes: readonly string[]): WasiRuntimePlugin {
  const files = [...new Set(runtimes.flatMap(runtime => Object.hasOwn(RUNTIMES, runtime) ? RUNTIMES[runtime as Runtime] : []))]
  let base = '/'
  let ssr = false
  return {
    name: 'presmium:wasi-runtime',
    configResolved(config) {
      base = config.base
      ssr = Boolean(config.build.ssr)
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0] ?? ''
        const file = path.startsWith(base + RUNTIME_DIR) ? path.slice(base.length + RUNTIME_DIR.length) : ''
        if (file === LICENSES) {
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          createReadStream(LICENSES_FILE).pipe(res)
          return
        }
        if (!ALL.includes(file)) return next()
        res.setHeader('Content-Type', TYPES[file.slice(file.lastIndexOf('.'))] ?? 'application/octet-stream')
        createReadStream(join(runtimeDir(), file)).pipe(res)
      })
    },
    generateBundle() {
      if (ssr || files.length === 0) return
      for (const file of files) this.emitFile({ type: 'asset', fileName: RUNTIME_DIR + file, source: readFileSync(join(runtimeDir(), file)) })
      this.emitFile({ type: 'asset', fileName: RUNTIME_DIR + LICENSES, source: readFileSync(LICENSES_FILE) })
    },
  }
}
