import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

/** Directory next to the notebook that holds the local files it shows or links. */
export const MEDIA_DIR = 'media'

/** URLs that do not name a local file: a scheme, protocol-relative or a fragment. */
const REMOTE = /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i

/**
 * Empties `<outDir>/media` and returns the `media` option of the notebook
 * renderer: the URL of a local file that an image or a link points to (a
 * figure, a localized diagram, the fallback link of a media file) becomes
 * that of its copy, `media/<hash>-<name>`, so the notebook keeps its files
 * wherever its directory goes. A file is copied when the notebook first shows
 * a URL to it. In the IR such URLs are relative to the source file of their
 * block; `/...` names a file in the deck's `public/`, as in the web and slides
 * forms. Other URLs, and those that name no file, are kept.
 */
export function localMedia(deckDir: string, outDir: string): (url: string, from: string) => string | undefined {
  const dir = join(outDir, MEDIA_DIR)
  rmSync(dir, { recursive: true, force: true })
  return (url, from) => {
    if (REMOTE.test(url)) return undefined
    const [, path = '', rest = ''] = /^([^?#]*)(.*)$/s.exec(url) ?? []
    const name = path && decoded(path)
    if (!name) return undefined
    const file = name.startsWith('/') ? join(deckDir, 'public', name) : resolve(dirname(from), name)
    if (!existsSync(file) || !statSync(file).isFile()) return undefined
    const copy = `${createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 8)}-${basename(file)}`
    if (!existsSync(join(dir, copy))) {
      mkdirSync(dir, { recursive: true })
      copyFileSync(file, join(dir, copy))
    }
    return `${MEDIA_DIR}/${encodeURIComponent(copy)}${rest}`
  }
}

/** The path a URL path names; undefined when its escapes are malformed. */
function decoded(path: string): string | undefined {
  try {
    return decodeURIComponent(path)
  } catch {
    return undefined
  }
}
