# @lincyaw/addon-exec-jupyter

## 1.0.0-rc.14

No changes in this release.

## 1.0.0-rc.13

No changes in this release.

## 1.0.0-rc.12

No changes in this release.

## 1.0.0-rc.11

No changes in this release.

## 1.0.0-rc.10

No changes in this release.

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

- 70ffb60: Support operator-defined JupyterHub environment profiles in document IR. Explicit browser execution starts or reuses the current user's named server through the existing authenticated Jupyter proxy, keeping credentials on the server.
- c5cbc1c: The official plugins are renamed from `@lincyaw/slidev-addon-*` to `@lincyaw/addon-*`. A headmatter or an operator plugin list that still names a plugin the old way loads the renamed package; `presmium check` says the current name once for each (an `info` of `presmium.plugins`), and the IR lists the current names.
- 672d5e5: Unify the viewer, web shell, host and plugin components on React with external stores and shared React modules. Replace the Vue runtime and component sources, including generated plugin projects and examples.
  
  Add a lazy BlockNote body editor with source-preserving MyST saves and explicit narration blocks. Text pages, animation blocks and step narration share the preview protocol; narration timing and animation step navigation remain available during presentation.
- afda9e9: The slides no longer use Slidev. They are the viewer's own slides page: each section a slide on a canvas of a fixed size (980 wide and 16:9 unless `renderers.slides` says otherwise), drawn in the Book layout and scaled as a whole, from the same prebuilt viewer app as the web form. A section's `{hints} slides:` takes `layout` (`default`, `cover`, `center`, `full`), `class` and `zoom`.
  
  - `presmium build --to slides` takes about 2 s for a lecture; `presmium dev --to slides` and the workbench's slides preview are the viewer's page with `?form=slides` (a switch from the document to the slides in the workbench takes about 0.15 s), and an edit reaches the slide as the sections it changed.
  - The exports print that page in Chromium (`playwright-chromium`, an optional peer of `@lincyaw/render-slides`): `pdf`, `png` (a picture of each slide, or of each step) and `pptx` (a picture of each slide, its narration as the speaker notes, with `pptxgenjs`). `presmium-export` and `presmium-diff` use them; `presmium-export` no longer takes `--wait`, since the page tells when it is ready.
  - The exporters' context builds a renderer's output (`ExportContext.build`, in place of `prepare`) and carries the asker's `options`; the compiler's `exportDocument` runs an exporter, for the workspace's jobs and for the command line.
  - Removed: `@lincyaw/addon-core` (the slides' host adapter; a headmatter that still lists it compiles, with a note), every plugin's `setup/` and Slidev layers, the plugins' `vitePlugins` (a plugin's `vite.config.ts` gives the viewer app's build its Vite plugins and Vue's `isCustomElement`), `Renderer.prepare`, `RenderContext.vitePlugins`, the host's `PmStepScope`, the kernel's `servedAssets`, `prebundleDependencies`, `warmDevPage` and `linkBrowserDependencies`, the publish addon's PWA build of the slides, and the slides' themes.
  - The presenter draws on the slides (`d`, or the pen in the presentation's bar: four inks, the eraser, undo, clear) with drauu: each slide's drawing is shared between the presenter's and the audience's windows and the classroom, and kept in the document's `.presmium/drawings/` while a server serves the page (`@lincyaw/addon-stage`). Viewer plugins can put layers on each slide (`scope: 'slide'`) and controls in the presentation's bar (`scope: 'bar'`).
  - A runnable code block can be edited in place before it runs (CodeMirror 6, loaded the first time a block is edited; Mod-Enter runs), and restored, in the pages and the slides alike.

### Patch Changes

- f85bc88: 界面文本按术语规范收尾：失败原因（保存、预览、发送给 AI、复刻音色、Jupyter、讲授工具与配音、代码引用参数、提示命令）按代码显示为 zh-CN 与 en 的目录文本，不再显示服务端或浏览器的英文原文；文稿修改的待确认说明改为按页面的简短摘要，不再显示 JSON 与标识；启动报告按插件声明的双语名称显示（`PluginManifest.name`）；视频制作的提示显示本地化的动作名；撤消与恢复的快捷键每个平台只写一种（Apple 设备 ⌘Z、⌘⇧Z，其他 Ctrl+Z、Ctrl+Y）；Jupyter 与 MCP 的凭据叫“访问令牌 / access token”；命令行的系统语言判断移入 `@lincyaw/kernel/node` 的 `systemLocale`。`AgentTool.errors` 让插件工具为它抛出的错误码提供按文稿语言的说明。
- a9325fe: 读者、讲者看到的界面文字按界面术语与文案规范（docs/glossary.md）统一：演示者视图、观众视图、结束放映、讲稿与配音、撤消、更新（不再显示“重新编译”）、网页视图；en 的命令、窗格与视图用 Title Case，消息与字段用 sentence case，弯引号与美式拼写（Canceled）。启动报告、对话框的“关闭”、站点启动失败与审批失败的提示改为目录文本；读者问答按共享的界面语言规则（`currentLocale()`）告诉模型用哪种语言回答；Notebook 中的终端说明、手动字幕过期提示、配音试听文字按文稿的 `lang` 取自目录。
- abc191d: 代理模式下离开讲义页面时，由服务端完成 Jupyter 内核与执行目录的清理，避免页面卸载后残留目录。临时执行及普通插件销毁等待清理完成，并回收启动失败时创建的目录。
  
  已取消的远端执行请求在提交或排队等待时停止，不再把取消后的代码发送给内核。
  
  静态页面连接失败或 JupyterHub 用户发现失败后清除缓存令牌，允许重新输入，避免跨域错误隐藏 HTTP 状态时反复使用无效令牌。
  
  终端首次连接时应用请求的窗口尺寸；shell 退出后显示已结束并允许重新打开，释放连接时停止后台轮询。
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
- ec5afeb: 工作区服务可以放在一个路径下面：`presmium serve --public-url https://host/user/a/preview/` 时，网站、预览、导出产物与 `__presmium/` 路由都在该路径下，代理原样转发路径即可（例如 JupyterHub 的 jupyter-server-proxy）。页面的 `AppConfig.server` 给出这个前缀，`@lincyaw/host` 的服务端客户端与控制通道据此访问路由，并新增 `pluginRoutePath` 供插件拼出自己的路由；Jupyter 执行环境与课堂同步改用它。路径不同的导出不会互相复用产物。`presmium studio` 新增 `--preview-port`，并把带启动令牌的地址写进 0600 的状态文件；工作台对文稿上下文的请求改为相对地址，可在路径下工作。
