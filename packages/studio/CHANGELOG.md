# @lincyaw/studio

## 0.2.0-rc.13

### Patch Changes

- Updated dependencies [eb70da8]
  - @lincyaw/presmium@1.0.0-rc.14
  - @lincyaw/dsh@0.2.0-rc.13

## 0.2.0-rc.12

### Patch Changes

- @lincyaw/presmium@1.0.0-rc.13
  - @lincyaw/dsh@0.2.0-rc.12

## 0.2.0-rc.11

### Patch Changes

- @lincyaw/presmium@1.0.0-rc.12
  - @lincyaw/dsh@0.2.0-rc.11

## 0.2.0-rc.10

### Patch Changes

- @lincyaw/presmium@1.0.0-rc.11
  - @lincyaw/dsh@0.2.0-rc.10

## 0.2.0-rc.9

### Patch Changes

- @lincyaw/presmium@1.0.0-rc.10
  - @lincyaw/dsh@0.2.0-rc.9

## 0.2.0-rc.8

### Patch Changes

- @lincyaw/presmium@1.0.0-rc.9
  - @lincyaw/dsh@0.2.0-rc.8

## 0.2.0-rc.7

### Patch Changes

- @lincyaw/presmium@1.0.0-rc.8
  - @lincyaw/dsh@0.2.0-rc.7

## 0.2.0-rc.6

### Patch Changes

- @lincyaw/presmium@1.0.0-rc.7
  - @lincyaw/dsh@0.2.0-rc.6

## 0.2.0-rc.5

### Patch Changes

- @lincyaw/dsh@0.2.0-rc.5
  - @lincyaw/presmium@1.0.0-rc.6

## 0.2.0-rc.4

### Patch Changes

- @lincyaw/presmium@1.0.0-rc.5
  - @lincyaw/dsh@0.2.0-rc.4

## 0.2.0-rc.3

### Patch Changes

- @lincyaw/presmium@1.0.0-rc.4
  - @lincyaw/dsh@0.2.0-rc.3

## 0.2.0-rc.2

### Patch Changes

- @lincyaw/presmium@1.0.0-rc.3
  - @lincyaw/dsh@0.2.0-rc.2

## 0.2.0-rc.1

### Patch Changes

- @lincyaw/presmium@1.0.0-rc.2
  - @lincyaw/dsh@0.2.0-rc.1

## 0.2.0-rc.0

### Minor Changes

- d20d5ad: Presmium Studio 与工作区服务可以放在反向代理之后：`presmium serve --public-url <来源>` 信任该来源的主机，并用它给出预览与导出产物的地址；`presmium studio --public-url <网址> --preview-url <来源>` 把浏览器使用的根地址交给 DeepSeek Harness（`--public-url`、`--trusted-host`），把预览的来源交给工作区服务。Presmium 云端用它为每个用户运行完整的 Studio。设计系统新增 `share` 与 `stop` 图标。
- ec5afeb: 工作区服务可以放在一个路径下面：`presmium serve --public-url https://host/user/a/preview/` 时，网站、预览、导出产物与 `__presmium/` 路由都在该路径下，代理原样转发路径即可（例如 JupyterHub 的 jupyter-server-proxy）。页面的 `AppConfig.server` 给出这个前缀，`@lincyaw/host` 的服务端客户端与控制通道据此访问路由，并新增 `pluginRoutePath` 供插件拼出自己的路由；Jupyter 执行环境与课堂同步改用它。路径不同的导出不会互相复用产物。`presmium studio` 新增 `--preview-port`，并把带启动令牌的地址写进 0600 的状态文件；工作台对文稿上下文的请求改为相对地址，可在路径下工作。

### Patch Changes

- 09eb999: The command lines `presmium`, `presmium studio` (`presmium-studio`), `presmium-mcp` and `create-presmium` print their help, progress, summaries and errors in Chinese or English by the system language (`LC_ALL`, `LC_MESSAGES`, `LANG`), with the glossary's words; errors say what failed and what to do next. JSON, URLs, paths, flags and the `serve  <url>`, `workspace  <dir>`, `mcp  <url>`, `studio  <url>` lines are the same in both languages, and the English text that tests and documents quote is unchanged.
  
  MCP approval titles name the operation as a command in the document's language (“导出文稿（网站、幻灯片）” / “Export Document (Website, Slides)”), without tool names, ids or internal names; the explanations of tool error codes follow the glossary and name no tool or field, and denied approvals, pending AI changes and missing permissions have one. The VS Code extension localizes its runtime messages through `vscode.l10n` (`l10n/bundle.l10n.zh-cn.json`).
