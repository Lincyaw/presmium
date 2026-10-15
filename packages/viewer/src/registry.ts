import type { Component } from 'vue'
import { markRaw, shallowReactive } from 'vue'
import type { Viewer } from './viewer.ts'

/**
 * A runtime view (docs/ir.md section 8.2). A `page` view renders the sections
 * of the current page in the page body; an `overlay` view covers the screen
 * and moves through the whole document.
 */
export interface ViewDefinition {
  id: string
  /** Name in the view menu; may be a getter, read each time the menu renders (e.g. translated). */
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

/**
 * A named action of the overlay views (K-15), run by its keys. The present
 * view and the presenter window take their keys from here, the built-in
 * navigation included, so a plugin can add actions (e.g. a black screen).
 */
export interface ViewerAction {
  id: string
  /** `KeyboardEvent.key` values that run it, without Ctrl, Alt or Meta. */
  keys: readonly string[]
  /** Runs the action; returning `false` leaves the key unhandled. */
  run(viewer: Viewer): boolean | void
  /** Views whose keys run it. Default: the present view and the presenter window. */
  views?: readonly string[]
}

/**
 * A layer drawn over an overlay view, e.g. a plugin's black screen. Its
 * component gets the prop `view`, the id of the view it is drawn over.
 */
export interface ViewerLayer {
  id: string
  component: Component
  /** Views it is drawn over. Default: the present view and the presenter window. */
  views?: readonly string[]
}

/** Views that actions and layers apply to when they name none. */
export const OVERLAY_VIEWS: readonly string[] = ['present', 'presenter']

const views = shallowReactive(new Map<string, ViewDefinition>())
const nodeRenderers = shallowReactive(new Map<string, NodeRenderer>())
const components = shallowReactive(new Map<string, Component>())
const actions = shallowReactive(new Map<string, ViewerAction>())
const layers = shallowReactive(new Map<string, ViewerLayer>())

/** Registers a view; a later registration with the same id replaces the earlier one. */
export function registerView(view: ViewDefinition): void {
  // A copy that keeps getters, such as a translated label.
  const definition = Object.defineProperties({}, Object.getOwnPropertyDescriptors(view)) as ViewDefinition
  definition.component = markRaw(view.component)
  views.set(view.id, definition)
}

export function registerNodeRenderer(key: string, renderer: NodeRenderer): void {
  nodeRenderers.set(key, markRaw(renderer))
}

/** Registers the Vue component that renders `component` nodes named `name`. */
export function registerComponent(name: string, component: Component): void {
  components.set(name, markRaw(component))
}

/** Registers an action; a later registration with the same id replaces the earlier one. */
export function registerAction(action: ViewerAction): void {
  actions.delete(action.id)
  actions.set(action.id, action)
}

/** Registers a layer; a later registration with the same id replaces the earlier one. */
export function registerLayer(layer: ViewerLayer): void {
  layers.set(layer.id, { ...layer, component: markRaw(layer.component) })
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

/** Actions of a view, the latest registered first, so a plugin's action wins a key over a built-in one. */
export function listActions(view: string): ViewerAction[] {
  return [...actions.values()].reverse().filter(action => (action.views ?? OVERLAY_VIEWS).includes(view))
}

/** Layers of a view, in registration order. */
export function listLayers(view: string): ViewerLayer[] {
  return [...layers.values()].filter(layer => (layer.views ?? OVERLAY_VIEWS).includes(view))
}
