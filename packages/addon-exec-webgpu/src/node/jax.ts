import { createReadStream, readdirSync, readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { findPackageJSON } from 'node:module'
import { dirname, join, resolve } from 'node:path'

export const JAX_DIR = 'presmium/jax-js/'

export interface JaxRuntimePlugin {
  name: string
  configResolved(config: { base: string, build: { ssr?: unknown } }): void
  configureServer(server: { middlewares: { use(handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void): unknown } }): void
  generateBundle(this: { emitFile(file: { type: 'asset', fileName: string, source: Uint8Array }): string }): void
}

const LICENSE = 'LICENSE'

function jaxFiles(): { dist: string, license: string } {
  const manifest = findPackageJSON('@jax-js/jax', import.meta.url)
  if (!manifest) throw new Error('@jax-js/jax is not installed')
  const { exports } = JSON.parse(readFileSync(manifest, 'utf8')) as { exports: { '.': { import: string } } }
  return { dist: dirname(resolve(dirname(manifest), exports['.'].import)), license: join(dirname(manifest), LICENSE) }
}

export function jaxRuntime(): JaxRuntimePlugin {
  const { dist, license } = jaxFiles()
  const files = readdirSync(dist).filter(file => file.endsWith('.js'))
  const source = (file: string) => (file === LICENSE ? license : join(dist, file))
  let base = '/'
  let ssr = false
  return {
    name: 'presmium:jax-js',
    configResolved(config) {
      base = config.base
      ssr = Boolean(config.build.ssr)
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0] ?? ''
        const file = path.startsWith(base + JAX_DIR) ? path.slice(base.length + JAX_DIR.length) : ''
        if (file !== LICENSE && !files.includes(file)) return next()
        res.setHeader('Content-Type', file === LICENSE ? 'text/plain; charset=utf-8' : 'text/javascript')
        createReadStream(source(file)).pipe(res)
      })
    },
    generateBundle() {
      if (ssr) return
      for (const file of [...files, LICENSE]) this.emitFile({ type: 'asset', fileName: JAX_DIR + file, source: readFileSync(source(file)) })
    },
  }
}
