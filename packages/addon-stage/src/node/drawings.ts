import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { jsonResponse } from '@lincyaw/kernel'
import type { Route, ServerContext } from '@lincyaw/kernel'
import { DRAWINGS_DIR, drawingFile, drawingSection } from '../domain/index.ts'

// A slide's drawing: an SVG of strokes.
const MAX_DRAWING = 4 << 20

/** The drawings of the document, kept below its `.presmium/drawings/` while the presenter draws in a server's page. */
export function drawingsRoute(ctx: ServerContext): Route {
  const dir = join(ctx.deckDir, DRAWINGS_DIR)
  return {
    role: 'editor',
    maxBody: MAX_DRAWING,
    async handle(request, { rest }) {
      if (request.method === 'GET' && rest === '') {
        const files = await readdir(dir).catch(() => [])
        const drawings: Record<string, string> = {}
        for (const file of files) {
          const section = drawingSection(file)
          if (section !== undefined) drawings[section] = await readFile(join(dir, file), 'utf8')
        }
        return jsonResponse(drawings)
      }
      if (request.method !== 'PUT' || rest === '') return new Response(null, { status: 405 })
      let section: string
      try {
        section = decodeURIComponent(rest)
      } catch {
        return new Response(null, { status: 400 })
      }
      const file = join(dir, drawingFile(section))
      const svg = await request.text()
      if (svg) {
        await mkdir(dir, { recursive: true })
        await writeFile(file, svg)
      } else await rm(file, { force: true })
      return new Response(null, { status: 204 })
    },
  }
}
