# @lincyaw/addon-exec-local

## 1.0.0-rc.9

No changes in this release.

## 1.0.0-rc.8

No changes in this release.

## 1.0.0-rc.7

No changes in this release.

## 1.0.0-rc.6

No changes in this release.

## 1.0.0-rc.5

No changes in this release.

## 1.0.0-rc.4

No changes in this release.

## 1.0.0-rc.3

No changes in this release.

## 1.0.0-rc.2

No changes in this release.

## 1.0.0-rc.1

### Minor Changes

- c5cbc1c: The official plugins are renamed from `@lincyaw/slidev-addon-*` to `@lincyaw/addon-*`. A headmatter or an operator plugin list that still names a plugin the old way loads the renamed package; `presmium check` says the current name once for each (an `info` of `presmium.plugins`), and the IR lists the current names.
- 672d5e5: Unify the viewer, web shell, host and plugin components on React with external stores and shared React modules. Replace the Vue runtime and component sources, including generated plugin projects and examples.
  
  Add a lazy BlockNote body editor with source-preserving MyST saves and explicit narration blocks. Text pages, animation blocks and step narration share the preview protocol; narration timing and animation step navigation remain available during presentation.

### Patch Changes

- 540ef9d: Derive a local environment panel's language and runnable code from its single canonical code child. Reject missing or ambiguous code ownership and export the same source in the development-container archive.
- f85bc88: 界面文本按术语规范收尾：失败原因（保存、预览、发送给 AI、复刻音色、Jupyter、讲授工具与配音、代码引用参数、提示命令）按代码显示为 zh-CN 与 en 的目录文本，不再显示服务端或浏览器的英文原文；文稿修改的待确认说明改为按页面的简短摘要，不再显示 JSON 与标识；启动报告按插件声明的双语名称显示（`PluginManifest.name`）；视频制作的提示显示本地化的动作名；撤消与恢复的快捷键每个平台只写一种（Apple 设备 ⌘Z、⌘⇧Z，其他 Ctrl+Z、Ctrl+Y）；Jupyter 与 MCP 的凭据叫“访问令牌 / access token”；命令行的系统语言判断移入 `@lincyaw/kernel/node` 的 `systemLocale`。`AgentTool.errors` 让插件工具为它抛出的错误码提供按文稿语言的说明。
- a9325fe: 读者、讲者看到的界面文字按界面术语与文案规范（docs/glossary.md）统一：演示者视图、观众视图、结束放映、讲稿与配音、撤消、更新（不再显示“重新编译”）、网页视图；en 的命令、窗格与视图用 Title Case，消息与字段用 sentence case，弯引号与美式拼写（Canceled）。启动报告、对话框的“关闭”、站点启动失败与审批失败的提示改为目录文本；读者问答按共享的界面语言规则（`currentLocale()`）告诉模型用哪种语言回答；Notebook 中的终端说明、手动字幕过期提示、配音试听文字按文稿的 `lang` 取自目录。
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
- 425055f: Name the execution plugins' public API after what each name does, and share what they repeated through the kernel and the host. Executor IDs, service IDs, directives and configuration keys are unchanged. Old name to new name:
  
  - `@lincyaw/kernel`: new `componentCode` and `jupyterKernelLanguage`.
  - `@lincyaw/kernel/node`: new `RUN_REQUEST_FILE`, `RUN_RESULT_PREFIX`, `runResultFile`, `minimalRunEnv`, `directSandbox` (the process sandbox when none is configured), and the Vite plugins `servedAssets` and `prebundleDependencies` with the types `ServedAssets` and `ServedAssetsPlugin`.
  - `@lincyaw/host`: new `createResidentWorker` with the types `ResidentWorker`, `ResidentWorkerOptions`, `ResidentWorkerOutcome` and `ResidentWorkerFailure`.
  - `@lincyaw/addon-exec` (`./client`): `runPlace` and `RunPlace` to `runsInOf` and `RunsIn`; `useSlideRoom` to `useSlideSpaceBelow`; `SCRIPT_EXECUTOR_ID` to `BROWSER_SCRIPT_EXECUTOR_ID`; new `PYODIDE_EXECUTOR_ID`. No longer exported: `useMessages` (use the host's `useMessages(MESSAGES)`).
  - `@lincyaw/addon-exec` (`./domain`): `declarations` to `paramsPrelude`; `inBrowserPython` to `importableInBrowser`; new `mimeText`.
  - `@lincyaw/addon-exec-jupyter` (`./domain`): `jupyterEnvironments` to `jupyterSpecs`; `JupyterEnvironments` and `JUPYTER_ENVIRONMENTS` to `JupyterTerminals` and `JUPYTER_TERMINALS` (the service ID `presmium.execJupyter.environments` is unchanged); `kernelOf` and `DEFAULT_KERNEL` to `jupyterKernelName` and `DEFAULT_JUPYTER_KERNEL`; `argumentsCode` to `argsPrelude`; `TerminalSession` and `TerminalEvents` are exported.
  - `@lincyaw/addon-exec-jupyter` (`./client`): `createRemoteEnvironments` and `RemoteEnvironments` (its `service` is `terminals`) to `createJupyterClient` and `JupyterClient`; `jupyterPlugin` to `execJupyterPlugin`.
  - `@lincyaw/addon-exec-local` (`./domain`): `Runners`, `DEFAULT_RUNNERS` and `runnersFrom` to `LanguageCommands`, `DEFAULT_LANGUAGE_COMMANDS` and `languageCommandsFrom` (the definition's key `customizations.presmium.runners` is unchanged); `failedContainerRun(message, durationMs)` to `failedContainerRun(message, executorId)`; new `DEVCONTAINER_KIND`.
  - `@lincyaw/addon-exec-local` (`./client`): `createLocalEnv` and `LocalEnv` to `createLocalEnvClient` and `LocalEnvClient`; `localEnvPlugin` to `execLocalPlugin`. No longer exported: `useMessages`.
  - `@lincyaw/addon-exec-wasi` (`./client`): `createWasiRunner`, `WasiRunner` and `WasiRunnerOptions` to `createWasiExecutors`, `WasiExecutors` and `WasiExecutorsOptions`; `wasiPlugin` to `execWasiPlugin`.
  - `@lincyaw/addon-exec-webgpu` (`./domain`): `failure`, `summary`, `fingerprint`, `unavailable`, `runResult` and `declarations` to `failureText`, `summaryText`, `adapterFingerprint`, `isUnavailable`, `runResultOf` and `shaderBuffers`; new `WEBGPU_KIND`.
  
  Fixes: the Jupyter plugin's server drops the proxy of an environment taken out of the headmatter at the next compile, and the local environment plugin runs each document's blocks in its own workspace when several documents are compiled in one process (`presmium serve`).
- 34e51cb: 减少编译器启动时加载的无用解析模块，解除编辑模型对显示组件的循环依赖，并加快审阅接受、恢复与批量提交。devcontainer 指纹和导出归档共用定义文件范围，文稿编辑不再使仅使用镜像的环境失效。
  
  修复 WASI 编译时读取请求头文件、Jupyter 终端启动失败后的资源释放、原生 Node 中加载 Chromium，以及浏览器导出启动失败后的清理。讲授构建保留完整文稿的语音锁定记录，学生版构建后仍可离线构建完整版。
