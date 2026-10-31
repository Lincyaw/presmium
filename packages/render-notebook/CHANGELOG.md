# @lincyaw/render-notebook

## 1.0.0-rc.3

No changes in this release.

## 1.0.0-rc.2

No changes in this release.

## 1.0.0-rc.1

### Patch Changes

- 9957f42: Render canonical columns, tabs and stacks through shared runtime components. Preserve authored column proportions, step-dependent child visibility and tab state; stack columns on narrow screens and retain every titled child in notebook output.
- 7ac550a: Name the kernel's, the compiler's and the host's public API after what each name does. Old name to new name:
  
  - `@lincyaw/kernel`: `json`, `problem` and `eventStream` to `jsonResponse`, `problemResponse` and `sseResponse`; `prefixed` to `prefixedLogger`; `Role` to `ParticipantRole`; `RendererExtension` (the extension bound to a render context) to `BoundRendererExtension`; `startPreviewAgent` and `PreviewAgent` to `connectPreviewFrame` and `PreviewFrame`; `previewActive` to `isPreviewActive`; `readPreviewCommand` and `readPreviewReport` to `toPreviewCommand` and `toPreviewReport`. New: `isRenderable`, `environmentExecutor`, `propText`, `ABSOLUTE_URL`, `NON_FILE_URL`, `urlSlug`, `OFFLINE_REQUESTS`, `PreviewProblem`, and, moved from `@lincyaw/viewer`, `FollowAnchor`, `backSection` and `followedPlace`. The workspace service's wire types (`DocumentsAnswer`, `FilesAnswer`, `IrAnswer`, `ReviewSnapshot` and the others, experimental) and `DocumentSummary` are now kernel contracts. `@lincyaw/kernel/contracts` exports only types, service tokens and the preview protocol's parsers; `localeOf`, `deckLocale` and `stepStateAt` are in `@lincyaw/kernel`. No longer exported: `GIT_SAFE_CONFIG`, `HOST_OWNER`, `normalizeWhitespace`.
  - `@lincyaw/kernel/node`: `optimizeDeps` to `linkBrowserDependencies`; `preBundle` is removed. New: `isInside`, `lanAddresses`, `bracketIPv6`.
  - `@lincyaw/compiler`: `buildView` to `buildToDist` (it takes `{ to }`; build into another directory with `build`); `lineOf` to `lineContaining`; `readFrontmatter` to `parseFrontmatter`; `inside` to `isInside` in `@lincyaw/kernel/node`; `Compilation.files`, `dependencies` (`{ files, revisions }`), `runs`, `frontmatter`, `forAudience` and `audienceOf` to `sourceFiles`, `inputs` (`{ files, gitReads }`), `runStats`, `headmatter`, `audienceDocument` and `audienceCompilation`. New types: `DevOptions`, `DevServers`, `GitRead`. No longer exported: `audienceView`, `operatorPlugins`.
  - `@lincyaw/host`: `stopPresmium` to `stopHost`; `useTheme` and `Theme` to `useAppearance` and `Appearance`; `ToolbarPlace`, `useToolbarPlace` and `provideToolbarPlace` to `ToolbarPlacement`, `useToolbarPlacement` and `provideToolbarPlacement`, and `PmToolbar`'s prop `place` to `placement`. No longer exported: `startPresmium`, `stopPresmiumOnPageHide`, `StartOptions`, `createOperations`, `createStatusRegistry`, `createPresenterPanels`, `createToolbar`, `deckChannel`, `positionSlide`.
  - `@lincyaw/server`: `networkAddresses` to the kernel's `lanAddresses`; `HostDocument` to the kernel's `DocumentSummary`; `json` and `problem` are no longer re-exported.
  - `@lincyaw/mcp`: `McpDocument` to the kernel's `DocumentSummary`.
  - `@lincyaw/viewer`: `FollowAnchor`, `backSection`, `followedPlace`, `stepKeys`, `stepTrail`, `trailStep` and `StepKeys` are imported from `@lincyaw/kernel`.
  - `@lincyaw/workbench`: `PreviewView`, `WorkspaceDocument`, `RevertAnswer`, `ReviewView` and `ReviewFollowed` to `PreviewRenderer`, `DocumentSummary`, `RevertResult`, `ReviewSnapshot` and `ReviewUpdate`.
  - `@lincyaw/addon-publish`: `OFFLINE_MESSAGES` to the kernel's `OFFLINE_REQUESTS`.
- 831ad4b: Name the renderers' and the IR runtime's public API after what each name does. Old name to new name:
  
  - `@lincyaw/viewer`: `followOperations` to `syncViewerWithOperations`; `installViewerPlugin` to `tryInstallViewerPlugin`; `ViewHost` and `OverlayHost` to `PageViewOutlet` and `OverlayViewOutlet`; `getView` to `findView`. The entry is now `src/client/index.ts`, and it no longer re-exports the domain (import those names from `@lincyaw/viewer/domain`), nor `CodeView`, `MarkdownView`, `DocumentView`, `ScrollyView`, `PresentView`, `PresenterView`, `BUILTIN_ACTIONS`, `PmMath`, `PmMermaid`, `PmRoleMark`, `messages`, `VIEWER`, `SECTION_CONTEXT`, `STEP_LINE`, `sectionFrontmatter`, `getComponent`, `getNodeRenderer`, `listActions`, `listLayers`, `registerAction`, `registerLayer`, `registerNodeRenderer` and `registerView`; a viewer plugin gets the registration functions from its context as before.
  - `@lincyaw/viewer/domain`: `originParts` to `originBar`; the texts of `outputNotes` move from `ORIGIN_MESSAGES` to the new `OUTPUT_MESSAGES` (`OutputMessages`).
  - `@lincyaw/web/domain`: `formOptions` and `FormOptions` to `crossFormLinks` and `CrossFormLinks`; `webUrl`, `slideUrl`, `viewSearch` and `requested` (`Requested`) to `webPositionUrl`, `slidesPositionUrl`, `withPositionQuery` and `parsePositionQuery` (`PositionQuery`); `toPages` to `webPages`. New: `UPDATE_EVENT`, `DevUpdateEvent`, `HomeDocument`.
  - `@lincyaw/web/client`: `createViewerHost` and `ViewerHostOptions` to `createWebHostAdapter` and `WebHostAdapterOptions`; `ThemeInput.revision` to `irRevision`, and `ThemeInput.preview` is the preview's `{ active, connect }`.
  - `@lincyaw/language-server/protocol`: `SectionAt` to `SectionLocation`. `@lincyaw/language-server/domain`: `sectionAt` and `blockAt` to `findSectionAtLine` and `findBlockAtLine`; `DirectiveInfo`, `OptionInfo` and `directiveInfos` to `DirectiveHelp`, `OptionHelp` and `directiveHelps`.
  - `@lincyaw/kernel`: new `isButton`, `hasRendererExtension`, `withPublishedAssets`, `WEB_RENDERER_PACKAGE`, `isProseRun`, `htmlAsText` and `safeDecodeURIComponent`; `@lincyaw/kernel/node`: new `findInstalledPackage`.
  - `@lincyaw/render-slides` and `@lincyaw/render-notebook`: internal names only; the slides' base style is now `src/node/deck-base.css`.
- 813302d: 按规范化章节标识递增 notebook 单元格编号，避免逐个单元格重新扫描已有编号。保留清洗、截断与同名章节的原有 ID 和完整导出内容。
