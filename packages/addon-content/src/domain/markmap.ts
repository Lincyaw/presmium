import type { MdastNode } from '@presmium/kernel'

/** A mindmap node as produced by markmap-lib; `content` is HTML. */
export interface MarkmapNode {
  content: string
  children: MarkmapNode[]
  payload?: Record<string, unknown>
}

/** What a `{markmap}` directive hands to `PmMarkmap`. */
export interface MarkmapData {
  root: MarkmapNode
  /** The `markmap` key of the block's own frontmatter (markmap's JSON options). */
  options?: Record<string, unknown>
}

// URI encoding keeps quotes, `<` and `{{` out of the attribute value, so the
// generated tag is safe in the Vue templates of both forms.
export function encodeMarkmap(data: MarkmapData): string {
  return encodeURIComponent(JSON.stringify(data))
}

export function decodeMarkmap(value: string): MarkmapData {
  return JSON.parse(decodeURIComponent(value)) as MarkmapData
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' }

/** Text of a node's HTML content; markmap writes characters beyond ASCII as numeric entities. */
function text(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, name: string) => {
    if (name[0] !== '#') return ENTITIES[name] ?? entity
    return String.fromCodePoint(name[1] === 'x' || name[1] === 'X' ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1)))
  }).trim()
}

/** The mindmap as a nested list, for renderers that cannot draw it (a notebook). */
export function markmapOutline(root: MarkmapNode): MdastNode {
  const item = (node: MarkmapNode): MdastNode => ({
    type: 'listItem',
    spread: false,
    children: [
      { type: 'paragraph', children: [{ type: 'text', value: text(node.content) }] },
      ...node.children.length > 0 ? [list(node.children)] : [],
    ],
  })
  const list = (nodes: MarkmapNode[]): MdastNode => ({ type: 'list', ordered: false, spread: false, children: nodes.map(item) })
  return { type: 'root', children: [list([root])] }
}
