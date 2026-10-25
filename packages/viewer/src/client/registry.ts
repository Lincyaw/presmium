import type { ComponentType } from 'react'
import { createStore } from '@lincyaw/host'
import type { Viewer } from './viewer-state.ts'
export interface ViewDefinition { id: string, label: string, kind: 'page' | 'overlay', component: ComponentType<any>, hidden?: boolean }
export type NodeRenderer = ComponentType<any>
export interface ViewerAction { id: string, keys: readonly string[], run(viewer: Viewer): boolean | void, views?: readonly string[] }
export interface ViewerLayer { id: string, component: ComponentType<any>, views?: readonly string[], scope?: 'view' | 'viewport' | 'slide' | 'bar' }
const views = new Map<string, ViewDefinition>(), nodeRenderers = new Map<string, NodeRenderer>(), components = new Map<string, ComponentType<any>>(), actions = new Map<string, ViewerAction>(), layerMap = new Map<string, ViewerLayer>()
export const registryRevision = createStore(0)
const changed = () => registryRevision.set(n => n + 1)
export function registerView(value: ViewDefinition) { views.set(value.id, value); changed() }
export function registerNodeRenderer(key: string, value: NodeRenderer) { nodeRenderers.set(key, value); changed() }
export function registerComponent(key: string, value: ComponentType<any>) { components.set(key, value); changed() }
export function registerAction(value: ViewerAction) { actions.set(value.id, value); changed() }
export function registerLayer(value: ViewerLayer) { layerMap.set(value.id, value); changed() }
export const findView = (id: string) => views.get(id)
export const listViews = () => [...views.values()]
export const findNodeRenderer = (id: string) => nodeRenderers.get(id)
export const findComponent = (id: string) => components.get(id)
export const listActions = (view: string) => [...actions.values()].filter(item => !item.views || item.views.includes(view))
export const listLayers = (view: string) => [...layerMap.values()].filter(item => !item.views || item.views.includes(view))
