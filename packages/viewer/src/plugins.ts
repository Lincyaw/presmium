import { errorMessage } from '@lincyaw/kernel'
import { BlockView } from './block.ts'
import { registerAction, registerComponent, registerLayer, registerNodeRenderer, registerView } from './registry.ts'
import { SectionView } from './section.ts'
import { useViewer } from './viewer.ts'

export interface ViewerPluginContext {
  registerView: typeof registerView
  registerNodeRenderer: typeof registerNodeRenderer
  registerComponent: typeof registerComponent
  registerAction: typeof registerAction
  registerLayer: typeof registerLayer
  useViewer: typeof useViewer
  SectionView: typeof SectionView
  BlockView: typeof BlockView
}

export type ViewerPlugin = (context: ViewerPluginContext) => void

const context: ViewerPluginContext = { registerView, registerNodeRenderer, registerComponent, registerAction, registerLayer, useViewer, SectionView, BlockView }

export function installViewerPlugin(plugin: unknown, name = 'viewer plugin'): string | undefined {
  if (typeof plugin !== 'function') {
    console.error(`[presmium] ${name}: the default export is not a function`)
    return 'the default export is not a function'
  }
  try {
    (plugin as ViewerPlugin)(context)
    return undefined
  } catch (error) {
    console.error(`[presmium] ${name} failed`, error)
    return errorMessage(error)
  }
}
