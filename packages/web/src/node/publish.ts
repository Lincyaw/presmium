import { cpSync, existsSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { irBlocks, withProp } from '@presmium/kernel'
import type { IRBlock, IRDocument, MdastNode, RenderContext, SourcePos } from '@presmium/kernel'
import katex from 'katex'
import { mapHtmlUrls } from './html.ts'
import { urlPath } from '../domain/index.ts'

/** Directory of the site's `public/` where the deck's local files are copied. */
export const MEDIA = 'media'

/** Nodes whose URL may name a local file: a card's `:link:` too (docs/ir.md 2.10). */
const LINKED = new Set(['image', 'link', 'definition', 'card'])

/** A local file a URL names, with the size and time it had when its name was hashed; or a directory, published with its file listing. */
interface Asset {
  file: string
  name: string
  size: number
  mtimeMs: number
  directory: boolean
}

/**
 * The files URLs name, by source file and URL: a dev server publishes the
 * document at every edit, and a file whose size and time have not changed
 * keeps its name without being read and hashed again. A directory is asked
 * for each time: its files may change while it does not.
 */
const assets = new Map<string, Asset>()

function localAsset(ctx: RenderContext, source: SourcePos, url: string): Asset | undefined {
  const key = `${source.file}\0${url}`
  const known = assets.get(key)
  const now = known && statSync(known.file, { throwIfNoEntry: false })
  if (known && now && now.size === known.size && now.mtimeMs === known.mtimeMs) return known
  const found = ctx.localAsset(source, url)
  const stat = found && statSync(found.file)
  if (!found || !stat) {
    assets.delete(key)
    return undefined
  }
  const asset = { ...found, size: stat.size, mtimeMs: stat.mtimeMs, directory: stat.isDirectory() }
  if (asset.directory) assets.delete(key)
  else assets.set(key, asset)
  return asset
}

/** Math rendered once per formula: a dev server publishes the document at every edit. */
const rendered = new Map<string, string>()

/** KaTeX's HTML of a formula, as the browser would render it, so pages show math without loading KaTeX. */
function renderMath(tex: string, display: boolean): string {
  const key = `${display ? 'D' : 'I'}${tex}`
  let html = rendered.get(key)
  if (html === undefined) {
    html = katex.renderToString(tex, { displayMode: display, throwOnError: false })
    rendered.set(key, html)
  }
  return html
}

/**
 * The document as the web site publishes it: source paths and paths in the
 * plugin configuration relative to the deck (no local paths in a public
 * site); the local files that images, links, link definitions, cards, the
 * `src`, `poster` and `href` of raw HTML and the `assets` of components name
 * copied to `<publicDir>/media/` under their published names
 * (`RenderContext.localAsset`; a directory with its file listing, which the
 * URL opens), their URLs rewritten under the site base; and math rendered by
 * KaTeX, so the static pages show it.
 */
export function publishedDocument(doc: IRDocument, ctx: RenderContext, publicDir: string, base: string): IRDocument {
  const { deckDir } = ctx
  const copy = structuredClone(doc)
  const media = join(publicDir, MEDIA)
  const relative = (pos: { file: string }) => {
    pos.file = ctx.portable(pos.file, deckDir) as string
  }
  const publish = (url: string, source: SourcePos): string | undefined => {
    const asset = localAsset(ctx, source, url)
    if (!asset) return undefined
    const target = join(media, asset.name)
    // The name holds the content hash: an existing copy is up to date, and a dev server sees no change.
    if (!existsSync(target)) cpSync(asset.file, target, { recursive: true })
    return `${base}${MEDIA}/${urlPath(asset.name)}${asset.directory ? '/index.html' : ''}${/[?#].*$/s.exec(url)?.[0] ?? ''}`
  }
  const mdast = (node: MdastNode, source: SourcePos) => {
    if (LINKED.has(node.type) && typeof node.url === 'string') node.url = publish(node.url, source) ?? node.url
    if (node.type === 'html' && typeof node.value === 'string') node.value = mapHtmlUrls(node.value, url => publish(url, source))
    if ((node.type === 'math' || node.type === 'inlineMath') && typeof node.value === 'string') node.html = renderMath(node.value, node.type === 'math')
    node.children?.forEach(child => mdast(child, source))
  }
  const block = (b: IRBlock) => {
    const { node, source } = b
    if (node.type === 'markdown') mdast(node.mdast, source)
    if (node.type === 'component') {
      if (node.fallback) mdast(node.fallback, source)
      for (const [path, url] of Object.entries(node.assets ?? {})) {
        const published = publish(url, source)
        if (published) node.props = withProp(node.props, path, published)
      }
    }
  }
  copy.meta.entry = ctx.portable(copy.meta.entry, deckDir) as string
  copy.config.presmium = ctx.portable(copy.config.presmium, deckDir) as IRDocument['config']['presmium']
  for (const section of copy.sections) {
    relative(section.source)
    if (section.config) section.config = ctx.portable(section.config, deckDir) as typeof section.config
    for (const b of irBlocks(section.blocks)) block(b)
    // Positions last: the files of a block are found relative to its source file.
    for (const b of irBlocks(section.blocks)) relative(b.source)
  }
  for (const finding of copy.diagnostics) {
    if (finding.source) relative(finding.source)
  }
  return copy
}

/**
 * A local file the site itself names (the image of the site's `head`), as
 * `publishedDocument` publishes those of blocks: relative to `source`'s file.
 * Undefined when it names none.
 */
export function publishedFile(ctx: RenderContext, publicDir: string, base: string, source: SourcePos, url: string): string | undefined {
  const asset = localAsset(ctx, source, url)
  if (!asset || asset.directory) return undefined
  const target = join(publicDir, MEDIA, asset.name)
  if (!existsSync(target)) cpSync(asset.file, target)
  return `${base}${MEDIA}/${urlPath(asset.name)}`
}
