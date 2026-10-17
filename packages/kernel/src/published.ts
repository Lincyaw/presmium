/**
 * How the renderers write the URL of a local file they publish (docs/ir.md
 * 6.2): its published name under the renderer's prefix, a directory at its
 * file listing, the URL's query and fragment kept. Copying it is
 * `copyPublished` of `@presmium/kernel/node`.
 */
import type { LocalAsset } from './ir.ts'

export interface PublishedUrlOptions {
  /** What comes before the published name: e.g. `media/` (a notebook), `/` or the site's base. Default ''. */
  prefix?: string
  /** What a directory's URL ends with, to open its listing: `/index.html` (default) or `/`. */
  directoryIndex?: string
}

/** The URL of a published file (`RenderContext.localAsset`) for a block's `url`, which keeps its `?query` and `#fragment`. */
export function publishedUrl(found: Pick<LocalAsset, 'name' | 'directory'>, url: string, options: PublishedUrlOptions = {}): string {
  const index = found.directory ? options.directoryIndex ?? '/index.html' : ''
  return `${options.prefix ?? ''}${encodeURIComponent(found.name)}${index}${/[?#].*$/s.exec(url)?.[0] ?? ''}`
}
