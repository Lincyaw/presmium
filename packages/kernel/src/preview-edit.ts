import { irBlocks } from './blocks.ts'
import { fnv1a64 } from './fingerprint.ts'
import type { IRDocument } from './ir.ts'
import type { PreviewAnchor } from './contracts/preview.ts'

/** A native text draft follows its IR target, independently from unrelated source-line shifts. */
export function previewEditBinding(doc: IRDocument, target: PreviewAnchor): string | undefined {
  const section = doc.sections.find(section => section.id === target.section)
  if (!section) return undefined
  if (!target.block) return fnv1a64(JSON.stringify({
    section: section.id, file: section.source.file, title: section.title,
    depth: section.depth, audience: section.audience,
  }))
  const block = [...irBlocks(section.blocks)].find(block => block.id === target.block)
  if (!block || block.node.type !== 'markdown') return undefined
  const { source, ...meaning } = block
  return fnv1a64(JSON.stringify([section.id, source.file, meaning], (key, value) => key === 'position' ? undefined : value))
}
