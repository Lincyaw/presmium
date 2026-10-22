import type { BoundRendererExtension, ComponentNode } from './ir.ts'
import { withProp } from './props.ts'

/** The package of the web renderer when a document names none. */
export const WEB_RENDERER_PACKAGE = '@lincyaw/web'

/** Whether a renderer extension renders the component: one of its plugin, or of any plugin for a document's own component. */
export function hasRendererExtension(node: ComponentNode, extensions: readonly BoundRendererExtension[]): boolean {
  return extensions.some(e => (!node.plugin || e.plugin === node.plugin) && Boolean(e.components?.[node.name]))
}

/** The component with each prop that `assets` names set to the file's published URL; a file not published keeps its URL. */
export function withPublishedAssets(node: ComponentNode, publish: (url: string) => string | undefined): ComponentNode {
  if (!node.assets) return node
  let props = node.props
  for (const [path, url] of Object.entries(node.assets)) props = withProp(props, path, publish(url) ?? url)
  return { ...node, props }
}
