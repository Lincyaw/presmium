import { irBlocks, nodeMdast } from '@lincyaw/kernel'
import type { Finding, IRDocument, MdastNode } from '@lincyaw/kernel'
import type { GenericParent } from 'myst-common'
import { normalizeLabel } from 'myst-common'
import { enumerateTargetsTransform, ReferenceState } from 'myst-transforms'

type Reference = Parameters<ReferenceState['resolveReferenceContent']>[0]

export function resolveReferences(doc: IRDocument, report: (finding: Finding) => void): void {
  const state = new ReferenceState(doc.meta.entry)
  const targets: MdastNode[] = []
  for (const section of doc.sections) {
    targets.push({ type: 'heading', depth: Math.max(section.depth, 1), ...normalizeLabel(section.id), children: [{ type: 'text', value: section.title }] })
    for (const block of irBlocks(section.blocks)) {
      if (block.node.type === 'markdown') targets.push(...block.node.mdast.children ?? [])
    }
  }
  enumerateTargetsTransform({ type: 'root', children: targets } as GenericParent, { state })

  for (const section of doc.sections) {
    for (const block of irBlocks(section.blocks)) {
      for (const reference of nodeMdast(block.node).flatMap(crossReferences)) {
        const resolved = { ...reference } as Reference
        state.resolveReferenceContent(resolved)
        if (!resolved.resolved) {
          report({
            checkId: 'presmium.references',
            severity: 'warning',
            message: `{${String(reference.kind ?? 'ref')}} target "${String(reference.label ?? reference.identifier)}" not found`,
            source: { file: block.source.file, line: block.source.line },
          })
        } else if (!reference.children?.length) {
          reference.children = resolved.children as MdastNode[]
        }
      }
    }
  }
}

function crossReferences(node: MdastNode): MdastNode[] {
  return node.type === 'crossReference' ? [node] : (node.children ?? []).flatMap(crossReferences)
}
