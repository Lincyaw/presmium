import type { IRDocument, MdastNode } from '@lincyaw/kernel'
import type { Root } from 'hast'
import type { Viewer } from '../viewer-state.ts'
import { markdownToHast } from './handlers.ts'
import type { MarkdownLinks } from './handlers.ts'

interface CachedTree {
  node: MdastNode
  key: string
  tree: Root
  bytes: number
}

interface DocumentTrees {
  nodes: Map<MdastNode, Map<string, CachedTree>>
  recent: Map<CachedTree, true>
  bytes: number
}

const TREE_LIMIT = 256
const TREE_BYTES = 4 << 20
const viewerTrees = new WeakMap<Viewer, WeakMap<IRDocument, DocumentTrees>>()

/** The HAST tree of a Markdown node, kept per viewer and document (least recently used first out) so that remounts reuse it. */
export function cachedTree(viewer: Viewer, doc: IRDocument, node: MdastNode, prefix: string, links: MarkdownLinks, locale: string): Root {
  const key = JSON.stringify([prefix, locale])
  let documentTrees = viewerTrees.get(viewer)
  if (!documentTrees) {
    documentTrees = new WeakMap()
    viewerTrees.set(viewer, documentTrees)
  }
  let cache = documentTrees.get(doc)
  const known = cache?.nodes.get(node)?.get(key)
  if (cache && known) {
    cache.recent.delete(known)
    cache.recent.set(known, true)
    return known.tree
  }
  const tree = markdownToHast(node, prefix, links)
  // Only immutable HAST survives component unmounts; no VNodes or mounted resources are retained.
  const bytes = JSON.stringify(tree).length * 2 // UTF-16 JSON size is a soft heap estimate.
  if (bytes > TREE_BYTES) return tree
  if (!cache) {
    cache = { nodes: new Map(), recent: new Map(), bytes: 0 }
    documentTrees.set(doc, cache)
  }
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
