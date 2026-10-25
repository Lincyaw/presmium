import { createElement } from 'react'
import type { ReactNode } from 'react'
import { registerAction, registerView } from './registry.ts'
import { viewerMessages } from './viewer-messages.ts'
import { VIEWER } from './viewer-state.ts'
import type { Viewer } from './viewer-state.ts'
import { BUILTIN_ACTIONS } from './views/actions.ts'
import { DocumentView } from './views/document.ts'
import { PresentView } from './views/present.ts'
import { PresenterView } from './views/presenter.ts'
import { ScrollyView } from './views/scrolly.ts'
import './style.css'

registerView({ id: 'document', get label() { return viewerMessages().views.document }, kind: 'page', component: DocumentView })
registerView({ id: 'scrolly', get label() { return viewerMessages().views.scrolly }, kind: 'page', component: ScrollyView })
registerView({ id: 'present', get label() { return viewerMessages().views.present }, kind: 'overlay', component: PresentView })
registerView({ id: 'presenter', get label() { return viewerMessages().views.presenter }, kind: 'overlay', component: PresenterView, hidden: true })
BUILTIN_ACTIONS.forEach(registerAction)

export function ViewerProvider({ viewer, children }: { viewer: Viewer, children?: ReactNode }) { return createElement(VIEWER.Provider, { value: viewer }, children) }

export { BlockView, PmComponentFallback } from './block.ts'
export { syncViewerWithOperations } from './operations.ts'
export { findView, findComponent, listViews, registerComponent, registryRevision } from './registry.ts'
export type { NodeRenderer, ViewDefinition, ViewerAction, ViewerLayer } from './registry.ts'
export { SectionView } from './section.ts'
export type { SectionLayout } from './section.ts'
export { useSectionContext } from './section-context.ts'
export type { SectionContext } from './section-context.ts'
export { withSlideGlobals } from './slidev-compat/slide-globals.ts'
export { tryInstallViewerPlugin } from './viewer-plugins.ts'
export type { ViewerPlugin, ViewerPluginContext } from './viewer-plugins.ts'
export { createViewer, useViewer } from './viewer-state.ts'
export type { Viewer, ViewerOptions } from './viewer-state.ts'
export { OverlayViewOutlet, PageViewOutlet } from './views/outlets.ts'
export { SlideFace, SlideFit, SlidesPrint } from './views/slide.ts'

export { VClick, VAfter, VClicks } from "./slidev-compat/click-directives.ts"
