/**
 * Publishes jax-js with the deck (P-104): its ES module build, a few files
 * that import only each other, is served at `<base>presmium/jax-js/` by the
 * dev server and copied there by builds, as the execution plugin serves
 * Pyodide, so JavaScript and TypeScript code loads it on first import
 * (offline too, once cached). `presmium/jax-js/index.js` is where the
 * execution plugin's script worker maps `@jax-js/jax` to (workers have no
 * import maps). The files are copied rather than bundled: an entry chunk of
 * its own in the web form's build would change the site's own entries. Used
 * by the package's vite.config.ts, which Slidev merges into the deck's Vite
 * config and the web form adds to its own.
 */
import { createReadStream, readdirSync, readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { findPackageJSON } from 'node:module'
import { dirname, join, resolve } from 'node:path'

/** Directory under the deck's base URL where jax-js is served. */
export const JAX_DIR = 'presmium/jax-js/'

/** The part of Vite's plugin interface used here; Vite itself is a dependency of the host, not of this package. */
export interface JaxRuntimePlugin {
  name: string
  configResolved(config: { base: string, build: { ssr?: unknown } }): void
  configureServer(server: { middlewares: { use(handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void): unknown } }): void
  generateBundle(this: { emitFile(file: { type: 'asset', fileName: string, source: Uint8Array }): string }): void
}

/** The directory of the installed jax-js's ES module build (its `import` entry, `index.js`). */
function jaxDist(): string {
  const manifest = findPackageJSON('@jax-js/jax', import.meta.url)
  if (!manifest) throw new Error('@jax-js/jax is not installed')
  const { exports } = JSON.parse(readFileSync(manifest, 'utf8')) as { exports: { '.': { import: string } } }
  return dirname(resolve(dirname(manifest), exports['.'].import))
}

export function jaxRuntime(): JaxRuntimePlugin {
  const dist = jaxDist()
  // The ES modules of the build (its CommonJS build and types stay out).
  const files = readdirSync(dist).filter(file => file.endsWith('.js'))
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
        if (!files.includes(file)) return next()
        res.setHeader('Content-Type', 'text/javascript')
        createReadStream(join(dist, file)).pipe(res)
      })
    },
    generateBundle() {
      // The server render of the web form has no use for it.
      if (ssr) return
      for (const file of files) this.emitFile({ type: 'asset', fileName: JAX_DIR + file, source: readFileSync(join(dist, file)) })
    },
  }
}
