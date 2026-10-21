import { irBlocks, nodeMdast } from '@lincyaw/kernel'
import type { Finding, IRDocument, MdastNode, SourcePos } from '@lincyaw/kernel'
import type { GenericParent } from 'myst-common'
import { normalizeLabel } from 'myst-common'
import { enumerateTargetsTransform, ReferenceState } from 'myst-transforms'

type Reference = Parameters<ReferenceState['resolveReferenceContent']>[0]
const IMPLICIT_TARGETS = new Set(['container', 'mathGroup', 'math', 'heading', 'proof'])

export function resolveReferences(doc: IRDocument, report: (finding: Finding) => void): void {
  const references: { node: MdastNode, source: SourcePos }[] = []
  for (const section of doc.sections) {
    for (const block of irBlocks(section.blocks)) {
      for (const tree of nodeMdast(block.node)) collectReferences(tree, block.source, references)
    }
  }
  const state = new ReferenceState(doc.meta.entry)
  const targets: MdastNode[] = []
  for (const section of doc.sections) {
    targets.push({ type: 'heading', depth: Math.max(section.depth, 1), ...normalizeLabel(section.id), children: [{ type: 'text', value: section.title }] })
    for (const block of irBlocks(section.blocks)) {
      if (block.node.type === 'markdown') for (const child of block.node.mdast.children ?? []) collectTargets(child, targets)
    }
  }
  enumerateTargetsTransform({ type: 'root', children: targets } as GenericParent, { state })

  for (const { node: reference, source } of references) {
    const resolved = { ...reference } as Reference
    state.resolveReferenceContent(resolved)
    if (!resolved.resolved) {
      report({
        checkId: 'presmium.references',
        severity: 'warning',
        message: `{${String(reference.kind ?? 'ref')}} target "${String(reference.label ?? reference.identifier)}" not found`,
        source: { file: source.file, line: source.line },
      })
    } else if (!reference.children?.length) {
      reference.children = resolved.children as MdastNode[]
    }
  }
}

function collectReferences(node: MdastNode, source: SourcePos, into: { node: MdastNode, source: SourcePos }[]): void {
  if (node.type === 'crossReference') into.push({ node, source })
  else for (const child of node.children ?? []) collectReferences(child, source, into)
}

function collectTargets(node: MdastNode, into: MdastNode[]): void {
  // Keep target subtrees intact, including containers' subfigures and math groups.
  // Unlabelled prose cannot change the enumeration or reference state.
  if (node.identifier || node.enumerated || IMPLICIT_TARGETS.has(node.type)) into.push(node)
  else for (const child of node.children ?? []) collectTargets(child, into)
}
