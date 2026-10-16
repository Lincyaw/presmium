import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

const require = createRequire(import.meta.url)

/** This package, as a deck depends on it. */
const PACKAGE = '@presmium/slidev-addon-exec-jupyter'

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

/** The plugin's browser dependencies that its components and client load lazily: the Jupyter client and the terminal. */
const LAZY = ['@jupyterlab/services', '@xterm/xterm', '@xterm/addon-fit']

/**
 * Has the dev server pre-bundle the plugin's browser dependencies when it
 * starts. The page loads them lazily (the Jupyter client with its first
 * remote run, the terminal with `{terminal}`): a dependency the dev server
 * only meets then makes Vite optimize again and reload the page, which
 * loses what the page was doing, a run for one. They are named through this
 * package (Vite's `<package> > <dependency>`), which is the deck's
 * dependency; where this package is not found from the root (a deck that
 * names the plugin by its path), nothing changes.
 */
export function prebundled(): { name: string, config(config: { root?: string }): { optimizeDeps: { include: string[] } } | undefined } {
  return {
    name: 'presmium:exec-jupyter-prebundle',
    config(config) {
      try {
        createRequire(join(resolve(config.root ?? process.cwd()), 'package.json')).resolve(`${PACKAGE}/package.json`)
      } catch {
        return undefined
      }
      return { optimizeDeps: { include: LAZY.map(dependency => `${PACKAGE} > ${dependency}`) } }
    },
  }
}
