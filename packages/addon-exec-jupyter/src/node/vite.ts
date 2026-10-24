import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/** `@jupyterlab/services` imports `ws`; in every bundle (the server-side rendering too) it gets the package's own shim. */
export function jupyterWsShim(): { name: string, enforce: 'pre', resolveId(source: string, importer?: string): string | undefined } {
  const shim = require.resolve('@jupyterlab/services/lib/shim/ws.js')
  return {
    name: 'presmium:exec-jupyter-services',
    enforce: 'pre',
    resolveId(source, importer) {
      return source === 'ws' && importer?.includes('/@jupyterlab/services/') ? shim : undefined
    },
  }
}
