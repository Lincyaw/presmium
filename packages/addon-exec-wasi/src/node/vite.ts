import { createReadStream, readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { join } from 'node:path'
import { RUNTIME_DIR } from '../domain/index.ts'
import { RUNTIMES } from '../runner.mjs'
import type { Runtime } from '../runner.mjs'
import { runtimeDir } from './runtime.ts'

/** The part of Vite's plugin interface used here; Vite itself is a dependency of the hosts, not of this package. */
export interface WasiRuntimePlugin {
  name: string
  configResolved(config: { base: string, build: { ssr?: unknown } }): void
  configureServer(server: { middlewares: { use(handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void): unknown } }): void
  generateBundle(this: { emitFile(file: { type: 'asset', fileName: string, source: Uint8Array }): string }): void
}

const TYPES: Record<string, string> = { '.wasm': 'application/wasm', '.gz': 'application/gzip' }
const ALL = Object.values(RUNTIMES).flat()

/**
 * Serves the WASI runtime files at `<base>wasi/` in dev (all of them, as code
 * may change while the server runs) and copies those of `runtimes` there in
 * builds, so the code runs without a CDN; the web form's service worker
 * precaches every file of the build, so they work offline once loaded
 * (docs/architecture.md 9.2). The server render of a build copies nothing.
 */
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
        if (!ALL.includes(file)) return next()
        res.setHeader('Content-Type', TYPES[file.slice(file.lastIndexOf('.'))] ?? 'application/octet-stream')
        createReadStream(join(runtimeDir(), file)).pipe(res)
      })
    },
    generateBundle() {
      if (ssr) return
      for (const file of files) this.emitFile({ type: 'asset', fileName: RUNTIME_DIR + file, source: readFileSync(join(runtimeDir(), file)) })
    },
  }
}
