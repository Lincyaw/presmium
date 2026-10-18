/**
 * The workspace's domain (docs/domain-model.md section 14): the answers of
 * its routes, members' rights, merges, paths and commit trailers, shared by
 * its browser plugin and its Node side.
 *
 * @experimental The workbench's browser side, outside the 1.x semver promise (docs/api.md section 3).
 */
export { WORKSPACE_FILE, WORKSPACE_ID } from './api.ts'
export type { ChangesAnswer, CommitAnswer, ConflictAnswer, DocumentOperation, DocumentsAnswer, FilesAnswer, HistoryRevision, OperationAnswer, RevertAnswer, RevisionsAnswer, SavedAnswer, SourceAnswer, SourceFile, UncommittedFile, UncommittedKind, WorkspaceDocument } from './api.ts'
export { mayEdit } from './members.ts'
export { mergeTexts } from './merge.ts'
export type { Merged, MergeLabels } from './merge.ts'
export { WORKSPACE_MESSAGES } from './messages.ts'
export type { WorkspaceMessages } from './messages.ts'
export { invalidDocumentDir, matchesPattern, movedUrl, rewriteLinks } from './paths.ts'
export { commitMessage, originOf, trailers } from './revisions.ts'
export type { CommitOrigin, RevisionOperation } from './revisions.ts'
