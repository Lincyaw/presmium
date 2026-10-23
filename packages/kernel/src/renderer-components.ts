import type { BoundRendererExtension, ComponentNode, IRBlock } from './ir.ts'
import { withProp } from './props.ts'

/** The package of the web renderer when a document names none. */
export const WEB_RENDERER_PACKAGE = '@lincyaw/web'

/** The renderer extension's renderer of the component: its own plugin's first, or any plugin's for a document's own component. */
export function findComponentRenderer(node: ComponentNode, extensions: readonly BoundRendererExtension[]): ((node: ComponentNode, block: IRBlock) => unknown) | undefined {
  const owner = extensions.find(e => e.plugin === node.plugin && e.components?.[node.name])
    ?? (node.plugin ? undefined : extensions.find(e => e.components?.[node.name]))
  return owner?.components?.[node.name]
}

/** What a renderer gives the component: its props, and the node's `durations` as the prop `durations`, kept once in the IR. */
export function componentProps(node: ComponentNode): Record<string, unknown> {
  return node.durations ? { ...node.props, durations: node.durations } : node.props
}

/** Whether a renderer extension renders the component (`findComponentRenderer` finds one). */
export function hasRendererExtension(node: ComponentNode, extensions: readonly BoundRendererExtension[]): boolean {
  return findComponentRenderer(node, extensions) !== undefined
}

/** The component with each prop that `assets` names set to the file's published URL; a file not published keeps its URL. */
export function withPublishedAssets(node: ComponentNode, publish: (url: string) => string | undefined): ComponentNode {
  if (!node.assets) return node
  let props = node.props
  for (const [path, url] of Object.entries(node.assets)) props = withProp(props, path, publish(url) ?? url)
  return { ...node, props }
}
