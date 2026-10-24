import { createReadStream, readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import type { RuntimeAssets } from '../contracts/plugin.ts'

export interface ServedAssetsPlugin {
  name: string
  configResolved(config: { base: string, build: { ssr?: unknown } }): void
  configureServer(server: { middlewares: { use(handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void): unknown } }): void
  generateBundle(this: { emitFile(file: { type: 'asset', fileName: string, source: Uint8Array }): string }): void
}

/** A Vite plugin that serves a plugin's run-time files at `<base><prefix>` and writes them into the build (not the SSR build): the slides form's. */
export function servedAssets(assets: RuntimeAssets): ServedAssetsPlugin {
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

const MODULE_SCRIPT = /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["']/g

/**
 * Asks a dev server for the page at `url` and for the module scripts it starts with, as a browser would, so that the
 * server transforms them, and through Vite's pre-transforms what they import, before the author opens the page.
 * Best effort: a failure only leaves the work to the browser.
 */
export async function warmDevPage(url: string, signal?: AbortSignal): Promise<void> {
  try {
    const page = await fetch(url, { signal, headers: { Accept: 'text/html' } })
    if (!page.ok) return
    const scripts = [...(await page.text()).matchAll(MODULE_SCRIPT)].map(match => new URL(match[1]!, page.url).href)
    await Promise.all(scripts.map(src => fetch(src, { signal }).then(response => response.arrayBuffer()).catch(() => undefined)))
  } catch {}
}
