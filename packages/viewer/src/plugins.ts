/**
 * Viewer plugins (docs/ir.md section 8.2): a plugin extends the IR runtime
 * with new views and renderers. Its browser module default-exports a
 * `ViewerPlugin`; the renderer that hosts the viewer calls it once with this
 * context, so a plugin needs no import of its own to reach the registries.
 */
import { BlockView } from './block.ts'
import { registerAction, registerComponent, registerLayer, registerNodeRenderer, registerView } from './registry.ts'
import { SectionView } from './section.ts'
import { useViewer } from './viewer.ts'

export interface ViewerPluginContext {
  registerView: typeof registerView
  registerNodeRenderer: typeof registerNodeRenderer
  registerComponent: typeof registerComponent
  /** Named actions of the overlay views, run by keys (the present view, the presenter window). */
  registerAction: typeof registerAction
  /** Layers drawn over the overlay views, e.g. a black screen. */
  registerLayer: typeof registerLayer
  /** The viewer state (document, view, position), inside a component setup. */
  useViewer: typeof useViewer
  /** Building blocks for views: one section with its layout, one block at a step. */
  SectionView: typeof SectionView
  BlockView: typeof BlockView
}

export type ViewerPlugin = (context: ViewerPluginContext) => void

const context: ViewerPluginContext = { registerView, registerNodeRenderer, registerComponent, registerAction, registerLayer, useViewer, SectionView, BlockView }

/** Installs a viewer plugin; one that throws is reported and left out, and the other plugins still install. */
export function installViewerPlugin(plugin: unknown, name = 'viewer plugin'): boolean {
  if (typeof plugin !== 'function') {
    console.error(`[presmium] ${name}: the default export is not a function`)
    return false
  }
  try {
    (plugin as ViewerPlugin)(context)
    return true
  } catch (error) {
    console.error(`[presmium] ${name} failed`, error)
    return false
  }
}
