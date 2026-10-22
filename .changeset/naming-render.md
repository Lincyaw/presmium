---
'@lincyaw/kernel': patch
'@lincyaw/viewer': patch
'@lincyaw/web': patch
'@lincyaw/render-slides': patch
'@lincyaw/render-notebook': patch
'@lincyaw/language-server': patch
---

Name the renderers' and the IR runtime's public API after what each name does. Old name to new name:

- `@lincyaw/viewer`: `followOperations` to `syncViewerWithOperations`; `installViewerPlugin` to `tryInstallViewerPlugin`; `ViewHost` and `OverlayHost` to `PageViewOutlet` and `OverlayViewOutlet`; `getView` to `findView`. The entry is now `src/client/index.ts`, and it no longer re-exports the domain (import those names from `@lincyaw/viewer/domain`), nor `CodeView`, `MarkdownView`, `DocumentView`, `ScrollyView`, `PresentView`, `PresenterView`, `BUILTIN_ACTIONS`, `PmMath`, `PmMermaid`, `PmRoleMark`, `messages`, `VIEWER`, `SECTION_CONTEXT`, `STEP_LINE`, `sectionFrontmatter`, `getComponent`, `getNodeRenderer`, `listActions`, `listLayers`, `registerAction`, `registerLayer`, `registerNodeRenderer` and `registerView`; a viewer plugin gets the registration functions from its context as before.
- `@lincyaw/viewer/domain`: `originParts` to `originBar`; the texts of `outputNotes` move from `ORIGIN_MESSAGES` to the new `OUTPUT_MESSAGES` (`OutputMessages`).
- `@lincyaw/web/domain`: `formOptions` and `FormOptions` to `crossFormLinks` and `CrossFormLinks`; `webUrl`, `slideUrl`, `viewSearch` and `requested` (`Requested`) to `webPositionUrl`, `slidesPositionUrl`, `withPositionQuery` and `parsePositionQuery` (`PositionQuery`); `toPages` to `webPages`. New: `UPDATE_EVENT`, `DevUpdateEvent`, `HomeDocument`.
- `@lincyaw/web/client`: `createViewerHost` and `ViewerHostOptions` to `createWebHostAdapter` and `WebHostAdapterOptions`; `ThemeInput.revision` to `irRevision`, and `ThemeInput.preview` is the preview's `{ active, connect }`.
- `@lincyaw/language-server/protocol`: `SectionAt` to `SectionLocation`. `@lincyaw/language-server/domain`: `sectionAt` and `blockAt` to `findSectionAtLine` and `findBlockAtLine`; `DirectiveInfo`, `OptionInfo` and `directiveInfos` to `DirectiveHelp`, `OptionHelp` and `directiveHelps`.
- `@lincyaw/kernel`: new `isButton`, `hasRendererExtension`, `withPublishedAssets`, `WEB_RENDERER_PACKAGE`, `isProseRun`, `htmlAsText` and `safeDecodeURIComponent`; `@lincyaw/kernel/node`: new `findInstalledPackage`.
- `@lincyaw/render-slides` and `@lincyaw/render-notebook`: internal names only; the slides' base style is now `src/node/deck-base.css`.
