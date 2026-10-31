import type { IRDocument, MdastNode } from '@lincyaw/kernel'
import type { Root } from 'hast'
import type { Viewer } from '../viewer-state.ts'
import { footnoteSections } from '../../domain/index.ts'
import { isPartialTree, markdownToHast } from './handlers.ts'
import type { MarkdownLinks } from './handlers.ts'

interface CachedTree {
  node: MdastNode
  key: string
  tree: Root
  bytes: number
}

interface ViewerTrees {
  /** What the trees' links were made from: the sections' addresses and titles and where the footnotes are. */
  links: string
  nodes: Map<MdastNode, Map<string, CachedTree>>
  recent: Map<CachedTree, true>
  bytes: number
}

// Enough for every Markdown block of a long document, so that an edit converts only the blocks it changed.
const TREE_LIMIT = 4096
const TREE_BYTES = 16 << 20
const viewerTrees = new WeakMap<Viewer, ViewerTrees>()
const signatures = new WeakMap<IRDocument, string>()

/**
 * What a Markdown node's links read from the whole document: each section's address and title (a reference's text and
 * target) and the sections of the footnotes. Most edits leave it as it was, and the trees of the nodes they did not
 * touch stay; a new title or a moved section changes it.
 */
function linkSignature(viewer: Viewer, doc: IRDocument): string {
  let known = signatures.get(doc)
  if (known === undefined) {
    const sections = doc.sections.map(section => [section.id, section.title, viewer.options.sectionHref?.(section.id) ?? ''])
    signatures.set(doc, known = JSON.stringify([sections, [...footnoteSections(doc)]]))
  }
  return known
}

/**
 * The HAST tree of a Markdown node, kept per viewer (least recently used first out) so that remounts, and the nodes a
 * change of the document left as they were (`applyUpdate` keeps their objects), reuse it.
 */
export function cachedTree(viewer: Viewer, doc: IRDocument, node: MdastNode, prefix: string, links: MarkdownLinks, locale: string): Root {
  const key = JSON.stringify([prefix, locale])
  const signature = linkSignature(viewer, doc)
  let cache = viewerTrees.get(viewer)
  if (cache?.links !== signature) viewerTrees.set(viewer, cache = { links: signature, nodes: new Map(), recent: new Map(), bytes: 0 })
  const known = cache.nodes.get(node)?.get(key)
  if (known) {
    cache.recent.delete(known)
    cache.recent.set(known, true)
    return known.tree
  }
  const tree = markdownToHast(node, prefix, links)
  // Only immutable HAST survives component unmounts; no VNodes or mounted resources are retained.
  const bytes = JSON.stringify(tree).length * 2 // UTF-16 JSON size is a soft heap estimate.
  if (bytes > TREE_BYTES || isPartialTree(tree)) return tree
  const entry: CachedTree = { node, key, tree, bytes }
  const variants = cache.nodes.get(node) ?? new Map<string, CachedTree>()
  variants.set(key, entry)
  cache.nodes.set(node, variants)
  cache.recent.set(entry, true)
  cache.bytes += bytes
  while (cache.recent.size > TREE_LIMIT || cache.bytes > TREE_BYTES) {
    const first = cache.recent.keys().next().value!
    cache.recent.delete(first)
    cache.bytes -= first.bytes
    const old = cache.nodes.get(first.node)!
    old.delete(first.key)
    if (old.size === 0) cache.nodes.delete(first.node)
  }
  return tree
}
