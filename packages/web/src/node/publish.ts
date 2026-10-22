import { statSync } from 'node:fs'
import { join } from 'node:path'
import { irBlocks, mapHtmlUrls, NON_FILE_URL, publishedUrl, withPublishedAssets } from '@lincyaw/kernel'
import type { DocumentLink, IRBlock, IRDocument, IRSection, LocalAsset, MdastNode, RenderContext, SourcePos } from '@lincyaw/kernel'
import { copyPublished } from '@lincyaw/kernel/node'
import katex from 'katex'

export const MEDIA = 'media'

const LINKED = new Set(['image', 'link', 'definition', 'card'])

interface Asset extends LocalAsset {
  size: number
  mtimeMs: number
}

const assets = new Map<string, Asset>()

function localAsset(ctx: RenderContext, source: SourcePos, url: string): Asset | undefined {
  const key = `${source.file}\0${url}`
  const known = assets.get(key)
  const now = known && statSync(known.file, { throwIfNoEntry: false })
  if (known && now && now.size === known.size && now.mtimeMs === known.mtimeMs) return known
  const found = ctx.localAsset(source, url)
  const stat = found && statSync(found.file, { throwIfNoEntry: false })
  if (!found || !stat) {
    assets.delete(key)
    return undefined
  }
  const asset = { ...found, size: stat.size, mtimeMs: stat.mtimeMs, directory: found.directory ?? stat.isDirectory() }
  if (asset.directory) assets.delete(key)
  else assets.set(key, asset)
  return asset
}

const rendered = new Map<string, string>()
const PUBLICATION_CACHE_BYTES = 16 << 20

function renderMath(tex: string, display: boolean): string {
  const key = `${display ? 'D' : 'I'}${tex}`
  let html = rendered.get(key)
  if (html === undefined) {
    html = katex.renderToString(tex, { displayMode: display, throwOnError: false })
    rendered.set(key, html)
  }
  return html
}

export type DocumentPage = (link: DocumentLink) => string | undefined

export class PublicationCache {
  readonly #sections = new Map<string, { key: string, section: IRSection, bytes: number }>()
  #bytes = 0

  lookup(section: IRSection): { key: string, section?: IRSection } {
    const key = JSON.stringify(section)
    const known = this.#sections.get(section.id)
    return { key, ...known?.key === key ? { section: known.section } : {} }
  }

  store(original: IRSection, key: string, section: IRSection): void {
    const old = this.#sections.get(original.id)
    if (old) this.#bytes -= old.bytes
    this.#sections.delete(original.id)
    // Local files and raw HTML can change independently of the IR. Revisit them.
    const local = (node: MdastNode): boolean => node.type === 'html'
      || (LINKED.has(node.type) && typeof node.url === 'string' && !NON_FILE_URL.test(node.url))
      || Boolean(node.children?.some(local))
    for (const block of irBlocks(original.blocks)) {
      if (block.node.type === 'markdown' && local(block.node.mdast)) return
      if (block.node.type === 'component' && (Object.keys(block.node.assets ?? {}).length || (block.node.fallback && local(block.node.fallback)))) return
    }
    const bytes = (key.length + JSON.stringify(section).length) * 2
    if (bytes > PUBLICATION_CACHE_BYTES) return
    this.#sections.set(original.id, { key, section, bytes })
    this.#bytes += bytes
    while (this.#bytes > PUBLICATION_CACHE_BYTES || this.#sections.size > 2048) {
      const first = this.#sections.keys().next().value!
      this.#bytes -= this.#sections.get(first)!.bytes
      this.#sections.delete(first)
    }
  }

  prune(ids: Set<string>): void {
    for (const [id, entry] of this.#sections) {
      if (ids.has(id)) continue
      this.#sections.delete(id)
      this.#bytes -= entry.bytes
    }
  }
}

export function publishedDocument(doc: IRDocument, ctx: RenderContext, publicDir: string, base: string, documentPage?: DocumentPage, cache?: PublicationCache): IRDocument {
  const { deckDir } = ctx
  const copy: IRDocument = structuredClone(cache ? { ...doc, sections: [] } : doc)
  const media = join(publicDir, MEDIA)
  const relative = (pos: { file: string }) => {
    pos.file = ctx.portable(pos.file, deckDir) as string
  }
  const publish = (url: string, source: SourcePos): string | undefined => {
    const linked = documentPage && ctx.documentLink?.(source, url)
    if (linked) return documentPage(linked)
    const asset = localAsset(ctx, source, url)
    if (!asset) return undefined
    copyPublished(asset, media)
    return publishedUrl(asset, url, { prefix: `${base}${MEDIA}/` })
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
      node.props = withPublishedAssets(node, url => publish(url, source)).props
    }
  }
  copy.meta.entry = ctx.portable(copy.meta.entry, deckDir) as string
  copy.config.presmium = ctx.portable(copy.config.presmium, deckDir) as IRDocument['config']['presmium']
  for (const original of cache ? doc.sections : copy.sections) {
    const known = cache?.lookup(original)
    if (known?.section) {
      copy.sections.push(known.section)
      continue
    }
    const section = cache ? structuredClone(original) : original
    relative(section.source)
    if (section.config) section.config = ctx.portable(section.config, deckDir) as typeof section.config
    for (const b of irBlocks(section.blocks)) block(b)
    for (const b of irBlocks(section.blocks)) relative(b.source)
    if (cache) {
      copy.sections.push(section)
      cache.store(original, known!.key, section)
    }
  }
  cache?.prune(new Set(doc.sections.map(section => section.id)))
  for (const finding of copy.diagnostics) {
    if (finding.source) relative(finding.source)
  }
  return copy
}

export function publishedFile(ctx: RenderContext, publicDir: string, base: string, source: SourcePos, url: string): string | undefined {
  const asset = localAsset(ctx, source, url)
  if (!asset || asset.directory) return undefined
  copyPublished(asset, join(publicDir, MEDIA))
  return publishedUrl(asset, url, { prefix: `${base}${MEDIA}/` })
}
