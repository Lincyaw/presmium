import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

const require = createRequire(import.meta.url)

const PACKAGE = '@lincyaw/slidev-addon-exec-jupyter'

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

const LAZY = ['@jupyterlab/services', '@xterm/xterm', '@xterm/addon-fit']

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
