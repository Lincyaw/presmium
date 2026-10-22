import { createReadStream, readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

export interface ServedAssets {
  name: string
  /** The directory below the site's base where the files are served and written, e.g. `pyodide/`. */
  prefix: string
  /** The files the dev server serves, with their content types. */
  types: Readonly<Record<string, string>>
  /** The files a build writes; default: all that are served. */
  emitted?: readonly string[]
  /** The path of a file on disk. */
  source(file: string): string
}

export interface ServedAssetsPlugin {
  name: string
  configResolved(config: { base: string, build: { ssr?: unknown } }): void
  configureServer(server: { middlewares: { use(handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void): unknown } }): void
  generateBundle(this: { emitFile(file: { type: 'asset', fileName: string, source: Uint8Array }): string }): void
}

/** A Vite plugin that serves files of an installed package at `<base><prefix>` and writes them into the build (not the SSR build). */
export function servedAssets(assets: ServedAssets): ServedAssetsPlugin {
  let base = '/'
  let ssr = false
  return {
    name: assets.name,
    configResolved(config) {
      base = config.base
      ssr = Boolean(config.build.ssr)
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0] ?? ''
        const file = path.startsWith(base + assets.prefix) ? path.slice(base.length + assets.prefix.length) : ''
        if (!Object.hasOwn(assets.types, file)) return next()
        res.setHeader('Content-Type', assets.types[file]!)
        createReadStream(assets.source(file)).pipe(res)
      })
    },
    generateBundle() {
      if (ssr) return
      for (const file of assets.emitted ?? Object.keys(assets.types)) {
        this.emitFile({ type: 'asset', fileName: assets.prefix + file, source: readFileSync(assets.source(file)) })
      }
    },
  }
}

/** A Vite plugin that has the dev server pre-bundle the package's own dependencies, when the project resolves the package. */
export function prebundleDependencies(name: string, pkg: string, dependencies: readonly string[]): { name: string, config(config: { root?: string }): { optimizeDeps: { include: string[] } } | undefined } {
  return {
    name,
    config(config) {
      try {
        createRequire(join(resolve(config.root ?? process.cwd()), 'package.json')).resolve(`${pkg}/package.json`)
      } catch {
        return undefined
      }
      return { optimizeDeps: { include: dependencies.map(dependency => `${pkg} > ${dependency}`) } }
    },
  }
}