- f85bc88: 界面文本按术语规范收尾：失败原因（保存、预览、发送给 AI、复刻音色、Jupyter、讲授工具与配音、代码引用参数、提示命令）按代码显示为 zh-CN 与 en 的目录文本，不再显示服务端或浏览器的英文原文；文稿修改的待确认说明改为按页面的简短摘要，不再显示 JSON 与标识；启动报告按插件声明的双语名称显示（`PluginManifest.name`）；视频制作的提示显示本地化的动作名；撤消与恢复的快捷键每个平台只写一种（Apple 设备 ⌘Z、⌘⇧Z，其他 Ctrl+Z、Ctrl+Y）；Jupyter 与 MCP 的凭据叫“访问令牌 / access token”；命令行的系统语言判断移入 `@lincyaw/kernel/node` 的 `systemLocale`。`AgentTool.errors` 让插件工具为它抛出的错误码提供按文稿语言的说明。
- 8788569: Reuse unchanged Markdown fragments and built-in sections during editing, merge rapid saves and cancel obsolete compilations. Preserve complete IR validation and numbering while reducing repeated traversal. Serialize host compilations and bound common native thread pools in preview, build and execution child processes so background work leaves resources for other applications.
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
- 7b54df0: Name the workbench's public API after what each name does, and start the workspace server the same way in the bundle and in studio. Old name to new name:
  
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
- a2039e8: Show workspace-service logs in the Studio terminal and print the timestamped log file's location at startup. Record preview preparation, viewer cache and fallback choices, compilation timings, export job phases and lecture synthesis failures with document context.
- b88a629: Studios of different installations (two versions, or two checkouts) can run at the same time: each has its own DeepSeek Harness profile, `presmium-studio-<hash>` under `$XDG_STATE_HOME/presmium/studio/profiles`, linked to its own `@lincyaw/dsh`, and its own log `presmium-studio-<hash>.log`, so starting one no longer makes the other load its code or empties its log. Sessions and credentials stay shared; a new installation's profile starts with the settings of the profile used last, the earlier single `presmium-studio` included, so an author keeps their settings after an upgrade.
- Updated dependencies [0e2d705]
- Updated dependencies [ec3a0be]
- Updated dependencies [ac6ced6]
- Updated dependencies [f32d5ea]
- Updated dependencies [5af663e]
- Updated dependencies [a280535]
- Updated dependencies [d5c55ce]
- Updated dependencies [bfa8da2]
- Updated dependencies [05448a8]
- Updated dependencies [eba2be5]
- Updated dependencies [219bf74]
- Updated dependencies [2744156]
- Updated dependencies [f8606cc]
- Updated dependencies [19aeca1]
- Updated dependencies [bf8efbd]
- Updated dependencies [39506bf]
- Updated dependencies [81e7767]
- Updated dependencies [e544bdb]
- Updated dependencies [ce7b9b3]
- Updated dependencies [12a1172]
- Updated dependencies [ae6b2a0]
- Updated dependencies [034204d]
- Updated dependencies [da86b9a]
- Updated dependencies [21b2143]
- Updated dependencies [e33a62f]
- Updated dependencies [d6ac2f8]
- Updated dependencies [7ea1f91]
- Updated dependencies [f85bc88]
- Updated dependencies [eb7a85a]
- Updated dependencies [8788569]
- Updated dependencies [32be204]
- Updated dependencies [f8606cc]
- Updated dependencies [302367d]
- Updated dependencies [62b07d1]
- Updated dependencies [3bd1372]
- Updated dependencies [0cb1421]
- Updated dependencies [7ac550a]
- Updated dependencies [7b54df0]
- Updated dependencies [4e7cb7a]
- Updated dependencies [a7feebf]
- Updated dependencies [2f6efe1]
- Updated dependencies [9cc2a8a]
- Updated dependencies [4798c02]
- Updated dependencies [4cb9a17]
- Updated dependencies [b4e1194]
- Updated dependencies [5ca5241]
- Updated dependencies [3cef1d4]
- Updated dependencies [01b7cee]
- Updated dependencies [b45547b]
- Updated dependencies [08187cf]
- Updated dependencies [01b7cee]
- Updated dependencies [ec5afeb]
- Updated dependencies [1d12f47]
- Updated dependencies [44c1a37]
- Updated dependencies [6e3efc5]
- Updated dependencies [5f3f4b0]
- Updated dependencies [b45dce3]
- Updated dependencies [445390b]
- Updated dependencies [81e7767]
- Updated dependencies [afda9e9]
- Updated dependencies [2cb3c87]
- Updated dependencies [0b5c119]
- Updated dependencies [8722853]
- Updated dependencies [01b7cee]
- Updated dependencies [01b7cee]
- Updated dependencies [e544bdb]
- Updated dependencies [3b2d1aa]
- Updated dependencies [e5473e5]
- Updated dependencies [6e3efc5]
- Updated dependencies [6c777cc]
- Updated dependencies [d54ddce]
- Updated dependencies [1d12f47]
- Updated dependencies [02bbab2]
- Updated dependencies [c006f57]
- Updated dependencies [447d24d]
- Updated dependencies [01b7cee]
- Updated dependencies [81e7767]
- Updated dependencies [81e7767]
- Updated dependencies [2b0effd]
- Updated dependencies [81e7767]
- Updated dependencies [e544bdb]
- Updated dependencies [01b7cee]
- Updated dependencies [81e7767]
  - @lincyaw/dsh@0.2.0-rc.0
  - @lincyaw/presmium@1.0.0-rc.1
