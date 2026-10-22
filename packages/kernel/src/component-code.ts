import type { CodeNode, ComponentNode } from './ir.ts'

/** The code block among a component's child blocks, e.g. the code of a run panel. */
export function componentCode(node: ComponentNode): CodeNode | undefined {
  return node.children?.map(block => block.node).find((child): child is CodeNode => child.type === 'code')
}
