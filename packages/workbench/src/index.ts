/**
 * Presmium's workbench panels (docs/design-dsh.md 7.1 and 7.3), in React and bound
 * to no host: they know nothing of DeepSeek Harness, Vue or `@presmium/host`. A
 * layout gives them one `Workbench` (the state, the workspace service's client, the
 * preview protocol's workbench side) through `WorkbenchProvider` and places them;
 * `@presmium/dsh` places them in its root layout and, as a fallback, in DeepSeek
 * Harness's own layout. Each panel is described (`PANELS`): its title, its icon,
 * its component.
 */
import type { IconName } from '@presmium/design'
import type { ComponentType } from 'react'
import type { WorkbenchMessages } from './messages.ts'
import { DocumentView } from './panels/DocumentView.tsx'
import { FilesPanel } from './panels/Files.tsx'
import { HomePanel } from './panels/Home.tsx'
import { PreviewPanel } from './panels/Preview.tsx'
import { ProblemsPanel } from './panels/Problems.tsx'
import { SourcePanel } from './panels/Source.tsx'

export type * from './api.ts'
export * from './components.tsx'
export { createEditor } from './editor.ts'
export type { EditorOptions, Problem, SourceEditor } from './editor.ts'
export { mergeTexts } from './merge.ts'
export type { MergeLabels, Merged } from './merge.ts'
export { MESSAGES } from './messages.ts'
export type { WorkbenchMessages } from './messages.ts'
export { placeAt, placeOf } from './places.ts'
export type { Place } from './places.ts'
export { connectPreview } from './preview.ts'
export type { PreviewConnection, PreviewHandlers } from './preview.ts'
export { useMessages, useWorkbench, useWorkbenchStore, WorkbenchProvider } from './react.tsx'
export { ServiceError, workspaceClient } from './service.ts'
export type { WorkspaceClient } from './service.ts'
export { localeOf, Workbench } from './store.ts'
export type { EditorBridge, FileNotice, Locale, OpenFile, PageIssue, PreviewSink, PreviewView, Reveal, WorkbenchState } from './store.ts'
export { StatusItems } from './panels/Status.tsx'
export { DocumentView, FilesPanel, HomePanel, PreviewPanel, ProblemsPanel, SourcePanel }

/** A panel as a layout places it. */
export interface PanelDescriptor {
  id: string
  icon: IconName
  title(t: WorkbenchMessages): string
  Component: ComponentType
}

/** The panels of the workbench's shell (WP-96d); the AI's, the review's, the history's and the lecture's come with WP-96e. */
export const PANELS = {
  documents: { id: 'documents', icon: 'document', title: t => t.documents, Component: HomePanel },
  files: { id: 'files', icon: 'folder', title: t => t.files, Component: FilesPanel },
  source: { id: 'source', icon: 'edit', title: t => t.source, Component: SourcePanel },
  problems: { id: 'problems', icon: 'warning', title: t => t.problems, Component: ProblemsPanel },
  preview: { id: 'preview', icon: 'slides', title: t => t.preview, Component: PreviewPanel },
} satisfies Record<string, PanelDescriptor>
