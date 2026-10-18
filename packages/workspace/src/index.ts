/**
 * @presmium/workspace: the workspace service `presmium serve` and workspace
 * builds (docs/architecture.md section 10, docs/domain-model.md section 14),
 * and edit mode for the deck of `presmium dev`. Node only; the browser
 * plugin is `./client`.
 */
export { buildWorkspace } from './node/build.ts'
export type { WorkspaceBuild } from './node/build.ts'
export { isWorkspaceRoot, listDocuments, readWorkspace } from './node/config.ts'
export type { FoundDocument, WorkspaceConfig } from './node/config.ts'
export { deckEditing } from './node/dev.ts'
export type { DeckEditing } from './node/dev.ts'
export { serveWorkspace } from './node/serve.ts'
export type { ServeOptions, WorkspaceServer } from './node/serve.ts'
