import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { IRBlock, IRDocument, MdastNode, SourcePos } from '@presmium/kernel'

/** Directory of the site's `public/` where the deck's local images are copied. */
const MEDIA = 'media'

const REMOTE = /^(?:[a-z][a-z\d+.-]*:|\/\/|#|\/)/i

function relativeTo(deckDir: string, file: string): string {
  return isAbsolute(file) ? relative(deckDir, file).split('\\').join('/') : file
}

/** Where the deck is: its directory and its repository (`RenderContext.workspaceRoot`). */
export interface DeckLocation {
  deckDir: string
  workspaceRoot: string
}

function inRepository(path: string, root: string): boolean {
  if (!isAbsolute(path)) return false
  const rel = relative(root, path)
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel)
}

/**
 * A configuration value whose absolute paths in the deck's repository (e.g.
 * a workspace a pass resolved) are made relative to the deck, so the site
 * does not depend on where the deck was built. Other strings, such as site
 * paths (`/web`), stay as they are.
 */
function portable(value: unknown, deck: DeckLocation): unknown {
  if (typeof value === 'string') return inRepository(value, deck.workspaceRoot) ? relativeTo(deck.deckDir, value) || '.' : value
  if (Array.isArray(value)) return value.map(item => portable(item, deck))
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, portable(item, deck)]))
  return value
}

/**
 * The document as the web site publishes it: source paths and paths in the
 * plugin configuration relative to the deck (no local paths in a public
 * site), and local images copied to `<publicDir>/media/` with their URLs
 * rewritten under the site base.
 */
export function publishedDocument(doc: IRDocument, deck: DeckLocation, publicDir: string, base: string): IRDocument {
  const { deckDir } = deck
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
  copy.config.presmium = portable(copy.config.presmium, deck) as IRDocument['config']['presmium']
  for (const section of copy.sections) {
    source(section.source)
    if (section.config) section.config = portable(section.config, deck) as typeof section.config
    section.blocks.forEach(block)
  }
  for (const finding of copy.diagnostics) {
    if (finding.source) finding.source.file = relativeTo(deckDir, finding.source.file)
  }
  return copy
}
