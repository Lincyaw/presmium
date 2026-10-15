import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import type { IRBlock, IRDocument, MdastNode } from '@presmium/kernel'

/** Directory next to the notebook that holds the local files it shows or links. */
export const MEDIA_DIR = 'media'

/** URLs that do not name a local file: a scheme, protocol-relative or a fragment. */
const REMOTE = /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i

/**
 * The document with every local file that an image or a link points to (a
 * figure, a localized diagram, the fallback link of a media file) copied to
 * `<outDir>/media/<hash>-<name>` and its URL rewritten to that path, so the
 * notebook keeps them wherever its directory goes. In the IR such URLs are
 * relative to the source file of their block; `/...` names a file in the
 * deck's `public/`, as in the web and slides forms.
 */
export function withLocalMedia(doc: IRDocument, deckDir: string, outDir: string): IRDocument {
  const copy = structuredClone(doc)
  rmSync(join(outDir, MEDIA_DIR), { recursive: true, force: true })
  const local = (url: string, from: string): string | undefined => {
    if (REMOTE.test(url)) return undefined
    const [, path = '', rest = ''] = /^([^?#]*)(.*)$/s.exec(url) ?? []
    if (!path) return undefined
    const file = path.startsWith('/') ? join(deckDir, 'public', decodeURI(path)) : resolve(dirname(from), decodeURI(path))
    if (!existsSync(file) || !statSync(file).isFile()) return undefined
    const name = `${createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 8)}-${basename(file)}`
    if (!existsSync(join(outDir, MEDIA_DIR, name))) {
      mkdirSync(join(outDir, MEDIA_DIR), { recursive: true })
      copyFileSync(file, join(outDir, MEDIA_DIR, name))
    }
    return `${MEDIA_DIR}/${encodeURI(name)}${rest}`
  }
  const rewrite = (node: MdastNode, from: string) => {
    if ((node.type === 'image' || node.type === 'link' || node.type === 'definition') && typeof node.url === 'string') {
      node.url = local(node.url, from) ?? node.url
    }
    node.children?.forEach(child => rewrite(child, from))
  }
  const block = ({ node, source }: IRBlock) => {
    if (node.type === 'markdown') rewrite(node.mdast, source.file)
    if (node.type === 'component') {
      if (node.fallback) rewrite(node.fallback, source.file)
      node.children?.forEach(block)
    }
  }
  copy.sections.forEach(section => section.blocks.forEach(block))
  return copy
}
