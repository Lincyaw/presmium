import { isRecord } from '@lincyaw/kernel'
import type { DirectiveSpec } from '@lincyaw/kernel'
import { Transformer } from 'markmap-lib'
import { CONTENT_ID, encodeMarkmap, markmapOutline } from '../domain/index.ts'

const transformer = new Transformer()

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
