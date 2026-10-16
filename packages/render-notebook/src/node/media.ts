import { cpSync, existsSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { RenderContext, SourcePos } from '@presmium/kernel'

/** Directory next to the notebook that holds the local files it shows or links. */
export const MEDIA_DIR = 'media'

/**
 * Empties `<outDir>/media` and returns the `media` option of the notebook
 * renderer: the URL of a local file that an image, a link, raw HTML or a
 * component's `assets` names (`RenderContext.localAsset`: relative to the
 * block's source file, or `/...` in the deck's `public/`) becomes that of its
 * copy, `media/<hash>-<name>`, so the notebook keeps its files wherever its
 * directory goes; a directory is copied with its files (docs/ir.md 6.2). A
 * file is copied when the notebook first shows a URL to it. Other URLs, and
 * those that name no file, are kept.
 */
export function localMedia(ctx: RenderContext): (url: string, source: SourcePos) => string | undefined {
  const dir = join(ctx.outDir, MEDIA_DIR)
  rmSync(dir, { recursive: true, force: true })
  return (url, source) => {
    const found = ctx.localAsset(source, url)
    if (!found) return undefined
    if (!existsSync(join(dir, found.name))) cpSync(found.file, join(dir, found.name), { recursive: true })
    const directory = statSync(found.file).isDirectory() ? '/' : ''
    return `${MEDIA_DIR}/${encodeURIComponent(found.name)}${directory}${/[?#].*$/s.exec(url)?.[0] ?? ''}`
  }
}
