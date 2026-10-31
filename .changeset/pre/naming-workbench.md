---
'@lincyaw/workbench': patch
'@lincyaw/dsh': patch
'@lincyaw/studio': patch
'@lincyaw/design': patch
---

Name the workbench's public API after what each name does, and start the workspace server the same way in the bundle and in studio. Old name to new name:

- `@lincyaw/workbench`:
  - components: `DocumentView` to `DocumentEditor`, `WorkbenchCommands` to `QuickOpen`; `WorkbenchProvider`'s prop `protectChanges` to `isPrimary`.
  - hooks: `useWorkbench(select)` to `useWorkbenchState(select)`, `useWorkbenchStore()` to `useWorkbench()`.
  - `ServiceError` to `WorkspaceServerError`; `placeAt`, `placeOf` and `Place` to `findPlaceAtLine`, `findPlaceSource` and `PlaceWithSource`.
  - `WorkspaceClient`'s methods: `documents`, `operate`, `files`, `source`, `save`, `ir`, `events`, `diagnostics`, `diagnosticEvents`, `preview`, `workbench`, `review`, `accept`, `reject`, `restore`, `changes`, `commit`, `discard`, `revisions` and `revert` to `readDocuments`, `operateDocument`, `readFiles`, `readSource`, `saveSource`, `readIr`, `subscribeIr`, `readDiagnostics`, `subscribeDiagnostics`, `readPreview`, `readWorkbenchInfo` (read once), `subscribeReview`, `acceptReview`, `rejectReview`, `restoreReview`, `readChanges`, `commitChanges`, `discardChanges`, `readRevisions` and `revertRevision`; `focus(document, focus?)` is `readFocus(document)` and `writeFocus(document, focus)`.
  - `Workbench`'s methods: `operate`, `revert`, `edited`, `moved`, `selectSource`, `setView`, `previewReport` and `subscribeCommands` to `operateDocument`, `revertRevision`, `recordEdit`, `syncCursorLine`, `focusSourceSelection`, `setPreviewRenderer`, `handlePreviewReport` and `subscribePreviewShortcuts`; `openSource(document, path, at)` to `openWorkspaceFile(path, { document, ...at })`, where no `document` keeps the selected lecture.
  - `WorkbenchState`'s fields: `dark`, `failure`, `noRoutes`, `open`, `active`, `line`, `view`, `shown`, `diagnosticsUnavailable`, `diagnosticsRepairing`, `picking`, `focusPending`, `leaving`, `leaveSaving`, `leaveFailed`, `changed` and `history` to `isDark`, `documentsFailure`, `isBundleDisabled`, `openFiles`, `activeFile`, `cursorLine`, `previewRenderer`, `previewIrRevision`, `isDiagnosticsUnavailable`, `isRepairingDiagnostics`, `isPicking`, `isFocusPending`, `unsavedOnLeave`, `isSavingOnLeave`, `hasSaveOnLeaveFailed`, `uncommitted` and `revisions`; `OpenFile.dirty` to `isDirty`; `Reveal.mark` and `seq` to `highlight` and `sequence`; the constructor's option `dark` to `isDark`.
  - `EditorOptions`' `save`, `changed`, `moved` and `selected` to `onSave`, `onChange`, `onCursorLine` and `onSelect`; `SourceEditor.problems` to `setProblems`.
  - New: `WORKSPACE_SCOPE`, `isWorkspaceRootOpen`, `selectedDocument`, `DocumentPane`. `Locale` and `localeOf` are exported from the messages.
  - No longer exported: the workspace server's wire types (import them from `@lincyaw/kernel`), `PANELS`, `PanelDescriptor`, `PageIssue`, `PreviewRenderer` (in `@lincyaw/kernel`), and the unused React `PmSegmented`, `PmTabs`, `PmPopover`, `PmDrawer` and `Choice`.
- `@lincyaw/dsh`:
  - `@lincyaw/dsh/launch` adds `launchNode`, `launchWorkspaceServer`, `isLauncherVariable`, `inheritedEnv`, `workspaceServerEnv`, `SERVE_READY` and `WORKSPACE_READY`; it no longer exports `dshVersion`, `WATCHDOG`, `PACKAGE_DIR`, `PACKAGE_NAME`, `backgroundPriority`, `NODE_RESOURCE_ARGS` and `resourceEnvironment`.
  - The `presmium serve` the `presmium-service` row starts itself no longer inherits `PRESMIUM_MODEL_*`, `PRESMIUM_SERVICE_*`, `PRESMIUM_WORKSPACE` and `PORT`, as the one studio starts.
  - The rows' entry files moved from `rows/` to `entries/`; the package's exports are unchanged.
- `@lincyaw/studio`: `Studio.service` to `workspaceServerUrl`, `StudioOptions.host` to `listenAddress`; the package exports only `main` and `MainOptions`.
- `@lincyaw/design`: `FONTS` and `Shape` are no longer exported.
