import { rmSync } from 'node:fs'
import { join } from 'node:path'
import { publishedUrl } from '@presmium/kernel'
import type { RenderContext, SourcePos } from '@presmium/kernel'
import { copyPublished } from '@presmium/kernel/node'

export const MEDIA_DIR = 'media'

export function localMedia(ctx: RenderContext): (url: string, source: SourcePos) => string | undefined {
  const dir = join(ctx.outDir, MEDIA_DIR)
  rmSync(dir, { recursive: true, force: true })
  return (url, source) => {
    const found = ctx.localAsset(source, url)
    if (!found) return undefined
    copyPublished(found, dir)
    return publishedUrl(found, url, { prefix: `${MEDIA_DIR}/`, directoryIndex: '/' })
  }
}
