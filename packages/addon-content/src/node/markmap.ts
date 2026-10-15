import type { DirectiveSpec } from '@presmium/kernel'
import { Transformer } from 'markmap-lib'
import { CONTENT_ID, encodeMarkmap, markmapOutline } from '../domain/index.ts'

const transformer = new Transformer()

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * `{markmap}` (P-41): headings and lists drawn as a mindmap by `PmMarkmap`;
 * renderers that cannot draw it show the outline as a nested list. The
 * `markmap` option holds markmap's JSON options; a YAML block at the start of
 * the body sets it, as markmap's own frontmatter does.
 */
export const markmapDirective: DirectiveSpec = {
  name: 'markmap',
  body: true,
  toIR(input) {
    const { root, frontmatter } = transformer.transform(input.body)
    const options = isRecord(input.options.markmap) ? input.options.markmap : frontmatter?.markmap
    return {
      node: {
        type: 'component',
        plugin: CONTENT_ID,
        name: 'PmMarkmap',
        props: { data: encodeMarkmap({ root, ...options ? { options } : {} }) },
        fallback: markmapOutline(root),
      },
    }
  },
}
