import type { Component } from 'vue'
import { markRaw, shallowReactive } from 'vue'

/**
 * A runtime view (docs/ir.md section 8.2). A `page` view renders the sections
 * of the current page in the page body; an `overlay` view covers the screen
 * and moves through the whole document.
 */
export interface ViewDefinition {
  id: string
  /** Name in the view menu. */
  label: string
  kind: 'page' | 'overlay'
  /** Page views get the prop `sections` (the page's sections); overlay views get none. */
  component: Component
  /** Left out of the view menu, e.g. the presenter window. */
  hidden?: boolean
}

/**
 * Renders one kind of block. Keys: a node type (`markdown`, `code`,
 * `component`), `code:<lang>`, or a component name. The renderer gets the
 * props `block`, `section` and `step`.
 */
export type NodeRenderer = Component

const views = shallowReactive(new Map<string, ViewDefinition>())
const nodeRenderers = shallowReactive(new Map<string, NodeRenderer>())
const components = shallowReactive(new Map<string, Component>())

/** Registers a view; a later registration with the same id replaces the earlier one. */
export function registerView(view: ViewDefinition): void {
  views.set(view.id, { ...view, component: markRaw(view.component) })
}

export function registerNodeRenderer(key: string, renderer: NodeRenderer): void {
  nodeRenderers.set(key, markRaw(renderer))
}

/** Registers the Vue component that renders `component` nodes named `name`. */
export function registerComponent(name: string, component: Component): void {
  components.set(name, markRaw(component))
}

export function getView(id: string): ViewDefinition | undefined {
  return views.get(id)
}

/** Registered views, in registration order. */
export function listViews(): ViewDefinition[] {
  return [...views.values()]
}

export function getNodeRenderer(key: string): NodeRenderer | undefined {
  return nodeRenderers.get(key)
}

export function getComponent(name: string): Component | undefined {
  return components.get(name)
}
