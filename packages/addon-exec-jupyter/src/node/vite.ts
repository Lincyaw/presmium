import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/**
 * `@jupyterlab/services` requires `ws` outside a browser only, and maps it
 * to a shim (the global `WebSocket`) for browser bundles with its package's
 * `browser` field. The site's server render bundles the plugin's browser
 * modules too (it never runs them, but Rollup loads every dynamic import),
 * and without the field it would bundle `ws` with its Node built-ins: there
 * the shim stands in as well. Typed loosely to keep Vite out of the plugin.
 */
export function servicesInBrowserBuilds(): { name: string, enforce: 'pre', resolveId(source: string, importer?: string): string | undefined } {
  const shim = require.resolve('@jupyterlab/services/lib/shim/ws.js')
  return {
    name: 'presmium:exec-jupyter-services',
    enforce: 'pre',
    resolveId(source, importer) {
      return source === 'ws' && importer?.includes('/@jupyterlab/services/') ? shim : undefined
    },
  }
}
