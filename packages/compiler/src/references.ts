/**
 * Cross-references (`{ref}`, `{eq}`, `{numref}`): MyST's own transforms
 * enumerate the targets of the IR in document order (the sections, by their
 * ids, and the labelled equations, figures and tables) and give each
 * reference written without text the text of its target: the section title,
 * or the number, e.g. `(1)` or `Figure 2`. References with text keep it; a
 * reference whose target does not exist is reported.
 */
import type { Finding, IRBlock, IRDocument, MdastNode } from '@presmium/kernel'
import type { GenericParent } from 'myst-common'
import { normalizeLabel } from 'myst-common'
import { enumerateTargetsTransform, ReferenceState } from 'myst-transforms'

type Reference = Parameters<ReferenceState['resolveReferenceContent']>[0]

export function resolveReferences(doc: IRDocument, report: (finding: Finding) => void): void {
  const state = new ReferenceState(doc.meta.entry)
  const targets: MdastNode[] = []
  for (const section of doc.sections) {
    targets.push({ type: 'heading', depth: Math.max(section.depth, 1), ...normalizeLabel(section.id), children: [{ type: 'text', value: section.title }] })
    for (const block of allBlocks(section.blocks)) {
      if (block.node.type === 'markdown') targets.push(...block.node.mdast.children ?? [])
    }
  }
  // Numbers the targets in place (`enumerator`), so renderers can show them.
  enumerateTargetsTransform({ type: 'root', children: targets } as GenericParent, { state })

  for (const section of doc.sections) {
    for (const block of allBlocks(section.blocks)) {
      const { node } = block
      const trees = node.type === 'markdown' ? [node.mdast] : node.type === 'component' && node.fallback ? [node.fallback] : []
      for (const reference of trees.flatMap(crossReferences)) {
        // Resolved on a copy: the IR keeps the reference as written, only its text is filled in.
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

function* allBlocks(blocks: IRBlock[]): Generator<IRBlock> {
  for (const block of blocks) {
    yield block
    if (block.node.type === 'component' && block.node.children) yield* allBlocks(block.node.children)
  }
}

function crossReferences(node: MdastNode): MdastNode[] {
  return node.type === 'crossReference' ? [node] : (node.children ?? []).flatMap(crossReferences)
}
