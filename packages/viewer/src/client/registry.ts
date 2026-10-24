import type { Component } from 'vue'
import { markRaw, shallowReactive } from 'vue'
import type { Viewer } from './viewer-state.ts'

export interface ViewDefinition {
  id: string
  label: string
  kind: 'page' | 'overlay'
  component: Component
  hidden?: boolean
}

export type NodeRenderer = Component

export interface ViewerAction {
  id: string
  keys: readonly string[]
  run(viewer: Viewer): boolean | void
  views?: readonly string[]
}

/**
 * A plugin's layer of the overlay views: over the whole viewport, over the view, on each slide (its props also give the
 * slide's `section` and `step`, on the canvas's coordinates), or in the view's bar (a control).
 */
export interface ViewerLayer {
  id: string
  component: Component
  views?: readonly string[]
  scope?: 'view' | 'viewport' | 'slide' | 'bar'
}

const OVERLAY_VIEWS: readonly string[] = ['present', 'presenter']

const views = shallowReactive(new Map<string, ViewDefinition>())
const nodeRenderers = shallowReactive(new Map<string, NodeRenderer>())
const components = shallowReactive(new Map<string, Component>())
const actions = shallowReactive(new Map<string, ViewerAction>())
const layers = shallowReactive(new Map<string, ViewerLayer>())

export function registerView(view: ViewDefinition): void {
  const definition = Object.defineProperties({}, Object.getOwnPropertyDescriptors(view)) as ViewDefinition
  definition.component = markRaw(view.component)
  views.set(view.id, definition)
}

export function registerNodeRenderer(key: string, renderer: NodeRenderer): void {
  nodeRenderers.set(key, markRaw(renderer))
}

export function registerComponent(name: string, component: Component): void {
  components.set(name, markRaw(component))
}

export function registerAction(action: ViewerAction): void {
  actions.delete(action.id)
  actions.set(action.id, action)
}

export function registerLayer(layer: ViewerLayer): void {
  layers.set(layer.id, { ...layer, component: markRaw(layer.component) })
}

export function findView(id: string): ViewDefinition | undefined {
  return views.get(id)
}

export function listViews(): ViewDefinition[] {
  return [...views.values()]
}

export function findNodeRenderer(key: string): NodeRenderer | undefined {
  return nodeRenderers.get(key)
}

export function findComponent(name: string): Component | undefined {
  return components.get(name)
}

export function listActions(view: string): ViewerAction[] {
  return [...actions.values()].reverse().filter(action => (action.views ?? OVERLAY_VIEWS).includes(view))
}

export function listLayers(view: string): ViewerLayer[] {
  return [...layers.values()].filter(layer => (layer.views ?? OVERLAY_VIEWS).includes(view))
}
