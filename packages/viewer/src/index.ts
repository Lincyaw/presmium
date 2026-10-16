/**
 * @presmium/viewer: the IR runtime (docs/ir.md section 8). Renders IR
 * documents in the browser with Vue, in pluggable runtime views, and applies
 * live updates without reloading the page.
 */
import type { App } from 'vue'
import { installClicks } from './clicks.ts'
import { installSlideGlobals } from './globals.ts'
import { messages } from './i18n.ts'
import { BUILTIN_ACTIONS, PresenterView, PresentView } from './present.ts'
import { registerAction, registerView } from './registry.ts'
import { provideViewer } from './viewer.ts'
import type { Viewer } from './viewer.ts'
import { DocumentView, ScrollyView } from './views.ts'
import './style.css'

registerView({ id: 'document', get label() { return messages().views.document }, kind: 'page', component: DocumentView })
registerView({ id: 'scrolly', get label() { return messages().views.scrolly }, kind: 'page', component: ScrollyView })
registerView({ id: 'present', get label() { return messages().views.present }, kind: 'overlay', component: PresentView })
registerView({ id: 'presenter', get label() { return messages().views.presenter }, kind: 'overlay', component: PresenterView, hidden: true })
BUILTIN_ACTIONS.forEach(registerAction)

/** Installs the viewer in an app: its state, the `v-click` compatibility layer and Slidev's template globals. */
export function installViewer(app: App, viewer: Viewer): void {
  provideViewer(app, viewer)
  installClicks(app)
  installSlideGlobals(app, viewer)
}

export { BlockView, PmComponentFallback } from './block.ts'
export { CodeView } from './code.ts'
export { SECTION_CONTEXT, useSectionContext } from './context.ts'
export type { SectionContext } from './context.ts'
export * from './domain/index.ts'
export { sectionFrontmatter, withSlideGlobals } from './globals.ts'
export { messages } from './i18n.ts'
export { MarkdownView } from './markdown.ts'
export { followOperations } from './operations.ts'
export { installViewerPlugin } from './plugins.ts'
export type { ViewerPlugin, ViewerPluginContext } from './plugins.ts'
export { BUILTIN_ACTIONS, PresenterView, PresentView } from './present.ts'
export {
  getComponent,
  getNodeRenderer,
  getView,
  listActions,
  listLayers,
  listViews,
  registerAction,
  registerComponent,
  registerLayer,
  registerNodeRenderer,
  registerView,
} from './registry.ts'
export type { NodeRenderer, ViewDefinition, ViewerAction, ViewerLayer } from './registry.ts'
export { PmMath, PmMermaid, PmRoleMark } from './rich.ts'
export { SectionView, STEP_LINE } from './section.ts'
export type { SectionLayout } from './section.ts'
export { createViewer, useViewer, VIEWER } from './viewer.ts'
export type { Viewer, ViewerOptions } from './viewer.ts'
export { DocumentView, OverlayHost, ScrollyView, ViewHost } from './views.ts'
