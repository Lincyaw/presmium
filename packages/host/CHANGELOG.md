# @lincyaw/host

## 1.0.0-rc.2

### Patch Changes

- @lincyaw/design@1.0.0-rc.2
  - @lincyaw/kernel@1.0.0-rc.2

## 1.0.0-rc.1

### Major Changes

- afda9e9: The slides no longer use Slidev. They are the viewer's own slides page: each section a slide on a canvas of a fixed size (980 wide and 16:9 unless `renderers.slides` says otherwise), drawn in the Book layout and scaled as a whole, from the same prebuilt viewer app as the web form. A section's `{hints} slides:` takes `layout` (`default`, `cover`, `center`, `full`), `class` and `zoom`.
  
  - `presmium build --to slides` takes about 2 s for a lecture; `presmium dev --to slides` and the workbench's slides preview are the viewer's page with `?form=slides` (a switch from the document to the slides in the workbench takes about 0.15 s), and an edit reaches the slide as the sections it changed.
  - The exports print that page in Chromium (`playwright-chromium`, an optional peer of `@lincyaw/render-slides`): `pdf`, `png` (a picture of each slide, or of each step) and `pptx` (a picture of each slide, its narration as the speaker notes, with `pptxgenjs`). `presmium-export` and `presmium-diff` use them; `presmium-export` no longer takes `--wait`, since the page tells when it is ready.
  - The exporters' context builds a renderer's output (`ExportContext.build`, in place of `prepare`) and carries the asker's `options`; the compiler's `exportDocument` runs an exporter, for the workspace's jobs and for the command line.
  - Removed: `@lincyaw/addon-core` (the slides' host adapter; a headmatter that still lists it compiles, with a note), every plugin's `setup/` and Slidev layers, the plugins' `vitePlugins` (a plugin's `vite.config.ts` gives the viewer app's build its Vite plugins and Vue's `isCustomElement`), `Renderer.prepare`, `RenderContext.vitePlugins`, the host's `PmStepScope`, the kernel's `servedAssets`, `prebundleDependencies`, `warmDevPage` and `linkBrowserDependencies`, the publish addon's PWA build of the slides, and the slides' themes.
  - The presenter draws on the slides (`d`, or the pen in the presentation's bar: four inks, the eraser, undo, clear) with drauu: each slide's drawing is shared between the presenter's and the audience's windows and the classroom, and kept in the document's `.presmium/drawings/` while a server serves the page (`@lincyaw/addon-stage`). Viewer plugins can put layers on each slide (`scope: 'slide'`) and controls in the presentation's bar (`scope: 'bar'`).
  - A runnable code block can be edited in place before it runs (CodeMirror 6, loaded the first time a block is edited; Mod-Enter runs), and restored, in the pages and the slides alike.

### Minor Changes

- f8606cc: Reuse up to two loaded web preview windows when switching lectures. Inactive previews unmount document components, stop their runtime and control stream, and expire after two minutes. Resume refreshes the published IR without reloading JavaScript. Unsupported previews, changed runtime configurations, and plugins without an explicit restartable lifecycle fall back to reloading.
  
  Add optional preview activity commands and acknowledgements. Browser module packages must opt in with `presmium.preview.restartable` and kernel plugins with `PluginDefinition.restartable`, promising complete disposal followed by setup in the same window. Core and content opt in; other sources default to reloading.
  
  Validate unchanged IR snapshots with ETags and reuse a bounded cache of parsed workbench IR, avoiding repeated transfers and parsing while still checking the current revision on each request.
  
  Coalesce concurrent IR reads, revalidate saves that arrive during an earlier read, and memoize pure Markdown HAST within a bounded cache. Mounted components and background resources are never retained by this data cache.
- 6c00b87: 采纳五条设计规则：标题平衡换行、正文避免末行孤字（网页、幻灯片与编辑器）；嵌套圆角取外层减间隙（菜单项、Segmented 与搜索列表选项）；公共控件补齐按下态，新增骨架占位 `PmSkeleton` 用于打开文稿、页面栏与预览准备，批注侧栏为空时给出引导；成功与错误消息说明具体结果与下一步；动效只用 transform 与 opacity，令牌检查报告动画布局属性的过渡与关键帧。
- 21b2143: Keep document authoring independent from presentation and video controls, with every chapter visible in one continuous authoring canvas. Restore ordinary BlockNote paragraph, list and formatting edits; make toolbar undo use the editor's own history before saved source revisions, retain stable page identities during native title edits, and preserve confirmed source bindings when restoring deleted simple blocks. Keep newer input explicit across delayed save acknowledgements and return completed writes only to their original preview instance. Retain drafts while a preview is inactive and do not replay request replies after a new handshake.
  
  Keep author tools within desktop and touch viewports, avoid covering selections with formatting or comment tools, expose only formatting that survives Markdown persistence, preserve source text when showing comment pins, and allow only clipboard writing for explicitly requested draft copies. Refresh document context after author operations so newly created documents can be selected immediately. The separate compilation and video workspaces remain subsequent work.
- 9957f42: Render canonical columns, tabs and stacks through shared runtime components. Preserve authored column proportions, step-dependent child visibility and tab state; stack columns on narrow screens and retain every titled child in notebook output.
- 51de911: Show canonical narration as step captions in presentations without requiring speech configuration or generating audio and estimated timing. Share a token-based caption surface, give loaded timed-caption players explicit display ownership, and preserve current step captions when no real cached audio is available.
- 432a325: Resolve complete visual states and component parameters by authored Step ID, including reverse and arbitrary navigation. Expose local-step and semantic state through the host scope and scene context. Remove the viewer's per-page authoring editors; document editing and native comments now live in the workbench's single JSON editor.
- 5a51d3b: Animations on the steps and on the lecture's time. The new plugin `@lincyaw/addon-motion` adds `{scene}`: a timeline of the document's `scenes/` written with GSAP, Anime.js, Motion, Three.js or Remotion, cut into steps by `:durations:`. The host gains the time in a step (`useStepTime`, driven by the page or by a lecture through `STEP_CLOCK`) and components' named actions (`useActions`), which replay the `click` of a lecture. A component node can declare `durations`, and a synthesized lecture stays on a step until its animations have played. `presmium-lecture export` draws the animations frame by frame at 30 frames a second by default, adds a WebVTT subtitle track for each language of the captions and writes them next to the video, and `--burn <language>` draws the captions on the picture. The guidance cursor glides on the step's time, so videos show it moving. Inside a slide, the slides host's `useCursor` gives that slide and its clicks, so a preview of the next slide stays settled. The renderers give a component node's `durations` to its component as the prop `durations`.
- 8008b64: Expose source and plan-bound controls and observable positions from the existing lecture player through the public host service and preview bridge. Pause before seeking, wait for real picture preparation before acknowledging, preserve the clock on repeated loads of the same plan, and reject superseded requests without starting playback. Confirmed silent plans use the existing clock; estimated plans remain unavailable for playback.
- 672d5e5: Unify the viewer, web shell, host and plugin components on React with external stores and shared React modules. Replace the Vue runtime and component sources, including generated plugin projects and examples.
  
  Add a lazy BlockNote body editor with source-preserving MyST saves and explicit narration blocks. Text pages, animation blocks and step narration share the preview protocol; narration timing and animation step navigation remain available during presentation.
- 65c0a2a: Resolve canonical state and parameters when using scene controls in the document reader. Local animation playback keeps its existing clock and no longer retains the final reading snapshot after jumping to an earlier animation step. Reader controls stay local to their scene instead of navigating to another document section, and keep their selected local state while the reader scrolls.
- ec5afeb: 工作区服务可以放在一个路径下面：`presmium serve --public-url https://host/user/a/preview/` 时，网站、预览、导出产物与 `__presmium/` 路由都在该路径下，代理原样转发路径即可（例如 JupyterHub 的 jupyter-server-proxy）。页面的 `AppConfig.server` 给出这个前缀，`@lincyaw/host` 的服务端客户端与控制通道据此访问路由，并新增 `pluginRoutePath` 供插件拼出自己的路由；Jupyter 执行环境与课堂同步改用它。路径不同的导出不会互相复用产物。`presmium studio` 新增 `--preview-port`，并把带启动令牌的地址写进 0600 的状态文件；工作台对文稿上下文的请求改为相对地址，可在路径下工作。
- 29c35c2: Implement shared compact, regular and touch controls with token-based states. Add accessible workbench fields, tooltips, keyboard tabs and toolbars, segmented choices, stable loading indicators and modal focus handling; align host controls with the same public styles.
- d0e13b5: The web form no longer uses VitePress. One prebuilt viewer (the web form's runtime with the plugins' browser parts, built once for a set of plugins and kept in the user's cache) shows every page: in the workbench, in `presmium dev` and `presmium serve`, and in a built site, whose pages it renders on the server first and then hydrates. A document is data beside it: its IR, its own code as a small bundle, its search index, its published files. Our own site shell replaces VitePress's: header and navigation, chapters, the page's sections, pager, footer, search (MiniSearch over the IR, Chinese tokenized), languages, light and dark, the phone layout, the workspace's home page and a 404 page; it is drawn with the design tokens only.
  
  - A build of one lecture's web form takes about 2 s instead of about 25 s, and a workspace site copies the viewer once below `_app/` for all its documents; the bytes are the same in any checkout.
  - `presmium dev` and `presmium serve` start no VitePress process; an edit reaches the page as the sections it changed, and the viewer renders only those again.
  - Plugins declare the files their browser code loads while it runs as `assets` (`RuntimeAssets`: served below the document's site path and copied into a built site); the browser code finds them with the host's `siteBase()`. A document's IR is served and built as `ir.json`, its revision in the `Presmium-Revision` header of a dev server.
  - Removed: the `@lincyaw/web/client` VitePress theme export and the per-document VitePress projects.

### Patch Changes

- 55f201e: Center text-only action labels while reserving balanced space for their loading indicator, keeping the label visible and the button width stable during loading.
- 672d5e5: Replace presentation and presenter text controls with compact semantic icons, keeping accessible labels and showing action names and shortcuts on hover or keyboard focus. Compact the position counter and bar spacing, add Shift+F to toggle full screen while preserving the stage plugin's F freeze key, and allow full screen in workbench previews. Reuse the same icon button for starting a lecture.
- abc191d: 切换幻灯片、到达块的 until 步骤或卸载组件时暂停视频和音频，避免隐藏的媒体继续播放；总览与下一页预览不自动播放。返回后保留手动控制，仅在仍启用自动播放时恢复中断的自动播放，网页阅读时仍可自行控制屏幕外的音频。宿主新增 useBlockStepRange，提供父子块显示范围的交集而不改变原有步骤偏移。
- 9049893: Make document widgets directly interactive and replace the interaction switch with an accessible refresh icon, retaining loading and disabled feedback. Resolve explicit preview steps through complete semantic state and parameters while preserving reader controls.
  
  Carry discrete boundaries from the existing local animation clock into source step navigation, including the first Play on a first-page animation. Preserve playback through scene state changes and keep initial reading defaults separate from actual user navigation. Ordinary reader playback does not acquire document widget navigation behavior.
- f85bc88: 界面文本按术语规范收尾：失败原因（保存、预览、发送给 AI、复刻音色、Jupyter、讲授工具与配音、代码引用参数、提示命令）按代码显示为 zh-CN 与 en 的目录文本，不再显示服务端或浏览器的英文原文；文稿修改的待确认说明改为按页面的简短摘要，不再显示 JSON 与标识；启动报告按插件声明的双语名称显示（`PluginManifest.name`）；视频制作的提示显示本地化的动作名；撤消与恢复的快捷键每个平台只写一种（Apple 设备 ⌘Z、⌘⇧Z，其他 Ctrl+Z、Ctrl+Y）；Jupyter 与 MCP 的凭据叫“访问令牌 / access token”；命令行的系统语言判断移入 `@lincyaw/kernel/node` 的 `systemLocale`。`AgentTool.errors` 让插件工具为它抛出的错误码提供按文稿语言的说明。
- a9325fe: 读者、讲者看到的界面文字按界面术语与文案规范（docs/glossary.md）统一：演示者视图、观众视图、结束放映、讲稿与配音、撤消、更新（不再显示“重新编译”）、网页视图；en 的命令、窗格与视图用 Title Case，消息与字段用 sentence case，弯引号与美式拼写（Canceled）。启动报告、对话框的“关闭”、站点启动失败与审批失败的提示改为目录文本；读者问答按共享的界面语言规则（`currentLocale()`）告诉模型用哪种语言回答；Notebook 中的终端说明、手动字幕过期提示、配音试听文字按文稿的 `lang` 取自目录。
- 3f4442a: Name the classroom's and the other plugins' public API after what each name does, and move the demonstration components out of the published plugins. Old name to new name:
  
  - `@lincyaw/addon-classroom`:
    - The classroom store's records name the right options of a quiz `correct` (`QuizState`, `QuizSource` and the `PmQuiz` prop, which was `answer`), the asker of a question `participant` (was `author`) and the component a record belongs to `quizId`, `pulseId`, `predictId`, `exerciseId` (were `quiz`, `pulse`, `predict`, `exercise`). Records that earlier versions wrote are still read. A deck that writes `{component} PmQuiz` with an `answer` prop passes `correct` instead; `{quiz}` is unchanged.
    - `isAnswer`, `isQuizState`, `isPulseVote`, `isSubmission`, `isQuestion`, `isNote`, `isSavedPrediction`, `isPrediction` to `toAnswer`, `toQuizState`, `toPulseVote`, `toSubmission`, `toQuestion`, `toNote`, `toSavedPrediction`, `toPrediction` (they return the record, or `undefined`); `useCollection` takes such a function.
    - `useSession`, `useNotes`, `useWrite`, `bothStores` to `useParticipation`, `useNoteStore`, `useGuardedWrite`, `layeredStore`; `readersHave`, `isLabel`, `sectionNumbers` to `isForStudents`, `isAuthorLabel`, `toSectionNumbers`; `tally`, `distribution`, `summarize`, `summaryText`, `Tally`, `ExerciseSummary` to `quizTally`, `pulseTally`, `exerciseTally`, `exerciseTallyText`, `QuizTally`, `ExerciseTally`; `QuestionGroup.place` to `label`. New: `classroomRows`, `unansweredCount`, `ClassroomRecords`, `ClassroomRows`. No longer exported: `READERS`, `CHECK_PROGRAM`, `typicalError`.
    - The passes are named `presmium.classroom.places`, `presmium.classroom.predict-reveals` and `presmium.classroom.predict-fallbacks`.
  - `@lincyaw/addon-session`: `createClassroom`, `Classroom`, `ClassroomOptions` to `createClassroomConnection`, `ClassroomConnection`, `ClassroomConnectionOptions`, and its `serve()` to `setServer()`; `useClassroom` to `useClassroomSession`; `started`, `ended`, `cursorOf`, `plain`, `loopbackLink`, `roomId`, `sessionConfig` to `startRecord`, `endRecord`, `clonePosition`, `jsonClone`, `isLoopbackLink`, `readableString`, `toSessionConfig`. `ClassroomSnapshot.presenterPosition`, which nothing read, is removed.
  - `@lincyaw/classroom-server`: `ClassroomServerOptions.host` to `listenAddress`; the command's file is `bin/presmium-classroom-server.mjs` (the command and its `--host` are unchanged).
  - `@lincyaw/addon-publish`: `OFFLINE_MANIFEST`, `OfflineManifest` to `OFFLINE_CACHE_RULES`, `OfflineCacheRules`; `onInBuild`, `publishOptions` to `slidevEnablesInBuild`, `toPublishOptions`. New: `MEDIA_EXTENSIONS`. The pass is named `presmium.publish.remote-assets`.
  - `@lincyaw/addon-core`: the demonstration components `PmDemoStepper`, `PmDemoGreeting`, `PmDemoAnimated`, `PmDemoBroken`, the demonstration plugins (`demoPlugins`, `DEMO_GREETER`, `DEMO_GREETING`, `Greeter`), `wantsDemo`, the `presmium.core.demo` option and the `presmiumPlugins` export are removed (they live in a test plugin of the repository). `sharedOut`, `sharedReceiver`, `slideSectionOf`, `SlideSections.placeOf` to `sharedStateOut`, `createSharedStateIn`, `toSlideSection`, `SlideSections.slideAt`. The pass is named `presmium.core.slide-sections`.
  - `@lincyaw/host`: `pluginsOf(module)` takes no configuration: a plugin module no longer exports `presmiumPlugins(config)`.
  - `@lincyaw/addon-content`: `<presmium-demo-counter>`, `defineDemoElements`, `DEMO_COUNTER_TAG`, `contentPlugin` and the `./client` export are removed. The pass is named `presmium.content.plantuml`.
  - `@lincyaw/addon-code`: `found`, `notFound`, `locate`, `unitRecord`, `codeConfig` to `resolvedAt`, `unresolved`, `lineRange`, `originUnits`, `toCodeConfig`; `Candidate.print` and `Snippet.units` to `Candidate.fingerprint` and `Snippet.regions`. No longer exported: `dedent`, `isRegionMarker`.
  - `@lincyaw/addon-stage`: `STAGE_MESSAGES` to `MESSAGES`, `screenMode` to `toScreenMode`; `./client` no longer re-exports the names of `./domain`. The pass is named `presmium.stage.footnotes`. `StageViewerContext` is removed: the viewer plugin takes `ViewerPluginContext` from `@lincyaw/viewer`, as the guide and session plugins now do too.
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
- 77c1cf0: Name the lecture, speech, assistant and guide plugins' public API after what each name does, and keep the synthesis cache's layout behind the speech service. Old name to new name:
  
  - `@lincyaw/kernel`: `Synthesis` has `provider`; `SpeechService` may give `alignWords(key, { lang, transcribe? })` (the words of a cached clip, timed by transcribing it once) and `pruneLock(keep)` (keeps only these keys in `speech.lock.json`); the Node speech service gives both. New: `speechEngineId` (the rule that compares engine ids), `AigcLabel`, `aigcLabel`, `aigcString` and `isCjk`.
  - `@lincyaw/host`: new `codeLinesBox`.
  - `@lincyaw/addon-speech/domain`: `speak` and `SpokenText` to `applyLexiconWithSpans` and `LexiconText`; `SpeechBody`, `TimedSpeech`, `TranscriptionAnswer`, `EngineListing` and `VoiceListing` to `SynthesisRequestBody`, `SynthesisResponseBody`, `TranscriptionResponseBody`, `EnginesResponseBody` and `VoicesResponseBody`; `speechBody` to `synthesisRequestBody`; `synthesisRequestOf` to `toSynthesisRequest`; `engineId`, `aigcLabel`, `aigcString` and `AigcLabel` to the kernel's `speechEngineId`, `aigcLabel`, `aigcString` and `AigcLabel`. No longer exported: `fakeWords`.
  - `@lincyaw/addon-lecture/domain`: `deckTrack` and `recordedSections` to `trimToDeck` and `dropChangedSections`; `chapters` and `Chapter` to `trackChapters` and `TrackChapter`; `readCue` to `parseCue`; `narrationPlace` and `NarrationPlace` to `narrationSource` and `NarrationSource`; `ScriptSections` to `ScriptFileSections`; `PlanProblem.compiled` to `reportedAtCompile`; `PlannedSection.from` `'script'` to `'scriptFile'` (also in the `lecture_preview` tool's answer); `isCjk` to the kernel's `isCjk`. `captionsVtt`, `isStale` and `translationItems` no longer take a digest function (`Digest` is gone; `translationDigest` is the one digest). New: `isWide`, `audioSegments`, `AudioSegment`, `utteranceLine`, `LECTURE_RENDERER`, `PLAYER_RENDERER`.
  - `@lincyaw/addon-assistant/domain`: `askSettingsOf` to `toAskSettings`; `askUrlValid` to `isAskUrlValid`; `chunkText` to `streamDelta`, which takes the event's data and returns `{ done: true }` or `{ text? }` (`StreamDelta`). New: `promptLanguage`. No longer exported: `citationsOf`.
  - `@lincyaw/addon-guide`: `CUE_MESSAGES` and `CueMessages` to `GUIDE_MESSAGES` and `GuideMessages`; `LIVE_PROBE`, `LiveProbe` and `useIsLive` to `STAGE_PROBE`, `StageProbe` and `useIsOnStage`; the `CueLook` value `'live'` to `'stage'`, and so the `data-look`, `data-pm-spotlight` and `data-pm-hint` attributes of a cue drawn on the stage.
  
  Fixed: the lecture plugin compares engine ids by the speech plugin's rule, so a deck that names its engine in another spelling (for example `My.Fake` for `my_fake`) finds it; before, `presmium check` then synthesized the lecture's paragraphs through the engine. The player's "not yet synthesized" message is gone, as no route answers it.
- 70cb6a2: Keep overlay caption reading keys in the native scroll surface instead of navigating presentation steps. Preserve caller key handlers, browser defaults, left/right step navigation and Escape.
- ef0a065: Add a typed, version-bound seek/pause protocol for read-only document widgets. Validate the parent window and origin, document, block ownership and stable step before navigating. Initial and reload seeks can choose a step's start; ordinary explicit seeks retain completed-step behavior.
  
  Register local scene playback with the existing playback coordinator, so pausing a widget cancels pending starts and stops its current animation frame without losing time. Navigation boundaries remain transient runtime intent and never duplicate authoring or production timing.
- c9ec5f0: Serialize host startup and shutdown so restarting waits for the previous plugins to finish disposing, and keep each step clock's preparation tasks and failures within its own runtime.
- 7e136ff: 将步骤字幕与播放字幕统一悬浮在幻灯片画布内的底部安全区，字幕显隐不再挤压画面或改变幻灯片缩放。
- 27cdf8c: Keep zero-duration steps individually selectable by sending their stable identity to the existing production player. Restore the selected event boundary on load and navigation while preserving absolute time seeking, binding checks, cancellation and the real clock. While paused on a zero-duration step, select its own captions (or none); preserve real timed captions during playback and positive-duration cue transitions.
  
  Prevent a delayed page operation from mutating or clearing operation state in a document scope opened after its save barrier began.
- 672d5e5: Edit narration and captions for each presentation step in the workbench, with a choice of speaking during or after its animation. Save explicit step bindings in MyST, preserve drafts and source conflicts, and use the same timing for playback and video captions. Replace author role banners with compact icons and page/step references; add direct animation step buttons and a presentation step menu. Keep the current step while preparing or refreshing narration playback.
- 01b7cee: Give teaching agents observed browser feedback through get_runtime and bounded context summaries, including plugin/component failures and live execution status. Keep browser observations separate from compiled recordings. Add workspace Quick Open and a small command palette that preserve drafts, source locations and focus.
- e5473e5: Reuse Studio's authenticated event connection for embedded live-viewer updates and classroom control. Preserve standalone SSE and the original five workspace event frame shapes; release subscriptions by preview generation and reject late parked-frame events.
- 81e7767: Use Reka UI for shared Vue overlays, tabs and presentation focus management, Lucide for shared icons, and VueUse for theme observation. Parse reader question streams with eventsource-parser, including multiline SSE events. Keep lecture playback controls within the presentation focus scope.
- Updated dependencies [0e2d705]
- Updated dependencies [ac6ced6]
- Updated dependencies [6a2db7b]
- Updated dependencies [2236323]
- Updated dependencies [05448a8]
- Updated dependencies [219bf74]
- Updated dependencies [2744156]
- Updated dependencies [f8606cc]
- Updated dependencies [01b7cee]
- Updated dependencies [01b7cee]
- Updated dependencies [588f751]
- Updated dependencies [2645ab9]
- Updated dependencies [bf8efbd]
- Updated dependencies [39506bf]
- Updated dependencies [9a92214]
- Updated dependencies [55f201e]
- Updated dependencies [337a5a0]
- Updated dependencies [b81637f]
- Updated dependencies [b81637f]
- Updated dependencies [b81637f]
- Updated dependencies [d20d5ad]
- Updated dependencies [fc1ae7b]
- Updated dependencies [d59fa88]
- Updated dependencies [ce7b9b3]
- Updated dependencies [12a1172]
- Updated dependencies [672d5e5]
- Updated dependencies [b81e436]
- Updated dependencies [ae6b2a0]
- Updated dependencies [bc6c78b]
- Updated dependencies [8b0a084]
- Updated dependencies [05fa463]
- Updated dependencies [3223233]
- Updated dependencies [034204d]
- Updated dependencies [3927612]
- Updated dependencies [01b7cee]
- Updated dependencies [da86b9a]
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
- Updated dependencies [d24741b]
- Updated dependencies [d6ac2f8]
- Updated dependencies [9957f42]
- Updated dependencies [0a245df]
- Updated dependencies [15cec09]
- Updated dependencies [b554bb4]
- Updated dependencies [28111cb]
- Updated dependencies [281ecbd]
- Updated dependencies [7ea1f91]
- Updated dependencies [1f0e84e]
- Updated dependencies [ba18c96]
- Updated dependencies [51de911]
- Updated dependencies [8c72d30]
- Updated dependencies [e9022ab]
- Updated dependencies [f85bc88]
- Updated dependencies [8788569]
- Updated dependencies [8e0c72f]
- Updated dependencies [32be204]
- Updated dependencies [637030d]
- Updated dependencies [70ffb60]
- Updated dependencies [d88b421]
- Updated dependencies [3b284ac]
- Updated dependencies [f459728]
- Updated dependencies [302367d]
- Updated dependencies [3bd1372]
- Updated dependencies [41ba097]
- Updated dependencies [0cb1421]
- Updated dependencies [5a51d3b]
- Updated dependencies [7ac550a]
- Updated dependencies [425055f]
- Updated dependencies [77c1cf0]
- Updated dependencies [831ad4b]
- Updated dependencies [788ef0d]
- Updated dependencies [7b54df0]
- Updated dependencies [48cd6be]
- Updated dependencies [6803178]
- Updated dependencies [c82e576]
- Updated dependencies [77dcd60]
- Updated dependencies [32aaa4b]
- Updated dependencies [c296f5b]
- Updated dependencies [4e94632]
- Updated dependencies [98f5d6c]
- Updated dependencies [478ae25]
- Updated dependencies [2f6efe1]
- Updated dependencies [55f201e]
- Updated dependencies [01b7cee]
- Updated dependencies [9e1fcba]
- Updated dependencies [aca1f46]
- Updated dependencies [e3a1abf]
- Updated dependencies [01b7cee]
- Updated dependencies [db3b832]
- Updated dependencies [4798c02]
- Updated dependencies [4cb9a17]
- Updated dependencies [5e71240]
- Updated dependencies [b4e1194]
- Updated dependencies [8008b64]
- Updated dependencies [1bdd5e1]
- Updated dependencies [e4f26da]
- Updated dependencies [4de2e16]
- Updated dependencies [e64e993]
- Updated dependencies [6d9ae73]
- Updated dependencies [dc7e399]
- Updated dependencies [5ca5241]
- Updated dependencies [672d5e5]
- Updated dependencies [672d5e5]
- Updated dependencies [5f4e718]
- Updated dependencies [ef0a065]
- Updated dependencies [3cef1d4]
- Updated dependencies [50da8b8]
- Updated dependencies [0ea1271]
- Updated dependencies [01b7cee]
- Updated dependencies [34e51cb]
- Updated dependencies [34e51cb]
- Updated dependencies [cd822fa]
- Updated dependencies [2e439f7]
- Updated dependencies [87113ae]
- Updated dependencies [29c35c2]
- Updated dependencies [b81637f]
- Updated dependencies [44c1a37]
- Updated dependencies [470fd59]
- Updated dependencies [6e3efc5]
- Updated dependencies [43f2efd]
- Updated dependencies [5f3f4b0]
- Updated dependencies [445390b]
- Updated dependencies [5248460]
- Updated dependencies [7e136ff]
- Updated dependencies [afda9e9]
- Updated dependencies [6caf496]
- Updated dependencies [2d81267]
- Updated dependencies [27cdf8c]
- Updated dependencies [01b7cee]
- Updated dependencies [672d5e5]
- Updated dependencies [32a4ef8]
- Updated dependencies [f4adb60]
- Updated dependencies [0cb1421]
- Updated dependencies [3bd1372]
- Updated dependencies [c56b4cc]
- Updated dependencies [a2039e8]
- Updated dependencies [3b2d1aa]
- Updated dependencies [0854838]
- Updated dependencies [ae6b2a0]
- Updated dependencies [e5473e5]
- Updated dependencies [6e3efc5]
- Updated dependencies [bc8c616]
- Updated dependencies [6c777cc]
- Updated dependencies [cc2e25e]
- Updated dependencies [d54ddce]
- Updated dependencies [81e7767]
- Updated dependencies [d0e13b5]
- Updated dependencies [fe80e51]
- Updated dependencies [02bbab2]
- Updated dependencies [c006f57]
- Updated dependencies [447d24d]
- Updated dependencies [01b7cee]
  - @lincyaw/kernel@1.0.0-rc.1
  - @lincyaw/design@1.0.0-rc.1
