# @lincyaw/language-server

## 1.0.0-rc.8

### Patch Changes

- Updated dependencies [6b33a28]
  - @lincyaw/web@1.0.0-rc.8
  - @lincyaw/cli@1.0.0-rc.8
  - @lincyaw/compiler@1.0.0-rc.8
  - @lincyaw/host@1.0.0-rc.8
  - @lincyaw/kernel@1.0.0-rc.8
  - @lincyaw/viewer@1.0.0-rc.8

## 1.0.0-rc.7

### Patch Changes

- @lincyaw/host@1.0.0-rc.7
  - @lincyaw/web@1.0.0-rc.7
  - @lincyaw/viewer@1.0.0-rc.7
  - @lincyaw/cli@1.0.0-rc.7
  - @lincyaw/compiler@1.0.0-rc.7
  - @lincyaw/kernel@1.0.0-rc.7

## 1.0.0-rc.6

### Patch Changes

- @lincyaw/cli@1.0.0-rc.6
  - @lincyaw/web@1.0.0-rc.6
  - @lincyaw/compiler@1.0.0-rc.6
  - @lincyaw/host@1.0.0-rc.6
  - @lincyaw/kernel@1.0.0-rc.6
  - @lincyaw/viewer@1.0.0-rc.6

## 1.0.0-rc.5

### Patch Changes

- Updated dependencies [e1fcfaf]
  - @lincyaw/kernel@1.0.0-rc.5
  - @lincyaw/host@1.0.0-rc.5
  - @lincyaw/web@1.0.0-rc.5
  - @lincyaw/cli@1.0.0-rc.5
  - @lincyaw/compiler@1.0.0-rc.5
  - @lincyaw/viewer@1.0.0-rc.5

## 1.0.0-rc.4

### Patch Changes

- @lincyaw/cli@1.0.0-rc.4
  - @lincyaw/compiler@1.0.0-rc.4
  - @lincyaw/host@1.0.0-rc.4
  - @lincyaw/kernel@1.0.0-rc.4
  - @lincyaw/viewer@1.0.0-rc.4
  - @lincyaw/web@1.0.0-rc.4

## 1.0.0-rc.3

### Patch Changes

- Updated dependencies [f3b035a]
  - @lincyaw/web@1.0.0-rc.3
  - @lincyaw/cli@1.0.0-rc.3
  - @lincyaw/compiler@1.0.0-rc.3
  - @lincyaw/host@1.0.0-rc.3
  - @lincyaw/kernel@1.0.0-rc.3
  - @lincyaw/viewer@1.0.0-rc.3

## 1.0.0-rc.2

### Patch Changes

- Updated dependencies [21189ed]
  - @lincyaw/web@1.0.0-rc.2
  - @lincyaw/cli@1.0.0-rc.2
  - @lincyaw/compiler@1.0.0-rc.2
  - @lincyaw/host@1.0.0-rc.2
  - @lincyaw/kernel@1.0.0-rc.2
  - @lincyaw/viewer@1.0.0-rc.2

## 1.0.0-rc.1

### Minor Changes

- c0024b1: Integrate canonical lecture.json authoring with shared validation, stable entity navigation, code anchor definitions and page-aware preview synchronization. Preserve JSON pointers in code diagnostics and bundle the public document schema with the VS Code extension.

### Patch Changes

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
- 34e51cb: 修复保留修改时间的文件替换和编译期间编辑导致的缓存过期问题，共用完整本机文件版本标识。各文稿的离线缓存独立更新，打开另一份文稿后仍可离线访问原文稿。语言服务使用文稿安装的 Presmium 入口及随附插件。
  
  修复连续调整尺寸时旧动画构建覆盖新画面、GSAP 构建失败后残留动画，以及切换或关闭课堂连接后的文档与订阅资源释放。
