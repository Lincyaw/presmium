import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import type { IRBlock, IRDocument, MdastNode, SourcePos } from '@presmium/kernel'

/** Directory of the site's `public/` where the deck's local images are copied. */
const MEDIA = 'media'

const REMOTE = /^(?:[a-z][a-z\d+.-]*:|\/\/|#|\/)/i

function relativeTo(deckDir: string, file: string): string {
  return isAbsolute(file) ? relative(deckDir, file).split('\\').join('/') : file
}

/**
 * The document as the web site publishes it: source paths relative to the
 * deck (no local paths in a public site), and local images copied to
 * `<publicDir>/media/` with their URLs rewritten under the site base.
 */
export function publishedDocument(doc: IRDocument, deckDir: string, publicDir: string, base: string): IRDocument {
  const copy = structuredClone(doc)
  const source = (pos: SourcePos) => {
    pos.file = relativeTo(deckDir, pos.file)
  }
  const image = (node: MdastNode, from: string) => {
    if (node.type === 'image' && typeof node.url === 'string' && !REMOTE.test(node.url)) {
      const file = resolve(dirname(from), decodeURI(node.url.split(/[?#]/)[0]!))
      if (existsSync(file) && statSync(file).isFile()) {
        const hash = createHash('sha256').update(readFileSync(file)).digest('hex').slice(0, 8)
        const name = `${hash}-${basename(file)}`
        // The name holds the content hash: an existing copy is up to date, and a dev server sees no change.
        if (!existsSync(join(publicDir, MEDIA, name))) {
          mkdirSync(join(publicDir, MEDIA), { recursive: true })
          copyFileSync(file, join(publicDir, MEDIA, name))
        }
        node.url = `${base}${MEDIA}/${encodeURIComponent(name)}`
      }
    }
    node.children?.forEach(child => image(child, from))
  }
  const block = (b: IRBlock) => {
    const file = b.source.file
    if (b.node.type === 'markdown') image(b.node.mdast, file)
    if (b.node.type === 'component') {
      if (b.node.fallback) image(b.node.fallback, file)
      b.node.children?.forEach(block)
    }
    source(b.source)
  }
  copy.meta.entry = relativeTo(deckDir, copy.meta.entry)
  for (const section of copy.sections) {
    source(section.source)
    section.blocks.forEach(block)
  }
  for (const finding of copy.diagnostics) {
    if (finding.source) finding.source.file = relativeTo(deckDir, finding.source.file)
  }
  return copy
}
