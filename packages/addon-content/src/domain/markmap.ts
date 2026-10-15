/** A mindmap node as produced by markmap-lib; `content` is HTML. */
export interface MarkmapNode {
  content: string
  children: MarkmapNode[]
  payload?: Record<string, unknown>
}

/** What a `markmap` code block hands to `PmMarkmap`. */
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