- 7b2aedf: Include the host and viewer dependencies required by the web renderer so editor previews work when installed outside the monorepo, and stop the preview process tree on Windows when the language server shuts down. The VS Code extension now packages a complete runtime in platform-specific VSIX files, with CI builds attached to GitHub Releases.
- Updated dependencies [0e2d705]
- Updated dependencies [ac6ced6]
- Updated dependencies [6a2db7b]
- Updated dependencies [05448a8]
- Updated dependencies [219bf74]
- Updated dependencies [2744156]
- Updated dependencies [f8606cc]
- Updated dependencies [01b7cee]
- Updated dependencies [01b7cee]
- Updated dependencies [4220e06]
- Updated dependencies [720c466]
- Updated dependencies [588f751]
- Updated dependencies [daa26c9]
- Updated dependencies [2645ab9]
- Updated dependencies [bf8efbd]
- Updated dependencies [39506bf]
- Updated dependencies [3c8ec5b]
- Updated dependencies [9a92214]
- Updated dependencies [55f201e]
- Updated dependencies [337a5a0]
- Updated dependencies [b81637f]
- Updated dependencies [d20d5ad]
- Updated dependencies [ce7b9b3]
- Updated dependencies [12a1172]
- Updated dependencies [672d5e5]
- Updated dependencies [ae6b2a0]
- Updated dependencies [4c91448]
- Updated dependencies [bc6c78b]
- Updated dependencies [8b0a084]
- Updated dependencies [05fa463]
- Updated dependencies [3223233]
- Updated dependencies [034204d]
- Updated dependencies [3927612]
- Updated dependencies [abc191d]
- Updated dependencies [01b7cee]
- Updated dependencies [da86b9a]
- Updated dependencies [18bd137]
- Updated dependencies [01b7cee]
- Updated dependencies [18781ba]
- Updated dependencies [6c00b87]
- Updated dependencies [9049893]
- Updated dependencies [4634709]
- Updated dependencies [21b2143]
- Updated dependencies [672d5e5]
- Updated dependencies [e33a62f]
- Updated dependencies [00e8829]
- Updated dependencies [1f329f6]
- Updated dependencies [e924bb7]
- Updated dependencies [70ffb60]
- Updated dependencies [d6ac2f8]
- Updated dependencies [9957f42]
- Updated dependencies [0a245df]
- Updated dependencies [15cec09]
- Updated dependencies [28111cb]
- Updated dependencies [7ea1f91]
- Updated dependencies [1f0e84e]
- Updated dependencies [ba18c96]
- Updated dependencies [6062d4f]
- Updated dependencies [51de911]
- Updated dependencies [e9022ab]
- Updated dependencies [09eb999]
- Updated dependencies [f85bc88]
- Updated dependencies [a9325fe]
- Updated dependencies [8788569]
- Updated dependencies [8e0c72f]
- Updated dependencies [f46b5e8]
- Updated dependencies [637030d]
- Updated dependencies [432a325]
- Updated dependencies [70ffb60]
- Updated dependencies [f8606cc]
- Updated dependencies [3b284ac]
- Updated dependencies [a2039e8]
- Updated dependencies [f459728]
- Updated dependencies [302367d]
- Updated dependencies [3bd1372]
- Updated dependencies [41ba097]
- Updated dependencies [0cb1421]
- Updated dependencies [5a51d3b]
- Updated dependencies [3f4442a]
- Updated dependencies [7ac550a]
- Updated dependencies [425055f]
- Updated dependencies [77c1cf0]
- Updated dependencies [831ad4b]
- Updated dependencies [788ef0d]
- Updated dependencies [70cb6a2]
- Updated dependencies [6803178]
- Updated dependencies [c82e576]
- Updated dependencies [98f5d6c]
- Updated dependencies [e544bdb]
- Updated dependencies [a1ebf3a]
- Updated dependencies [2f6efe1]
- Updated dependencies [55f201e]
- Updated dependencies [c5cbc1c]
- Updated dependencies [01b7cee]
- Updated dependencies [01b7cee]
- Updated dependencies [9e1fcba]
- Updated dependencies [7e136ff]
- Updated dependencies [aca1f46]
- Updated dependencies [e3a1abf]
- Updated dependencies [01b7cee]
- Updated dependencies [a2039e8]
- Updated dependencies [db3b832]
- Updated dependencies [4798c02]
- Updated dependencies [4cb9a17]
- Updated dependencies [5e71240]
- Updated dependencies [b4e1194]
- Updated dependencies [8008b64]
- Updated dependencies [1bdd5e1]
- Updated dependencies [e4f26da]
- Updated dependencies [4de2e16]
- Updated dependencies [6d9ae73]
- Updated dependencies [5ca5241]
- Updated dependencies [672d5e5]
- Updated dependencies [672d5e5]
- Updated dependencies [65c0a2a]
- Updated dependencies [5f4e718]
- Updated dependencies [ef0a065]
- Updated dependencies [3cef1d4]
- Updated dependencies [c0cc0e3]
- Updated dependencies [50da8b8]
- Updated dependencies [0ea1271]
- Updated dependencies [01b7cee]
- Updated dependencies [6ab1b41]
- Updated dependencies [3280da6]
- Updated dependencies [34e51cb]
- Updated dependencies [34e51cb]
- Updated dependencies [e316ba8]
- Updated dependencies [c9ec5f0]
- Updated dependencies [cd822fa]
- Updated dependencies [2e439f7]
- Updated dependencies [34e51cb]
- Updated dependencies [87113ae]
- Updated dependencies [7003f56]
- Updated dependencies [ec5afeb]
- Updated dependencies [01b7cee]
- Updated dependencies [1d12f47]
- Updated dependencies [29c35c2]
- Updated dependencies [44c1a37]
- Updated dependencies [470fd59]
- Updated dependencies [a2039e8]
- Updated dependencies [6e3efc5]
- Updated dependencies [43f2efd]
- Updated dependencies [5f3f4b0]
- Updated dependencies [445390b]
- Updated dependencies [c403261]
- Updated dependencies [5248460]
- Updated dependencies [7e136ff]
- Updated dependencies [251ba00]
- Updated dependencies [afda9e9]
- Updated dependencies [2d81267]
- Updated dependencies [27cdf8c]
- Updated dependencies [672d5e5]
- Updated dependencies [32a4ef8]
- Updated dependencies [f4adb60]
- Updated dependencies [01b7cee]
- Updated dependencies [0cb1421]
- Updated dependencies [3bd1372]
- Updated dependencies [c56b4cc]
- Updated dependencies [a2039e8]
- Updated dependencies [3b2d1aa]
- Updated dependencies [0854838]
- Updated dependencies [a953cb8]
- Updated dependencies [ae6b2a0]
- Updated dependencies [b5e9349]
- Updated dependencies [4c3abeb]
- Updated dependencies [e5473e5]
- Updated dependencies [6e3efc5]
- Updated dependencies [bc8c616]
- Updated dependencies [6c777cc]
- Updated dependencies [cc2e25e]
- Updated dependencies [d54ddce]
- Updated dependencies [81e7767]
- Updated dependencies [d0e13b5]
- Updated dependencies [02bbab2]
- Updated dependencies [c006f57]
- Updated dependencies [447d24d]
- Updated dependencies [81e7767]
- Updated dependencies [dcb6ad0]
- Updated dependencies [01b7cee]
- Updated dependencies [fe0c8ad]
  - @lincyaw/kernel@1.0.0-rc.1
  - @lincyaw/viewer@1.0.0-rc.1
  - @lincyaw/compiler@1.0.0-rc.1
  - @lincyaw/host@1.0.0-rc.1
  - @lincyaw/web@1.0.0-rc.1
  - @lincyaw/cli@1.0.0-rc.1
