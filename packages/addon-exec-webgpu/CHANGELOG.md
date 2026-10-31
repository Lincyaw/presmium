# @lincyaw/addon-exec-webgpu

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
- afda9e9: The slides no longer use Slidev. They are the viewer's own slides page: each section a slide on a canvas of a fixed size (980 wide and 16:9 unless `renderers.slides` says otherwise), drawn in the Book layout and scaled as a whole, from the same prebuilt viewer app as the web form. A section's `{hints} slides:` takes `layout` (`default`, `cover`, `center`, `full`), `class` and `zoom`.
  
  - `presmium build --to slides` takes about 2 s for a lecture; `presmium dev --to slides` and the workbench's slides preview are the viewer's page with `?form=slides` (a switch from the document to the slides in the workbench takes about 0.15 s), and an edit reaches the slide as the sections it changed.
  - The exports print that page in Chromium (`playwright-chromium`, an optional peer of `@lincyaw/render-slides`): `pdf`, `png` (a picture of each slide, or of each step) and `pptx` (a picture of each slide, its narration as the speaker notes, with `pptxgenjs`). `presmium-export` and `presmium-diff` use them; `presmium-export` no longer takes `--wait`, since the page tells when it is ready.
  - The exporters' context builds a renderer's output (`ExportContext.build`, in place of `prepare`) and carries the asker's `options`; the compiler's `exportDocument` runs an exporter, for the workspace's jobs and for the command line.
  - Removed: `@lincyaw/addon-core` (the slides' host adapter; a headmatter that still lists it compiles, with a note), every plugin's `setup/` and Slidev layers, the plugins' `vitePlugins` (a plugin's `vite.config.ts` gives the viewer app's build its Vite plugins and Vue's `isCustomElement`), `Renderer.prepare`, `RenderContext.vitePlugins`, the host's `PmStepScope`, the kernel's `servedAssets`, `prebundleDependencies`, `warmDevPage` and `linkBrowserDependencies`, the publish addon's PWA build of the slides, and the slides' themes.
  - The presenter draws on the slides (`d`, or the pen in the presentation's bar: four inks, the eraser, undo, clear) with drauu: each slide's drawing is shared between the presenter's and the audience's windows and the classroom, and kept in the document's `.presmium/drawings/` while a server serves the page (`@lincyaw/addon-stage`). Viewer plugins can put layers on each slide (`scope: 'slide'`) and controls in the presentation's bar (`scope: 'bar'`).
  - A runnable code block can be edited in place before it runs (CodeMirror 6, loaded the first time a block is edited; Mod-Enter runs), and restored, in the pages and the slides alike.
- d0e13b5: The web form no longer uses VitePress. One prebuilt viewer (the web form's runtime with the plugins' browser parts, built once for a set of plugins and kept in the user's cache) shows every page: in the workbench, in `presmium dev` and `presmium serve`, and in a built site, whose pages it renders on the server first and then hydrates. A document is data beside it: its IR, its own code as a small bundle, its search index, its published files. Our own site shell replaces VitePress's: header and navigation, chapters, the page's sections, pager, footer, search (MiniSearch over the IR, Chinese tokenized), languages, light and dark, the phone layout, the workspace's home page and a 404 page; it is drawn with the design tokens only.
  
  - A build of one lecture's web form takes about 2 s instead of about 25 s, and a workspace site copies the viewer once below `_app/` for all its documents; the bytes are the same in any checkout.
  - `presmium dev` and `presmium serve` start no VitePress process; an edit reaches the page as the sections it changed, and the viewer renders only those again.
  - Plugins declare the files their browser code loads while it runs as `assets` (`RuntimeAssets`: served below the document's site path and copied into a built site); the browser code finds them with the host's `siteBase()`. A document's IR is served and built as `ir.json`, its revision in the `Presmium-Revision` header of a dev server.
  - Removed: the `@lincyaw/web/client` VitePress theme export and the per-document VitePress projects.

### Patch Changes

- f85bc88: 界面文本按术语规范收尾：失败原因（保存、预览、发送给 AI、复刻音色、Jupyter、讲授工具与配音、代码引用参数、提示命令）按代码显示为 zh-CN 与 en 的目录文本，不再显示服务端或浏览器的英文原文；文稿修改的待确认说明改为按页面的简短摘要，不再显示 JSON 与标识；启动报告按插件声明的双语名称显示（`PluginManifest.name`）；视频制作的提示显示本地化的动作名；撤消与恢复的快捷键每个平台只写一种（Apple 设备 ⌘Z、⌘⇧Z，其他 Ctrl+Z、Ctrl+Y）；Jupyter 与 MCP 的凭据叫“访问令牌 / access token”；命令行的系统语言判断移入 `@lincyaw/kernel/node` 的 `systemLocale`。`AgentTool.errors` 让插件工具为它抛出的错误码提供按文稿语言的说明。
- a9325fe: 读者、讲者看到的界面文字按界面术语与文案规范（docs/glossary.md）统一：演示者视图、观众视图、结束放映、讲稿与配音、撤消、更新（不再显示“重新编译”）、网页视图；en 的命令、窗格与视图用 Title Case，消息与字段用 sentence case，弯引号与美式拼写（Canceled）。启动报告、对话框的“关闭”、站点启动失败与审批失败的提示改为目录文本；读者问答按共享的界面语言规则（`currentLocale()`）告诉模型用哪种语言回答；Notebook 中的终端说明、手动字幕过期提示、配音试听文字按文稿的 `lang` 取自目录。
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
- 34e51cb: 修复讲授重播时的画面复位、WebGPU 执行器卸载时的任务取消、符号 Git 引用变化后的自动编译、文件监听失败时的诊断，以及保存等待的取消与超时。
