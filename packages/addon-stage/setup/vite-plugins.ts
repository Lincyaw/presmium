import { rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { defineVitePluginsSetup } from '@slidev/types'
import { CLEAR_DRAWING } from '../src/domain/index.ts'

/**
 * Clearing a drawing (P-04). Slidev's dev server saves every non-empty drawing
 * but leaves the file of one that was cleared, which would bring it back on
 * the next start and ship it with builds. The client asks this endpoint to
 * remove the file of a slide whose drawing was cleared (see ./main.ts).
 */
export default defineVitePluginsSetup((options) => {
  const { persist } = options.data.config.drawings
  if (options.mode !== 'dev' || !persist) return []
  const dir = resolve(options.userRoot, persist)
  return [{
    name: 'presmium-stage-clear-drawing',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const page = new RegExp(`${CLEAR_DRAWING}\\?page=(\\d+)$`).exec(req.url ?? '')?.[1]
        if (!page || req.method !== 'POST') return next()
        rmSync(join(dir, `${Number(page)}.svg`), { force: true })
        res.statusCode = 204
        res.end()
      })
    },
  }]
})
