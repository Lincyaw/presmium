import type { MdastNode } from '@lincyaw/kernel'
import type { Element, ElementContent, Properties } from 'hast'

export function element(tagName: string, properties: Properties, children: ElementContent[] = []): Element {
  return { type: 'element', tagName, properties, children }
}

export function text(value: string): ElementContent {
  return { type: 'text', value }
}

/** The classes a MyST node names in its `class` option. */
export function classes(node: MdastNode): string[] {
  return typeof node.class === 'string' ? node.class.split(/\s+/).filter(Boolean) : []
}

export function classed(node: MdastNode, properties: Properties = {}): Properties {
  const names = classes(node)
  return names.length ? { ...properties, className: names } : properties
}
